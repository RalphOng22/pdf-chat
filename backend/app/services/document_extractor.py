from unstructured_client import UnstructuredClient
from typing import Dict, List, Optional
import logging
from fastapi import UploadFile
from app.config import settings

logger = logging.getLogger(__name__)

class DocumentExtractor:
    def __init__(self):
        self.client = UnstructuredClient(
            api_key_auth=settings.UNSTRUCTURED_API_KEY,
            server_url=settings.UNSTRUCTURED_API_URL
        )

    async def process_file(self, file: UploadFile) -> Dict:
        """Process single PDF file using unstructured API"""
        try:
            content = await file.read()
            response = await self.client.partition(
                files={"file": (file.filename, content, "application/pdf")},
                strategy="hi_res",
                combine_text_under_n_chars=0,
                include_page_breaks=True,
                output_format="json"
            )
            return self._process_response(response, file.filename)
        except Exception as e:
            logger.error(f"Error processing file {file.filename}: {str(e)}")
            raise

    async def process_files(self, files: List[UploadFile]) -> List[Dict]:
        """Process multiple files"""
        results = []
        for file in files:
            result = await self.process_file(file)
            results.append({
                'filename': file.filename,
                'results': result
            })
        return results