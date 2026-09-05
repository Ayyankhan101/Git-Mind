# ============================================================
# Stage 0: Rust native module builder
# ============================================================
FROM rust:1.81-slim-bookworm AS rust-builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY rust-gitmind/ .
RUN pip install maturin --break-system-packages && maturin build --release

# ============================================================
# Stage 1: Backend-only image for Hugging Face Spaces (Docker SDK).
# Build context = this backend/ directory (the Space repo root).
# HF runs the container as a non-root user with UID 1000, so all
# runtime-writable paths (.chroma/, .llm_cache/) must
# be owned by that user.
# ============================================================
FROM python:3.11-slim-bookworm

# System deps: git (clone), semgrep (SAST), curl (healthcheck), certs, redis.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates python3-pip redis-server && \
    pip3 install --no-cache-dir semgrep && \
    rm -rf /var/lib/apt/lists/*

# HF Spaces mandates a non-root user with UID 1000.
RUN useradd -m -u 1000 user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install Python deps first for layer caching.
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install the Rust native gitmind_core module.
COPY --from=rust-builder /app/target/wheels/gitmind_core*.whl /tmp/
RUN pip install --no-cache-dir /tmp/gitmind_core*.whl

# Run everything below as the runtime user so the ONNX cache and the
# app directory end up owned by UID 1000.
USER user

# Pre-download ChromaDB's ONNX embedding model into the user's cache so
# the first analysis doesn't stall downloading it at runtime.
RUN python3 -c "\
import urllib.request, tarfile, pathlib; \
URL='https://chroma-onnx-models.s3.amazonaws.com/all-MiniLM-L6-v2/onnx.tar.gz'; \
DEST=pathlib.Path.home()/'.cache/chroma/onnx_models/all-MiniLM-L6-v2'; \
DEST.mkdir(parents=True, exist_ok=True); \
arc=DEST/'onnx.tar.gz'; \
urllib.request.urlretrieve(URL, arc); \
tf=tarfile.open(arc); tf.extractall(DEST); tf.close(); \
arc.unlink(); print('ChromaDB ONNX model cached.')"

# Pre-download fastembed's ONNX model into the exact cache_dir
# qdrant_utils.py resolves at runtime (backend/.fastembed_cache — see
# _PREFERRED_FASTEMBED_CACHE there). This is the model the Qdrant backend
# actually uses for the Knowledge/RAG step (vector_store.py switches to it
# whenever QDRANT_URL is set); the ChromaDB pre-download above never covered
# it, so every fresh/redeployed container paid a cold model download inside
# the first analysis's RAG step instead of at build time — the Knowledge
# agent looking "stuck" while every other agent had long finished.
RUN python3 -c "\
from fastembed import TextEmbedding; \
TextEmbedding(model_name='sentence-transformers/all-MiniLM-L6-v2', cache_dir='/app/.fastembed_cache'); \
print('fastembed ONNX model cached.')"

# App code (owned by the runtime user).
COPY --chown=user . .

# HF Spaces routes external traffic to this port.
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -sf http://localhost:7860/health || exit 1

# CACHEBUSTER 2026-06-24 — force rebuild after webhook asyncio fix
# Start Redis in background, then start the app
CMD ["sh", "-c", "redis-server --daemonize yes && uvicorn main:app --host 0.0.0.0 --port 7860"]
