from unstructured_client import UnstructuredClient
from typing import Dict, List, Optional, Any
import logging
from fastapi import UploadFile
from ..config import Settings
import json

logger = logging.getLogger(__name__)

class DocumentExtractor:
    def __init__(self, settings: Settings):
        self.client = UnstructuredClient(
            api_key_auth=settings.UNSTRUCTURED_API_KEY,
            server_url=settings.UNSTRUCTURED_API_URL
        )

    def _clean_text(self, text: str) -> str:
        """Clean and normalize text content"""
        if not text:
            return ""
        # Remove excessive whitespace
        text = " ".join(text.split())
        return text.strip()

    def _extract_table_data(self, element: Dict[str, Any]) -> Dict[str, Any]:
        """Extract and format table data"""
        try:
            # Get the raw table data
            table_data = element.get('metadata', {}).get('table_data', {})
            
            # Extract headers and data
            headers = table_data.get('headers', [])
            rows = table_data.get('data', [])
            
            # Clean and format the data
            cleaned_headers = [str(h).strip() for h in headers if h]
            cleaned_rows = []
            for row in rows:
                cleaned_row = {}
                for header, value in zip(cleaned_headers, row):
                    cleaned_row[header] = str(value).strip() if value is not None else ""
                cleaned_rows.append(cleaned_row)
            
            return {
                'text': self._clean_text(element.get('text', '')),
                'page_number': element.get('metadata', {}).get('page_number', 1),
                'data': {
                    'headers': cleaned_headers,
                    'data': cleaned_rows
                }
            }
        except Exception as e:
            logger.error(f"Error processing table data: {str(e)}")
            return {
                'text': self._clean_text(element.get('text', '')),
                'page_number': element.get('metadata', {}).get('page_number', 1),
                'data': {
                    'headers': [],
                    'data': []
                }
            }

    def _process_response(self, response: List[Dict], filename: str) -> Dict:
        """Process the response from unstructured API"""
        text_chunks = []
        tables = []
        total_pages = 0

        try:
            for element in response:
                # Get page number with fallback
                page_number = element.get('metadata', {}).get('page_number', 1)
                total_pages = max(total_pages, page_number)
                
                element_type = element.get('type', '').lower()
                
                if element_type == 'table':
                    tables.append(self._extract_table_data(element))
                elif element_type in ['text', 'title', 'narrative_text']:
                    # Only include non-empty text chunks
                    cleaned_text = self._clean_text(element.get('text', ''))
                    if cleaned_text:
                        text_chunks.append({
                            'text': cleaned_text,
                            'page_number': page_number
                        })

            return {
                'text_chunks': text_chunks,
                'tables': tables,
                'metadata': {
                    'filename': filename,
                    'total_pages': total_pages,
                    'chunk_count': len(text_chunks) + len(tables)
                }
            }
            
        except Exception as e:
            logger.error(f"Error processing response for {filename}: {str(e)}")
            raise

    async def process_file(self, file: UploadFile) -> Dict:
        """Process single PDF file using unstructured API"""
        try:
            content = await file.read()
            
            # Configure unstructured.io API parameters
            response = await self.client.partition(
                files={"file": (file.filename, content, "application/pdf")},
                strategy="hi_res",
                combine_text_under_n_chars=0,  # Don't combine any text
                include_page_breaks=True,
                include_table_data=True,  # Ensure we get table data
                output_format="json"
            )
            
            processed_result = self._process_response(response, file.filename)
            
            # Log processing metrics
            logger.info(
                f"Processed {file.filename}: "
                f"{len(processed_result['text_chunks'])} text chunks, "
                f"{len(processed_result['tables'])} tables, "
                f"{processed_result['metadata']['total_pages']} pages"
            )
            
            return processed_result
            
        except Exception as e:
            logger.error(f"Error processing file {file.filename}: {str(e)}")
            raise

    async def process_files(self, files: List[UploadFile]) -> List[Dict]:
        """Process multiple files"""
        try:
            results = []
            for file in files:
                result = await self.process_file(file)
                results.append({
                    'filename': file.filename,
                    'results': result
                })
            return results
            
        except Exception as e:
            logger.error(f"Error processing multiple files: {str(e)}")
            raise