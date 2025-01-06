from supabase import create_client
from typing import Dict, List, Optional
import logging
from app.config import settings
import json

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

    async def store_chunks(self, document_id: int, chunks: List[Dict]) -> List[Dict]:
        """Store document chunks with embeddings"""
        try:
            formatted_chunks = []
            for idx, chunk in enumerate(chunks):
                # Ensure table_data is properly JSON encoded if present
                table_data = None
                if chunk.get("table_data"):
                    if isinstance(chunk["table_data"], str):
                        # If it's already a JSON string, verify it's valid
                        try:
                            json.loads(chunk["table_data"])
                            table_data = chunk["table_data"]
                        except json.JSONDecodeError:
                            table_data = json.dumps(chunk["table_data"])
                    else:
                        # If it's a dict/object, convert to JSON string
                        table_data = json.dumps(chunk["table_data"])

                formatted_chunk = {
                    "document_id": document_id,
                    "chunk_index": idx,
                    "chunk_type": chunk["chunk_type"],
                    "text": chunk["text"],
                    "page_number": chunk["page_number"],
                    "table_data": table_data,
                    # Make sure embedding is included
                    "embedding": chunk.get("embedding")
                }
                formatted_chunks.append(formatted_chunk)

            if formatted_chunks:
                result = self.client.table('chunks').insert(
                    formatted_chunks).execute()
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
        threshold: float = 0.3,  # Increased from default for more precise matches
        limit: int = 10  # Increased to ensure we get full context
    ) -> List[Dict]:
        """Find similar chunks using vector similarity"""
        try:
            params = {
                'query_embedding': embedding,
                'similarity_threshold': threshold,
                'match_count': limit,
                'filter_document_ids': document_ids if document_ids else None
            }
            logger.info(f"""
            Searching with params:
            Threshold: {threshold}
            Query embedding length: {len(embedding)}
            Doc IDs filter: {document_ids}
            """)
            result = self.client.rpc('match_documents', params).execute()
            return result.data
        except Exception as e:
            logger.error(f"Error finding similar chunks: {str(e)}")
            raise

    async def store_query(self, chat_id: str, query_text: str, response_text: str, source_references: List[Dict]):
        """Store query and response"""
        try:
            processed_references = []
            for ref in source_references:
                processed_ref = {
                    'document_id': int(ref.get('document_id')),
                    'document_name': str(ref.get('document_name')),
                    'page_number': int(ref.get('page_number')),
                    'text': str(ref.get('text')),
                    'chunk_type': str(ref.get('chunk_type', 'text')),
                    'similarity': float(ref.get('similarity', 0.0))
                }

                # Handle table_data properly
                if 'table_data' in ref and ref['table_data']:
                    if isinstance(ref['table_data'], str):
                        try:
                            # Verify it's valid JSON if it's a string
                            json.loads(ref['table_data'])
                            processed_ref['table_data'] = ref['table_data']
                        except json.JSONDecodeError:
                            processed_ref['table_data'] = json.dumps(
                                ref['table_data'])
                    else:
                        processed_ref['table_data'] = json.dumps(
                            ref['table_data'])

                processed_references.append(processed_ref)

            data = {
                'chat_id': str(chat_id),
                'query_text': query_text,
                'response_text': response_text,
                'source_references': processed_references,
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
