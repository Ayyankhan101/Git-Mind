import os
import tempfile

import pytest
from fastapi.testclient import TestClient

os.environ["GROQ_API_KEY"] = "gsk_test_placeholder"
os.environ["GITHUB_TOKEN"] = "ghp_test_placeholder"
os.environ["GITHUB_APP_WEBHOOK_SECRET"] = "test-secret"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tempfile.mktemp(suffix='.db')}"
os.environ["DEBUG"] = "1"
os.environ["ENVIRONMENT"] = "test"


@pytest.fixture
def app():
    from main import app

    return app


# NOTE: GITHUB_TOKEN above is the *server's* credential. It no longer
# authenticates a caller (see tests/test_auth_identity.py), so tests hitting
# auth-gated routes must pass an Authorization header explicitly.
@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c
