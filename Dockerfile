# ============================================
# Stage 1: Backend Builder
# ============================================
FROM python:3.11-slim-bookworm AS backend-builder
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

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

# Backend
WORKDIR /app
COPY --from=backend-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=backend-builder /usr/local/bin /usr/local/bin
COPY backend/ .

# Frontend static files
COPY --from=frontend-builder /app/build /var/www/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8001 80
CMD sh -c "nginx && uvicorn main:app --host 0.0.0.0 --port 8001"