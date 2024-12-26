import google.generativeai as genai
import logging
from ..config import Settings
from typing import List, Dict, Any


logger = logging.getLogger(__name__)


class GeminiService:
    def __init__(self, settings: Settings):
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        self.model = genai.GenerativeModel('gemini-pro')
        self.embedding_model = genai.GenerativeModel('text-embedding-004')

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embeddings for text"""
        try:
            result = await self.embedding_model.embed_content(text)
            if not result or not hasattr(result, 'embedding'):
                raise ValueError("Failed to generate embedding")
            return result.embedding.values
        except Exception as e:
            logger.error(f"Error generating embedding: {str(e)}")
            raise

    async def generate_response(
        self,
        query: str,
        source_references: List[Dict]  # Changed from List[SourceReference]
    ) -> str:
        """Generate a response using the provided source references"""
        try:
            # Format context from source references
            context_parts = []
            for ref in source_references:
                source = f"From {ref['document_name']} (Page {ref['page_number']}):"
                if ref['chunk_type'] == "table":
                    # Format table data
                    table_data = ref.get('table_data', {})
                    context_parts.append(f"{source}\n{ref['text']}")
                else:
                    # Format text content
                    context_parts.append(f"{source}\n{ref['text']}")

            context = "\n\n".join(context_parts)

            prompt = f"""Based on the following excerpts from financial documents, answer the user's question.
            When referring to specific numbers or data, mention which document and page they come from.

            Context:
            {context}

            Question: {query}"""

            result = await self.model.generate_content(prompt)
            return result.text

        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            raise
