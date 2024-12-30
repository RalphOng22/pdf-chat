from fastapi import APIRouter, UploadFile, HTTPException
from pydantic import BaseModel
from ..services.service_integrator import ServiceIntegrator
from app.config import settings
from typing import List
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

class DocumentRequest(BaseModel):
    id: int
    file_path: str

class ProcessDocumentsRequest(BaseModel):
    chat_id: str
    documents: List[DocumentRequest]

@router.post("/process")
async def process_documents(request: ProcessDocumentsRequest):
    """Process documents using their file paths"""
    try:
        logger.info(f"Processing request: {request}")
        service = ServiceIntegrator(settings)
        
        results = await service.process_documents(
            chat_id=request.chat_id,
            documents=[{"id": doc.id, "file_path": doc.file_path} for doc in request.documents]
        )
        
        return results
        
    except Exception as e:
        logger.error(f"Error processing documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))