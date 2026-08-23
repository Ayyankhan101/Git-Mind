import os
import tempfile

import pytest
from fastapi.testclient import TestClient

os.environ["GROQ_API_KEY"] = "gsk_test_placeholder"
os.environ["GITHUB_TOKEN"] = "ghp_test_placeholder"
os.environ["GITHUB_APP_WEBHOOK_SECRET"] = "test-secret"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tempfile.mktemp(suffix='.db')}"
os.environ["DEBUG"] = "1"


@pytest.fixture
def app():
    from main import app

    return app


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c


@pytest.fixture
def auth_client(app):
    """Client presenting a caller token, for auth-gated routes.

    Identity is header-only: the GITHUB_TOKEN set above is the *server's*
    credential and no longer authenticates a caller (tests/test_auth_identity.py).
    """
    with TestClient(app, headers={"Authorization": "Bearer ghp_test_caller"}) as c:
        yield c
