"""Tests for chat endpoint with real session."""

from unittest.mock import patch

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


class TestChatEndpoint:
    """Test chat endpoint with real session."""

    @patch("routes.chat.get_session")
    @patch("routes.chat.run_chat_agent")
    @patch("chroma_utils._client")
    def test_chat_with_valid_session(self, mock_client, mock_chat, mock_get_session):
        """Chat should work with valid session and chroma_collection_name."""
        session_id = "12345678-1234-1234-1234-123456789012"
        mock_get_session.return_value = {
            "session_id": session_id,
            "chroma_collection_name": "test-collection",
            "chat_history": [],
            "repo_name": "test-repo",
            "architecture_graph": {"nodes": [], "edges": []},
        }
        mock_chat.return_value = ("Hello, how can I help?", [])

        response = client.post(
            "/chat",
            json={
                "session_id": session_id,
                "question": "What does this codebase do?",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
        assert "sources" in data

    @patch("routes.chat.get_session")
    def test_chat_without_chroma_collection(self, mock_get_session):
        """Chat should return 503 if chroma_collection_name is missing."""
        session_id = "12345678-1234-1234-1234-123456789012"
        mock_get_session.return_value = {
            "session_id": session_id,
            "chroma_collection_name": None,
            "chat_history": [],
            "repo_name": "test-repo",
        }

        response = client.post(
            "/chat",
            json={
                "session_id": session_id,
                "question": "What does this codebase do?",
            },
        )

        assert response.status_code == 503
        assert "Knowledge base not ready" in response.json()["error"]

    @patch("routes.chat.get_session")
    def test_chat_without_session(self, mock_get_session):
        """Chat should return 404 if session not found."""
        session_id = "12345678-1234-1234-1234-123456789012"
        mock_get_session.return_value = None

        response = client.post(
            "/chat",
            json={
                "session_id": session_id,
                "question": "What does this codebase do?",
            },
        )

        assert response.status_code == 404
        assert "Session not found" in response.json()["error"]

    @patch("routes.chat.get_session")
    @patch("chroma_utils._client")
    def test_chat_with_lost_collection_no_contents(self, mock_client, mock_get_session):
        """Chat should return 503 if ChromaDB collection lost and no file_contents."""
        session_id = "12345678-1234-1234-1234-123456789012"
        mock_get_session.return_value = {
            "session_id": session_id,
            "chroma_collection_name": "old-collection",
            "chat_history": [],
            "repo_name": "test-repo",
        }
        mock_client.get_collection.side_effect = Exception("Collection not found")

        response = client.post(
            "/chat",
            json={
                "session_id": session_id,
                "question": "What does this codebase do?",
            },
        )

        assert response.status_code == 503
        assert "Knowledge base lost" in response.json()["error"]

    @patch("routes.chat.get_session")
    @patch("routes.chat.run_chat_agent")
    @patch("chroma_utils._client")
    def test_chat_with_lost_collection_with_contents(
        self, mock_client, mock_chat, mock_get_session
    ):
        """Chat should re-embed if ChromaDB collection lost but file_contents exists."""
        session_id = "12345678-1234-1234-1234-123456789012"
        mock_get_session.return_value = {
            "session_id": session_id,
            "chroma_collection_name": "old-collection",
            "chat_history": [],
            "repo_name": "test-repo",
            "architecture_graph": {"nodes": [], "edges": []},
            "file_contents": {"test.py": "print('hello')"},
            "repo_url": "https://github.com/test/repo",
        }
        mock_client.get_collection.side_effect = Exception("Collection not found")
        mock_chat.return_value = ("Re-embedded successfully", [])

        with patch("agents.rag_setup.run_rag_setup", return_value="new-collection"):
            response = client.post(
                "/chat",
                json={
                    "session_id": session_id,
                    "question": "What does this codebase do?",
                },
            )

        assert response.status_code == 200
        data = response.json()
        assert "answer" in data
