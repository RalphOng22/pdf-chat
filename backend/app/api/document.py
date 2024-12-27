# app/api/document.py
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from typing import List
from app.config import settings
from app.services.service_integrator import ServiceIntegrator
from ..models.schemas import ProcessingResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/documents", tags=["documents"])

@router.post("/process")
async def process_documents(
    files: List[UploadFile] = File(...),
    chat_id: str = None
):
    """Process one or more PDF documents and store their content"""
    try:
        # Validate file types first
        for file in files:
            if not file.filename.endswith('.pdf'):
                raise HTTPException(
                    status_code=400,
                    detail=f"File {file.filename} is not a PDF"
                )
        
        service = ServiceIntegrator(settings)
        results = await service.process_documents(files, chat_id)
        return results
        
    except HTTPException as he:
        # Re-raise HTTP exceptions directly
        raise he
    except Exception as e:
        logger.error(f"Error processing documents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))