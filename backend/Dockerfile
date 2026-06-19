# ============================================================
# Backend-only image for Hugging Face Spaces (Docker SDK).
# Build context = this backend/ directory (the Space repo root).
# HF runs the container as a non-root user with UID 1000, so all
# runtime-writable paths (.chroma/, .llm_cache/) must
# be owned by that user.
# ============================================================
FROM python:3.11-slim-bookworm

# System deps: git (clone), semgrep (SAST), curl (healthcheck), certs.
RUN apt-get update && apt-get install -y --no-install-recommends \
        git curl ca-certificates python3-pip && \
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

# App code (owned by the runtime user).
COPY --chown=user . .

# HF Spaces routes external traffic to this port.
EXPOSE 7860

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -sf http://localhost:7860/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
