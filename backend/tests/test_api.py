import pytest
from fastapi.testclient import TestClient
from uuid import uuid4
import logging

logging.basicConfig(level=logging.INFO)

@pytest.mark.asyncio
async def test_successful_document_processing(test_client, mock_service_integrator):
    """Test successful document upload and processing"""
    files = {"files": ("sample.pdf", b"%PDF-1.4", "application/pdf")}
    response = test_client.post("/api/v1/documents/process", files=files)

    assert response.status_code == 200
    assert response.json()[0]["status"] == "success"

@pytest.mark.asyncio
async def test_invalid_file_type(test_client, mock_service_integrator):
    """Test invalid file type handling"""
    files = {"files": ("sample.txt", b"Some text", "text/plain")}
    response = test_client.post("/api/v1/documents/process", files=files)

    assert response.status_code == 400
    assert "is not a PDF" in response.json()["detail"]

@pytest.mark.asyncio
async def test_successful_query_processing(test_client, mock_service_integrator):
    """Test successful query processing"""
    payload = {
        "query": "What is the document about?",
        "chat_id": str(uuid4()),
        "document_ids": [1, 2, 3]
    }
    
    # Set up expected response matching our schema exactly
    mock_service_integrator.query_documents.return_value = {
        "response": "Mock response",
        "source_references": [  # Changed from "sources" to "source_references"
            {
                "document_id": 1,
                "document_name": "test.pdf",
                "page_number": 1,
                "chunk_type": "text",
                "text": "Sample text",
                "table_data": None,
                "similarity": 0.85
            }
        ]
    }
    
    response = test_client.post("/api/v1/query/", json=payload)
    assert response.status_code == 200
    data = response.json()
    
    assert "response" in data
    assert "source_references" in data
    assert data["response"] == "Mock response"
    assert len(data["source_references"]) == 1

@pytest.mark.asyncio
async def test_query_validation(test_client):
    """Test query validation"""
    payload = {"chat_id": str(uuid4())}  # Missing 'query'
    response = test_client.post("/api/v1/query/", json=payload)
    assert response.status_code == 422