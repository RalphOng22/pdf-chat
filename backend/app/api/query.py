# app/api/query.py
from fastapi import APIRouter, HTTPException
from typing import Optional, List
from ..services.service_integrator import ServiceIntegrator
from ..models.schemas import QueryRequest, QueryResponse
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/query", tags=["query"])

@router.post("/", response_model=QueryResponse)
async def query_documents(request: QueryRequest):
    """
    Query processed documents and get relevant responses
    """
    try:
        service = ServiceIntegrator()
        
        result = await service.query_documents(
            query=request.query,
            chat_id=request.chat_id,
            document_ids=request.document_ids
        )
        
        return QueryResponse(
            response=result['response'],
            sources=result['sources']
        )
        
    except Exception as e:
        logger.error(f"Error processing query: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))