import os
import tempfile

import pytest
from fastapi.testclient import TestClient

os.environ["GROQ_API_KEY"] = "gsk_test_placeholder"
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tempfile.mktemp(suffix='.db')}"


@pytest.fixture
def app():
    from main import app
    return app


@pytest.fixture
def client(app):
    with TestClient(app) as c:
        yield c
