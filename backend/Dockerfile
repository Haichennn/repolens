# Repolens Backend - Production Container
# Built for Railway deployment but works on any container platform

FROM python:3.12-slim

# Set working directory inside container
WORKDIR /app

# Install system dependencies (curl for healthcheck, build tools for Pillow/lxml if needed)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (Docker layer caching: deps don't change every commit)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the backend code (everything except .dockerignore exclusions)
COPY . .

# Expose port (informational — Railway uses $PORT env var)
EXPOSE 8000

# Healthcheck so Railway knows when the container is ready
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-8000}/health || exit 1

# Start uvicorn — bind to all interfaces, use Railway's $PORT or fall back to 8000
CMD ["sh", "-c", "exec uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
