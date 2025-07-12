# Multi-stage build for SWE-Bench Swarm Worker
FROM python:3.9-slim AS builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir --user -r requirements.txt

# Production stage
FROM python:3.9-slim AS production

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Add non-root user
RUN useradd --create-home --shell /bin/bash worker

WORKDIR /app

# Copy Python packages from builder
COPY --from=builder /root/.local /home/worker/.local

# Copy source code
COPY --chown=worker:worker src/ ./src/
COPY --chown=worker:worker requirements.txt ./

# Create necessary directories
RUN mkdir -p /app/logs /app/workspace && \
    chown -R worker:worker /app

# Switch to non-root user
USER worker

# Add local packages to PATH
ENV PATH=/home/worker/.local/bin:$PATH
ENV PYTHONPATH=/app/src:$PYTHONPATH

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')"

# Start the worker
CMD ["python", "-m", "src.main"]