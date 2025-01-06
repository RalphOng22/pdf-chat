import google.generativeai as genai
import logging
from ..config import Settings
from .supabase_service import SupabaseService
from typing import List, Dict
import asyncio
from functools import partial
import json
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

class GeminiService:
    def __init__(self, settings: Settings, supabase_service: SupabaseService):
        genai.configure(api_key=settings.GOOGLE_API_KEY)
        self.model = genai.GenerativeModel('gemini-pro')
        self.supabase = supabase_service.client

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embeddings for text asynchronously"""
        try:
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
            # Find text chunk with highest similarity score
            best_match = None
            best_match_index = -1
            highest_similarity = -1
            
            for i, chunk in enumerate(source_references):
                if chunk['chunk_type'] == 'text':
                    similarity = chunk.get('similarity', 0)
                    if similarity > highest_similarity:
                        highest_similarity = similarity
                        best_match = chunk
                        best_match_index = i
            
            if best_match is None:
                raise ValueError(f"Could not find relevant section for: {query}")
                
            # Get chunk index from best match
            chunk_index = best_match.get('chunk_index')
            document_id = best_match.get('document_id')
            page_number = best_match.get('page_number')
            window_size = 5
            
            # Query Supabase for nearby chunks from same document and page
            window_chunks = self.supabase.table('chunks').select('*')\
                .eq('document_id', document_id)\
                .eq('page_number', page_number)\
                .gte('chunk_index', chunk_index - window_size)\
                .lte('chunk_index', chunk_index + window_size)\
                .execute()
            
            # Find nearest table on same page
            nearest_table = None
            for chunk in window_chunks.data:
                if (chunk['chunk_type'] == 'table' and 
                    chunk['page_number'] == best_match['page_number']):
                    nearest_table = chunk
                    break
            logger.info(f"Nearest table: {chunk}")
            if nearest_table is None:
                raise ValueError("No relevant tables found near the matching section")

            try:
                table_data = json.loads(nearest_table['table_data'])
                logger.info(f"Table data: {table_data['html']}")
                
                # Generate a more flexible prompt focused on financial data structure
                prompt = (
                    f"You are analyzing a financial statement table. Context: {best_match['text']}\n\n"
                    f"Table HTML: {table_data['html']}\n\n"
                    "Convert this financial data to JSON following these guidelines:\n"
                    "1. Identify the financial statement type (Balance Sheet, Income Statement, Cash Flow, etc)\n"
                    "2. Preserve the hierarchical structure of the financial statement\n"
                    "3. Include all time periods/columns as separate data points\n"
                    "4. Maintain parent-child relationships between line items\n"
                    "5. Keep subtotals and totals separate from individual line items\n"
                    "6. Parse numerical values consistently, handling negatives in parentheses\n"
                    "7. Preserve any relevant notes or references\n\n"
                    "Return a clean, structured JSON with at minimum:\n"
                    "- statement_type: type of financial statement\n"
                    "- periods: array of time periods\n"
                    "- line_items: array of entries with name, values, and any parent/child relationships\n"
                    "- subtotals: identified subtotal sections\n"
                    "Only return valid JSON, no other text."
                )
                
                return await self._generate_response(prompt)
                    
            except json.JSONDecodeError:
                raise ValueError("Failed to parse table data")

        except Exception as e:
            logger.error(f"Error generating response: {str(e)}")
            raise

    def _parse_table_html(self, html: str) -> Dict:
        """Parse HTML table into structured data"""
        try:
            soup = BeautifulSoup(html, 'html.parser')
            table = soup.find('table')
            if not table:
                raise ValueError("No table found in HTML content")

            # Extract headers (handling colspan)
            headers = []
            for row in table.find_all('tr')[:3]:  # First three rows usually contain headers
                row_headers = []
                for cell in row.find_all(['th', 'td']):
                    colspan = int(cell.get('colspan', 1))
                    text = cell.get_text(strip=True)
                    row_headers.extend([text] * colspan)
                if any(row_headers):  # Only add non-empty header rows
                    headers.append(row_headers)

            # Process data rows
            data_rows = []
            for row in table.find_all('tr')[3:]:  # Skip header rows
                cells = row.find_all(['th', 'td'])
                if not cells:
                    continue

                row_data = []
                for cell in cells:
                    colspan = int(cell.get('colspan', 1))
                    text = cell.get_text(strip=True)
                    row_data.extend([text] * colspan)
                    
                if row_data and any(row_data):  # Skip empty rows
                    data_rows.append(row_data)

            return {
                "headers": headers,
                "rows": data_rows
            }
        except Exception as e:
            logger.error(f"Error parsing table HTML: {str(e)}")
            raise

    async def _generate_response(self, prompt: str) -> str:
        """Generate response using Gemini model"""
        try:
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.model.generate_content(prompt)
            )
            return response.text
        except Exception as e:
            logger.error(f"Error in _generate_response: {str(e)}")
            raise