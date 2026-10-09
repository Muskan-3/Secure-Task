# Base image: a small Debian-based image with Python 3.11 already installed.
# "slim" keeps the image size down compared to the default python image.
FROM python:3.11-slim

# Don't write .pyc cache files, and don't buffer stdout/stderr - this makes
# `docker logs` show output immediately instead of delayed in batches.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Copy only requirements.txt first and install it before copying the rest of the
# code. Docker caches each instruction as a layer; as long as requirements.txt
# doesn't change, this layer is reused and dependencies aren't reinstalled every
# time application code changes, making rebuilds much faster.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Now copy the rest of the application.
COPY . .

# Create a dedicated, unprivileged user and run the app as that user instead of
# root. If the app were ever compromised, it would not have root access inside
# the container.
RUN useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Lets Docker (and docker-compose's "service_healthy" condition) know whether the
# app is actually responding, not just whether the process is running. It reuses
# the app's own GET /health endpoint, so no extra tools need to be installed.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
