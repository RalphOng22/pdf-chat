from typing import Dict, List, Optional
from fastapi import UploadFile
from .document_extractor import DocumentExtractor 
from .gemini_service import GeminiService
from .supabase_service import SupabaseService
from ..config import settings
import logging
import asyncio

logger = logging.getLogger(__name__)

class ServiceIntegrator:
    def __init__(self):
        self.gemini = GeminiService()
        self.supabase = SupabaseService()
        self.document_extractor = DocumentExtractor()
        
    async def process_document(self, file: UploadFile, chat_id: str) -> Dict:
        """Process single document end-to-end"""
        try:
            # Store document metadata
            document = await self.supabase.store_document({
                'chat_id': chat_id,
                'name': file.filename,
                'processing_status': 'processing'
            })
            
            # Extract content using unstructured.io
            extracted_content = await self.document_extractor.process_file(file)
            
            # Process tables and text chunks
            chunks = []
            chunk_index = 0
            
            # Process tables
            for table in extracted_content['tables']:
                embedding = await self.gemini.generate_embedding(str(table['text']))
                chunks.append({
                    'document_id': document['id'],
                    'chunk_index': chunk_index,
                    'chunk_type': 'table',
                    'text': table['text'],
                    'page_number': table['page_number'],
                    'table_data': table['data'],
                    'embedding': embedding
                })
                chunk_index += 1
            
            # Process text chunks
            for text_chunk in extracted_content['text_chunks']:
                embedding = await self.gemini.generate_embedding(text_chunk['text'])
                chunks.append({
                    'document_id': document['id'],
                    'chunk_index': chunk_index,
                    'chunk_type': 'text',
                    'text': text_chunk['text'],
                    'page_number': text_chunk['page_number'],
                    'table_data': None,
                    'embedding': embedding
                })
                chunk_index += 1

            # Store all chunks
            if chunks:
                await self.supabase.store_chunks(chunks)

            # Update document metadata
            await self.supabase.update_document(document['id'], {
                'page_count': extracted_content['metadata']['total_pages'],
                'processing_status': 'completed'
            })

            return {
                'document_id': document['id'],
                'chunks_processed': len(chunks),
                'page_count': extracted_content['metadata']['total_pages'],
                'status': 'success'
            }
            
        except Exception as e:
            logger.error(f"Error in document processing: {str(e)}")
            if 'document' in locals():
                await self.supabase.update_document(document['id'], {
                    'processing_status': 'failed'
                })
            raise

    async def process_documents(self, files: List[UploadFile], chat_id: str) -> List[Dict]:
        """Process multiple documents with controlled concurrency"""
        semaphore = asyncio.Semaphore(3)  # Process up to 3 files simultaneously
        
        async def process_with_semaphore(file):
            async with semaphore:
                return await self.process_document(file, chat_id)

        try:
            tasks = [process_with_semaphore(file) for file in files]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            processed_results = []
            for file, result in zip(files, results):
                if isinstance(result, Exception):
                    processed_results.append({
                        'filename': file.filename,
                        'status': 'error',
                        'error': str(result)
                    })
                else:
                    processed_results.append({
                        'filename': file.filename,
                        'status': 'success',
                        **result
                    })
            
            return processed_results
            
        except Exception as e:
            logger.error(f"Error in batch processing: {str(e)}")
            raise

    async def query_documents(
        self, 
        query: str,
        chat_id: str,
        document_ids: Optional[List[int]] = None
    ) -> Dict:
        """Query processed documents"""
        try:
            # Generate query embedding
            query_embedding = await self.gemini.generate_embedding(query)
            
            # Find similar chunks
            chunks = await self.supabase.find_similar_chunks(
                embedding=query_embedding,
                chat_id=chat_id,
                document_ids=document_ids
            )
            
            # Generate response
            response = await self.gemini.generate_response(query, chunks)
            
            # Store query and response
            await self.supabase.store_query(
                chat_id=chat_id,
                query_text=query,
                response_text=response,
                source_references=chunks
            )
            
            return {
                'response': response,
                'sources': chunks
            }
            
        except Exception as e:
            logger.error(f"Error in query processing: {str(e)}")
            raise