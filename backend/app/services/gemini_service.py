import google.generativeai as genai
import logging
from ..config import Settings
from typing import List, Dict
import asyncio
from functools import partial
import json

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self, settings: Settings):
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        self.model = genai.GenerativeModel('gemini-pro')

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embeddings for text asynchronously"""
        try:
            # Run the synchronous embedding generation in a thread pool
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                partial(genai.embed_content, 
                    model="models/text-embedding-004", 
                    content=text)
            )
            
            if isinstance(result, dict) and 'embedding' in result:
                return result['embedding']
                
            raise ValueError(f"Unexpected embedding structure: {result}")
            
        except Exception as e:
            logger.error(f"Error generating embedding: {str(e)}")
            raise

    async def generate_response(self, query: str, source_references: List[Dict]) -> str:
        try:
            context_parts = []
            for ref in source_references:
                source = f"From {ref['document_name']} (Page {ref['page_number']}):"
                
                if ref.get('table_data'):
                    try:
                        table_info = json.loads(ref['table_data'])
                        if table_info.get('html'):
                            context_parts.append(f"{source}\n{table_info['html']}")
                        else:
                            context_parts.append(f"{source}\n{table_info['text']}")
                    except json.JSONDecodeError:
                        context_parts.append(f"{source}\n{ref['text']}")
                else:
                    context_parts.append(f"{source}\n{ref['text']}")

            context = "\n\n".join(context_parts)
            
            prompt = f"""Based on the following excerpts from documents, answer the user's question.
            When referring to specific numbers or data from tables, use the formatted table data.

            Context:
            {context}

            Question: {query}"""

            # Run the synchronous generate_content in a thread pool
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.model.generate_content(prompt).text
            )
            
            return response
                
        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            raise