# syntax=docker/dockerfile:1

# ── Build the SPA ────────────────────────────────────────────────
FROM node:20-bookworm-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core libgl1 libglib2.0-0 sqlite3 curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/
COPY migrations/ migrations/
COPY --from=frontend /src/frontend/dist frontend/dist

RUN useradd --create-home --uid 1000 facelapse && mkdir -p /data && chown facelapse /data
USER facelapse

ENV FACE_LAPSE_DATA_DIR=/data \
    FACE_LAPSE_STATIC_DIR=/app/frontend/dist \
    GLOG_minloglevel=2 \
    PYTHONUNBUFFERED=1

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD curl -fsS http://127.0.0.1:8000/api/health || exit 1
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
