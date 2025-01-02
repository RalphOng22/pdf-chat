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
                        # Ensure table_data is properly parsed
                        if isinstance(ref['table_data'], str):
                            table_data = json.loads(ref['table_data'])
                        else:
                            table_data = ref['table_data']
                        
                        # Include both text and HTML representation
                        context_parts.append(
                            f"{source}\n"
                            f"Table Text: {table_data.get('text', '')}\n"
                            f"Table Structure: {table_data.get('html', '')}"
                        )
                    except json.JSONDecodeError:
                        context_parts.append(f"{source}\n{ref['text']}")
                else:
                    context_parts.append(f"{source}\n{ref['text']}")

            logger.info(f"Source references received: {json.dumps(source_references, indent=2)}")

            prompt = (
                "You are analyzing financial statements from official company documents. "
                "When analyzing financial statements:\n"
                "1. Maintain the original structure and hierarchy\n"
                "2. Break down into Operating, Investing, and Financing Activities\n"
                "3. Show all time periods in columns (Three/Nine/Twelve Months Ended)\n"
                "4. Format numbers with $ prefix, commas, and parentheses for negatives\n"
                "5. Preserve all subtotals and totals\n"
                "6. Include relevant notes\n\n"
                "Context:\n"
                "{}\n\n"
                "Question: {}"
            ).format('\n\n'.join(context_parts), query)
            
            logger.info(f"Generated prompt: {prompt}")
            result = await self._generate_response(prompt)
        
            return result
                
        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            raise

    async def _generate_response(self, prompt: str) -> str:
        """Generate response using Gemini model"""
        try:
            # Run the synchronous generate_content in a thread pool
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.model.generate_content(prompt)
            )
            
            return response.text
            
        except Exception as e:
            logger.error(f"Error in _generate_response: {str(e)}")
            raise