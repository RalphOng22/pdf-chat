from pydantic import BaseModel, UUID4, Field, conlist
from typing import Optional, List, Dict
from datetime import datetime
from enum import Enum

# Enums
class ChunkType(str, Enum):
    TEXT = "text"
    TABLE = "table"

class ProcessingStatus(str, Enum):
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

# Table Data Models
class TableData(BaseModel):
    headers: List[str]
    data: List[Dict[str, str]]
    html: Optional[str] = None

# Source References
class SourceReference(BaseModel):
    document_id: int
    document_name: str
    page_number: int
    chunk_type: ChunkType
    text: str
    table_data: Optional[TableData] = None
    similarity: float = Field(ge=0.0, le=1.0)

# Request/Response Models
class QueryRequest(BaseModel):
    query: str
    chat_id: UUID4
    document_ids: Optional[List[int]] = None

class QueryResponse(BaseModel):
    response: str
    source_references: List[SourceReference]

class ProcessingResponse(BaseModel):
    filename: str
    status: str = Field(default="success")
    document_id: Optional[int] = None
    chunks_processed: Optional[int] = None
    page_count: Optional[int] = None
    processing_status: Optional[ProcessingStatus] = None
    error: Optional[str] = None

    @classmethod
    def success(cls, filename: str, document_id: int, chunks_processed: int, page_count: int):
        return cls(
            filename=filename,
            document_id=document_id,
            chunks_processed=chunks_processed,
            page_count=page_count,
            processing_status=ProcessingStatus.COMPLETED
        )

    @classmethod
    def error(cls, filename: str, error: str):
        return cls(
            filename=filename,
            status="error",
            processing_status=ProcessingStatus.FAILED,
            error=error
        )

# Database Models
class Document(BaseModel):
    id: int
    chat_id: UUID4
    name: str
    upload_date: datetime
    page_count: Optional[int]
    file_path: str
    processing_status: ProcessingStatus

    class Config:
        from_attributes = True

class Chunk(BaseModel):
    id: int
    document_id: int
    chunk_index: int
    chunk_type: ChunkType
    text: str
    page_number: int
    table_data: Optional[Dict] = None
    embedding: conlist(float, min_length=768, max_length=768)  # Validate embedding dimension

    class Config:
        from_attributes = True

class Query(BaseModel):
    id: int
    chat_id: UUID4
    query_text: str
    response_text: str
    source_references: List[SourceReference]
    timestamp: datetime

    class Config:
        from_attributes = True