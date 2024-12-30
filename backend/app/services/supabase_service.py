from supabase import create_client
from typing import Dict, List, Optional
import logging
from app.config import settings

logger = logging.getLogger(__name__)

class SupabaseService:
    def __init__(self):
        self.client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY
        )

    async def store_document(self, metadata: Dict) -> Dict:
        """Store initial document metadata"""
        try:
            data = {
                'chat_id': metadata['chat_id'],
                'name': metadata['name'],
                'file_path': f"pdfs/{metadata['chat_id']}/{metadata['name']}",
                'upload_date': 'NOW()',
                'processing_status': 'processing'
            }
            result = self.client.table('documents').insert(data).execute()
            return result.data[0]
        except Exception as e:
            logger.error(f"Error storing document: {str(e)}")
            raise

    async def update_document(self, document_id: int, updates: Dict):
        """Update document metadata"""
        try:
            self.client.table('documents')\
                .update(updates)\
                .eq('id', document_id)\
                .execute()
        except Exception as e:
            logger.error(f"Error updating document: {str(e)}")
            raise

    async def store_chunks(self, chunks: List[Dict]) -> List[Dict]:
        """Store document chunks with embeddings"""
        try:
            if chunks:
                result = self.client.table('chunks').insert(chunks).execute()
                return result.data
            return []
        except Exception as e:
            logger.error(f"Error storing chunks: {str(e)}")
            raise

    async def find_similar_chunks(
        self,
        embedding: List[float],
        chat_id: Optional[str] = None,
        document_ids: Optional[List[int]] = None,
        threshold: float = 0.7,
        limit: int = 5
    ) -> List[Dict]:
        """Find similar chunks using vector similarity"""
        try:
            params = {
                'query_embedding': embedding,
                'similarity_threshold': threshold,
                'match_count': limit
            }
            if document_ids:
                params['filter_document_ids'] = document_ids
            
            result = self.client.rpc('match_documents', params).execute()
            return result.data
        except Exception as e:
            logger.error(f"Error finding similar chunks: {str(e)}")
            raise

    async def store_query(self, chat_id: str, query_text: str, response_text: str, source_references: List[Dict]):
        """Store query and response"""
        try:
            data = {
                'chat_id': chat_id,
                'query_text': query_text,
                'response_text': response_text,
                'source_references': source_references,
                'timestamp': 'NOW()'
            }
            result = self.client.table('queries').insert(data).execute()
            return result.data[0]
        except Exception as e:
            logger.error(f"Error storing query: {str(e)}")
            raise

    async def get_document_metadata(self, document_id: int) -> Dict:
        """Get document metadata"""
        try:
            result = self.client.table('documents')\
                .select('*')\
                .eq('id', document_id)\
                .single()\
                .execute()
            return result.data
        except Exception as e:
            logger.error(f"Error getting document metadata: {str(e)}")
            raise

    async def get_chat_documents(self, chat_id: str) -> List[Dict]:
        """Get all documents for a chat"""
        try:
            result = self.client.table('documents')\
                .select('*')\
                .eq('chat_id', chat_id)\
                .execute()
            return result.data
        except Exception as e:
            logger.error(f"Error getting chat documents: {str(e)}")
            raise