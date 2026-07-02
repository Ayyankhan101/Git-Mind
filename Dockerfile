# ============================================
# Stage 1: Backend Builder
# ============================================
FROM python:3.11-slim-bookworm AS backend-builder
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download ChromaDB ONNX embedding model so it is baked into the image
# and never needs to download at runtime (avoids timeout on first analysis).
RUN python3 -c "\
import urllib.request, tarfile, pathlib; \
URL='https://chroma-onnx-models.s3.amazonaws.com/all-MiniLM-L6-v2/onnx.tar.gz'; \
DEST=pathlib.Path('/root/.cache/chroma/onnx_models/all-MiniLM-L6-v2'); \
DEST.mkdir(parents=True, exist_ok=True); \
arc=DEST/'onnx.tar.gz'; \
urllib.request.urlretrieve(URL, arc); \
tf=tarfile.open(arc); tf.extractall(DEST); tf.close(); \
arc.unlink(); \
print('ChromaDB ONNX model cached.') \
"

COPY backend/ .
COPY --from=rust-builder /app/target/wheels/gitmind_core*.whl /tmp/
RUN pip install --no-cache-dir /tmp/gitmind_core*.whl

# ============================================
# Stage 1b: Rust native module builder
# ============================================
FROM rust:1.81-slim-bookworm AS rust-builder
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY rust-gitmind/ .
RUN pip install maturin --break-system-packages && maturin build --release

# ============================================
# Stage 2: Frontend Builder
# ============================================
FROM node:18-alpine AS frontend-builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps && npm cache clean --force
COPY frontend/ .
RUN npm run build

# ============================================
# Stage 3: Production Runner
# ============================================
FROM python:3.11-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates nginx curl && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app /var/www/html /etc/nginx
USER appuser

# Backend
WORKDIR /app
COPY --from=backend-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin
COPY backend/ .

# Frontend static files
COPY --from=frontend-builder /app/build /var/www/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8001 80
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -sf http://localhost:8001/health | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('status')=='ok' else 1)"
CMD sh -c "nginx && uvicorn main:app --host 0.0.0.0 --port 8001"