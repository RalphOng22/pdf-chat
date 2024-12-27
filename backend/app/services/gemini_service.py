import google.generativeai as genai
import logging
from ..config import Settings
from typing import List, Dict

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self, settings: Settings):
        genai.configure(api_key=settings.GOOGLE_API_KEY)

    def generate_embedding(self, text: str) -> List[float]:
        """Generate embeddings for text"""
        try:
            result = genai.embed_content(model="models/text-embedding-004", content=text)
            if not result or 'embedding' not in result:
                raise ValueError("Failed to generate embedding")
            return result['embedding']['values']
        except Exception as e:
            logger.error(f"Error generating embedding: {str(e)}")
            raise

    def generate_response(
        self,
        query: str,
        source_references: List[Dict]
    ) -> str:
        """Generate a response using the provided source references"""
        try:
            # Format context from source references
            context_parts = []
            for ref in source_references:
                source = f"From {ref['document_name']} (Page {ref['page_number']}):"
                context_parts.append(f"{source}\n{ref['text']}")

            context = "\n\n".join(context_parts)

            prompt = f"""Based on the following excerpts from financial documents, answer the user's question.
            When referring to specific numbers or data, mention which document and page they come from.

            Context:
            {context}

            Question: {query}"""

            result = genai.generate_text(prompt=prompt)
            return result.result
        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            raise
