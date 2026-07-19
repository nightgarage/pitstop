# ---- Stage 1: build the frontend ----
FROM node:24-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-fund --no-audit
COPY frontend/ ./
RUN npm run build

# ---- Stage 2: python runtime ----
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DATA_DIR=/data \
    FRONTEND_DIST=/app/frontend/dist

WORKDIR /app
COPY backend/ ./
RUN pip install --no-cache-dir ".[postgres]"
COPY --from=frontend /fe/dist ./frontend/dist

VOLUME /data
EXPOSE 8080

# back up the database, apply migrations, then serve app + frontend on one port
CMD python -m pitstop.premigrate && \
    uvicorn pitstop.main:app --host 0.0.0.0 --port 8080 --proxy-headers --forwarded-allow-ips="*"
