import pytest
from fastapi.testclient import TestClient
from backend.main import app
from unittest.mock import AsyncMock, patch
from uuid import uuid4
from fastapi import HTTPException
import logging

# Configure logging for tests
logging.basicConfig(level=logging.INFO)

@pytest.fixture(scope="session")
def test_client():
    """Provide a TestClient for FastAPI app"""
    return TestClient(app)

@pytest.fixture
def mock_supabase_service():
    """Mock the SupabaseService"""
    with patch("app.services.supabase_service.SupabaseService") as MockService:
        instance = MockService.return_value
        instance.store_document = AsyncMock(return_value={"id": 1, "name": "test_document.pdf"})
        instance.store_chunks = AsyncMock()
        instance.update_document = AsyncMock()
        instance.find_similar_chunks = AsyncMock(return_value=[])
        instance.store_query = AsyncMock()
        yield instance

@pytest.fixture
def mock_gemini_service():
    """Mock the GeminiService"""
    with patch("app.services.gemini_service.GeminiService") as MockService:
        instance = MockService.return_value
        # Return a proper embedding array
        instance.generate_embedding = AsyncMock(return_value=[0.1] * 768)  # 768-dimensional vector
        instance.generate_response = AsyncMock(return_value={
            'response': 'Mock response',
            'sources': []
        })
        yield instance

@pytest.fixture
def mock_document_extractor():
    """Mock the DocumentExtractor"""
    with patch("app.services.document_extractor.DocumentExtractor") as MockExtractor:
        instance = MockExtractor.return_value
        instance.process_file = AsyncMock(return_value={
            'tables': [],
            'text_chunks': [{'text': 'test content', 'page_number': 1}],
            'metadata': {'total_pages': 1}
        })
        yield instance

@pytest.fixture(autouse=True)
def mock_settings():
    """Mock settings to prevent actual API calls"""
    with patch("app.api.document.settings") as mock_settings:
        mock_settings.UNSTRUCTURED_API_KEY = "test-key"
        mock_settings.UNSTRUCTURED_API_URL = "http://test-url"
        mock_settings.SUPABASE_URL = "http://test-supabase-url"
        mock_settings.SUPABASE_KEY = "test-key"
        mock_settings.GOOGLE_API_KEY = "test-key"
        yield mock_settings

@pytest.fixture
def mock_service_integrator():
    """Mock the ServiceIntegrator"""
    with patch("app.api.query.ServiceIntegrator") as MockIntegrator, \
         patch("app.api.document.ServiceIntegrator") as MockIntegratorDoc:
        
        # Create instance for both routes
        query_instance = MockIntegrator.return_value
        doc_instance = MockIntegratorDoc.return_value
        
        # Setup document processing mock
        doc_instance.process_documents = AsyncMock(return_value=[{
            "status": "success",
            "filename": "sample.pdf",
            "document_id": 1,
            "chunks_processed": 1,
            "page_count": 1
        }])
        
        # Setup query mock
        query_instance.query_documents = AsyncMock(return_value={
            "response": "Mock response",
            "sources": [
                {
                    "document_id": 1,
                    "document_name": "test.pdf",
                    "page_number": 1,
                    "text": "Sample text"
                }
            ]
        })
        
        yield query_instance

