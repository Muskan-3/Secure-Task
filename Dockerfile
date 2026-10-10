# ---- Stage 1: builder ----
# Base image: a small Debian-based image with Python 3.11 already installed.
# "slim" keeps the image size down compared to the default python image.
FROM mirror.gcr.io/library/python:3.11-slim AS builder

# Upgrade pip's own build tooling before it installs anything, so the
# dependency resolution below uses patched pip/setuptools.
RUN pip install --no-cache-dir --upgrade pip setuptools

WORKDIR /app

# Install dependencies into an isolated virtual environment rather than the
# base image's system site-packages, so stage 2 can copy exactly this venv
# and nothing else build-related (pip caches, apt state, compilers).
COPY requirements.txt .
RUN python -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip setuptools \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements.txt

# The app never calls pip/setuptools/wheel at runtime (only uvicorn/fastapi
# code runs), so drop them from the venv that ships in the final image -
# this is also what removes the vulnerable vendored copies (urllib3,
# msgpack, etc.) that pip/setuptools carry.
RUN /opt/venv/bin/pip uninstall -y pip setuptools wheel

# ---- Stage 2: final runtime image ----
# Start fresh from the same slim base instead of reusing the builder stage,
# so none of the builder's pip cache or upgraded-but-unused bootstrap tooling
# ends up in the image that actually ships.
FROM mirror.gcr.io/library/python:3.11-slim

# Don't write .pyc cache files, and don't buffer stdout/stderr - this makes
# `docker logs` show output immediately instead of delayed in batches.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# The base image's own bootstrap pip/setuptools (installed via ensurepip when
# this base image was built) are never used here either - the app runs out of
# the venv copied in below. Remove them so their vendored urllib3/msgpack and
# outdated setuptools don't show up in image scans.
RUN rm -rf /usr/local/lib/python3.11/site-packages/pip* \
           /usr/local/lib/python3.11/site-packages/setuptools* \
           /usr/local/lib/python3.11/site-packages/wheel* \
           /usr/local/lib/python3.11/site-packages/pkg_resources* \
           /usr/local/bin/pip* /usr/local/bin/wheel*

# Copy only the installed virtual environment from the builder - no compilers,
# no pip cache, no apt lists.
COPY --from=builder /opt/venv /opt/venv

# Now copy the application code.
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
