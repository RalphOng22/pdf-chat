import os
import json
import logging
from typing import Dict, List, Any
from ..config import Settings
from fastapi import UploadFile
import asyncio
from unstructured_client import UnstructuredClient
from unstructured_client.models.shared import Strategy

logger = logging.getLogger(__name__)

class DocumentExtractor:
    def __init__(self, settings: Settings):
        self.api_key = settings.UNSTRUCTURED_API_KEY
        self.api_url = settings.UNSTRUCTURED_API_URL
        self.client = UnstructuredClient(
            api_key_auth=self.api_key,
            server_url=self.api_url
        )

    def _clean_text(self, text: str) -> str:
        """Clean and normalize text content."""
        return " ".join(text.split()).strip() if text else ""

    def _process_response(self, response_elements: List[Dict], filename: str) -> Dict:
        """Process the response from Unstructured API."""
        text_chunks = []
        tables = []
        total_pages = 0

        for element in response_elements:
            page_number = element.get("metadata", {}).get("page_number", 1)
            total_pages = max(total_pages, page_number)
            element_type = element.get("type", "").lower()

            if element_type == "table":
                # Get both raw text and HTML representation
                text = self._clean_text(element.get("text", ""))
                html = element.get("metadata", {}).get("text_as_html", "")
                
                # Create table data structure
                table_data = {
                    "text": text,
                    "html": html,
                    "page_number": page_number
                }
                
                tables.append({
                    "text": text,
                    "page_number": page_number,
                    "chunk_type": "table",
                    "table_data": json.dumps(table_data)  # Store as JSON string for database
                })
            elif element_type in ["text", "title", "narrative_text"]:
                cleaned_text = self._clean_text(element.get("text", ""))
                if cleaned_text:
                    text_chunks.append({
                        "text": cleaned_text, 
                        "page_number": page_number,
                        "chunk_type": "text",
                        "table_data": None
                    })

        return {
            "text_chunks": text_chunks,
            "tables": tables,
            "metadata": {
                "filename": filename,
                "total_pages": total_pages,
                "chunk_count": len(text_chunks) + len(tables),
            },
        }

    async def process_file(self, file: UploadFile) -> Dict:
        """Process a single PDF file asynchronously using Unstructured API."""
        try:
            content = await file.read()
            logger.info(f"Processing file {file.filename} with Unstructured API SDK (async)")

            req = {
                "partition_parameters": {
                    "files": {
                        "content": content,
                        "file_name": file.filename,
                    },
                    "strategy": Strategy.HI_RES,
                    "output_format":"application/json"
                }
            }

            res = await self.client.general.partition_async(request=req)
            logger.info(f"Type of res.elements: {type(res.elements)}")
            logger.info(f"First element in res.elements: {res.elements[0]}")

            response_elements = res.elements

            processed_result = self._process_response(response_elements, file.filename)

            logger.info(
                f"Processed {file.filename}: "
                f"{len(processed_result['text_chunks'])} text chunks, "
                f"{len(processed_result['tables'])} tables, "
                f"{processed_result['metadata']['total_pages']} pages"
            )

            return processed_result
        except Exception as e:
            logger.error(f"Error processing file {file.filename}: {e}", exc_info=True)
            raise

    async def process_files(self, files: List[UploadFile]) -> List[Dict]:
        """Process multiple files asynchronously."""
        tasks = [self.process_file(file) for file in files]
        return await asyncio.gather(*tasks)
