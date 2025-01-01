from typing import Dict, List, Optional
from fastapi import UploadFile
from .document_extractor import DocumentExtractor 
from .gemini_service import GeminiService
from .supabase_service import SupabaseService
from ..config import Settings
import logging
import asyncio
import httpx
from io import BytesIO

logger = logging.getLogger(__name__)

class ServiceIntegrator:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.gemini = GeminiService(settings)
        self.supabase = SupabaseService()
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
        """Process single document from storage path"""
        logger.info(f"Processing document {doc_id} from chat {chat_id}")
        try:
            # Update initial status
            await self.supabase.update_document(doc_id, {
                'processing_status': 'processing'
            })
            
            try:
                # Download file
                file = await self.download_file(file_path)
                
                # Extract content
                extracted_content = await self.document_extractor.process_file(file)
                
                # Process chunks and generate embeddings
                chunks = []
                chunk_index = 0
                
                # Process tables
                for table in extracted_content.get('tables', []):
                    embedding = await self.gemini.generate_embedding(table['text'])
                    chunks.append({
                        'document_id': doc_id,
                        'chunk_index': chunk_index,
                        'chunk_type': 'table',
                        'text': table['text'],
                        'page_number': table['page_number'],
                        'table_data': table['table_data'],  # Already JSON string from document_extractor
                        'embedding': embedding
                    })
                    chunk_index += 1
                
                # Process text chunks
                for text_chunk in extracted_content.get('text_chunks', []):
                    embedding = await self.gemini.generate_embedding(text_chunk['text'])
                    chunks.append({
                        'document_id': doc_id,
                        'chunk_index': chunk_index,
                        'chunk_type': 'text',
                        'text': text_chunk['text'],
                        'page_number': text_chunk['page_number'],
                        'table_data': None,
                        'embedding': embedding
                    })
                    chunk_index += 1

                # Store chunks
                if chunks:
                    logger.info(f"Storing {len(chunks)} chunks for document {doc_id}")
                    await self.supabase.store_chunks(doc_id, chunks) 

                # Update document metadata
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
        """Query processed documents"""
        try:
            # Generate query embedding
            query_embedding = await self.gemini.generate_embedding(query)
            
            # Find similar chunks
            raw_chunks = await self.supabase.find_similar_chunks(
                embedding=query_embedding,
                chat_id=chat_id,
                document_ids=document_ids
            )
            
            # Format chunks for Gemini
            formatted_chunks = []
            for chunk in raw_chunks:
                formatted_chunk = {
                    'document_id': chunk['document_id'],
                    'document_name': chunk['document_name'],  # Now available from SQL
                    'page_number': chunk['page_number'],
                    'chunk_type': chunk['chunk_type'],
                    'text': chunk['text'],
                    'table_data': chunk.get('table_data'),
                    'similarity': chunk['similarity']
                }
                formatted_chunks.append(formatted_chunk)
            
            # Generate response with formatted chunks
            response = await self.gemini.generate_response(query, formatted_chunks)
            
            # Store query and response
            await self.supabase.store_query(
                chat_id=chat_id,
                query_text=query,
                response_text=response,
                source_references=formatted_chunks
            )
            
            return {
                'response': response,
                'source_references': formatted_chunks
            }
            
        except Exception as e:
            logger.error(f"Error in query processing: {str(e)}")
            raise