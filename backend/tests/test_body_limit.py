"""Tests for request body size limit middleware."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.body_limit import BodyLimitMiddleware


@pytest.fixture
def app():
    app = FastAPI()
    app.add_middleware(BodyLimitMiddleware, max_bytes=1024)  # 1KB limit

    @app.post("/small")
    async def small():
        return {"ok": True}

    @app.post("/large")
    async def large():
        return {"ok": True}

    return app


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=False)


def test_small_payload_passes(client):
    response = client.post("/small", content=b"x" * 500)
    assert response.status_code == 200


def test_large_payload_rejected(client):
    response = client.post("/large", content=b"x" * 2048)
    assert response.status_code == 413
    assert "too large" in response.json()["error"].lower()


def test_no_content_length_allows(client):
    """POST requests without Content-Length are rejected (411) to prevent chunked encoding bypass."""
    req = client.build_request("POST", "/small", content=b"x" * 2048)
    req.headers.pop("content-length", None)
    response = client.send(req)
    # Without Content-Length on POST, middleware rejects with 411
    assert response.status_code == 411
