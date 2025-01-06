from typing import Dict, List, Optional
from fastapi import UploadFile
from .document_extractor import DocumentExtractor 
from .gemini_service import GeminiService
from .supabase_service import SupabaseService
from ..config import Settings
import logging
import asyncio
import httpx
import json
from io import BytesIO

logger = logging.getLogger(__name__)

class ServiceIntegrator:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.supabase = SupabaseService()
        self.gemini = GeminiService(settings, self.supabase)
        self.document_extractor = DocumentExtractor(settings)
        
    async def download_file(self, file_path: str) -> UploadFile:
        """Download file from Supabase storage"""
        try:
            storage_path = file_path
            logger.info(f"Getting signed URL for: {storage_path}")
            
            # Get signed URL
            result = self.supabase.client.storage \
                .from_('pdfs') \
                .create_signed_url(storage_path, 60)

            if 'signedURL' not in result:
                raise ValueError(f"Invalid signed URL response: {result}")

            # Download file using signed URL
            async with httpx.AsyncClient() as client:
                response = await client.get(result['signedURL'])
                response.raise_for_status()
                
                return UploadFile(
                    filename=storage_path.split('/')[-1],
                    file=BytesIO(response.content)
                )
                    
        except Exception as e:
            logger.error(f"Error downloading file {file_path}: {str(e)}")
            raise

    async def process_document(self, doc_id: int, file_path: str, chat_id: str) -> Dict:
        """Process single document from storage path using natural document order"""
        logger.info(f"Processing document {doc_id} from chat {chat_id}")
        try:
            await self.supabase.update_document(doc_id, {
                'processing_status': 'processing'
            })
            
            try:
                file = await self.download_file(file_path)
                extracted_content = await self.document_extractor.process_file(file)
                
                chunks = []

                for chunk_index, element in enumerate(extracted_content.get('elements', [])):
                    embedding = await self.gemini.generate_embedding(element['text'])
                    
                    chunks.append({
                        'document_id': doc_id,
                        'chunk_index': chunk_index,
                        'chunk_type': element['chunk_type'],
                        'text': element['text'],
                        'page_number': element['page_number'],
                        'table_data': element['table_data'],
                        'embedding': embedding
                    })

                if chunks:
                    logger.info(f"Storing {len(chunks)} chunks for document {doc_id}")
                    await self.supabase.store_chunks(doc_id, chunks)

                await self.supabase.update_document(doc_id, {
                    'page_count': extracted_content['metadata']['total_pages'],
                    'processing_status': 'completed'
                })

                return {
                    'document_id': doc_id,
                    'chat_id': chat_id,
                    'chunks_processed': len(chunks),
                    'page_count': extracted_content['metadata']['total_pages'],
                    'status': 'success'
                }
                    
            except Exception as e:
                logger.error(f"Error processing document {doc_id} in chat {chat_id}: {str(e)}")
                await self.supabase.update_document(doc_id, {
                    'processing_status': 'failed'
                })
                raise

        except Exception as e:
            logger.error(f"Error in document processing for chat {chat_id}: {str(e)}")
            raise

    async def process_documents(self, chat_id: str, documents: List[Dict]) -> List[Dict]:
        """Process multiple documents with controlled concurrency"""
        semaphore = asyncio.Semaphore(3)  # Process up to 3 files simultaneously
        
        async def process_with_semaphore(doc):
            async with semaphore:
                try:
                    return await self.process_document(
                        doc_id=doc['id'],
                        file_path=doc['file_path'],
                        chat_id=chat_id
                    )
                except Exception as e:
                    logger.error(f"Error processing document {doc['id']}: {str(e)}")
                    return {
                        'document_id': doc['id'],
                        'status': 'error',
                        'error': str(e)
                    }

        try:
            tasks = [process_with_semaphore(doc) for doc in documents]
            results = await asyncio.gather(*tasks)
            return results
            
        except Exception as e:
            logger.error(f"Error in batch processing: {str(e)}")
            raise

    async def query_documents(
        self,
        query: str,
        chat_id: str,
        document_ids: Optional[List[int]] = None
    ) -> Dict:
        try:
            # Generate query embedding
            query_embedding = await self.gemini.generate_embedding(query)
            
            # Find similar chunks with adjusted threshold
            chunks = await self.supabase.find_similar_chunks(
                embedding=query_embedding,
                chat_id=chat_id,
                document_ids=document_ids,
                threshold=0.35,  
                limit=5  # Get more context
            )
            logger.info(f"Found chunks: {json.dumps(chunks, indent=2)}")
            # Generate response with enhanced formatting
            response = await self.gemini.generate_response(query, chunks)

            await self.supabase.store_query(
                chat_id=chat_id,
                query_text=query,
                response_text=response,
                source_references=chunks
            )
            
            
            return {
                'response': response,
                'source_references': chunks
            }
            
        except Exception as e:
            logger.error(f"Error in query processing: {str(e)}")
            raise