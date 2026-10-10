# SecureTask

[![CI](https://github.com/Muskan-3/Secure-Task/actions/workflows/ci.yml/badge.svg)](https://github.com/Muskan-3/Secure-Task/actions/workflows/ci.yml)

A JWT-authenticated task management API built to demonstrate a complete DevSecOps CI/CD pipeline - automated tests, static analysis, dependency/secret/container scanning, and containerized deployment.

**Live demo:** https://secure-task-aot7.onrender.com/
**API docs (Swagger UI):** https://secure-task-aot7.onrender.com/docs
**Repository:** https://github.com/Muskan-3/Secure-Task

## Overview

SecureTask is a small FastAPI backend (register, log in, manage a personal to-do list) used
as a vehicle to demonstrate a DevSecOps workflow end to end: every push and pull request is
tested, statically analyzed for insecure code, checked for vulnerable dependencies, scanned
for leaked secrets, and has its built Docker image scanned for OS/library vulnerabilities -
before the Docker image itself is built as a multi-stage, non-root image and deployed as a
containerized service with a managed Postgres database.

## Tech stack

| Component | Technology | Version |
|---|---|---|
| Language | Python | 3.11 |
| Web framework | FastAPI | 0.143.0 |
| ASGI server | Uvicorn (standard extras) | 0.54.0 |
| Data validation | Pydantic | 2.14.0 |
| Database ORM | SQLAlchemy | 2.1.4 |
| Database (Docker/prod) | PostgreSQL | 16 |
| Database (local, no Docker) | SQLite (file-based, default) | - |
| DB driver | psycopg2-binary | 2.9.13 |
| Auth tokens | PyJWT | 2.15.1 |
| Password hashing | bcrypt | 5.0.0 |
| Form parsing | python-multipart | 0.0.32 |
| Email validation | email-validator | 2.3.0 |
| Frontend | Plain HTML, CSS, JavaScript (no framework) | - |
| Container base image | python:3.11-slim | - |

## Features

- User registration and login with bcrypt-hashed passwords
- JWT-based authentication (30-minute access tokens)
- Full task management: create, list, view, update, and delete tasks
- Per-user task isolation - one account can never read, edit, or delete another account's
  tasks (enforced by filtering every query on `owner_id`)
- `GET /health` endpoint for uptime/readiness checks (used by Docker's own `HEALTHCHECK`)
- A simple web UI served at `/` for registering, logging in, and managing tasks
- Interactive API documentation at `/docs` (generated automatically by FastAPI)

## Architecture

```
                   ┌──────────────┐
                   │   Browser    │
                   │ (Web UI /    │
                   │  Swagger UI) │
                   └──────┬───────┘
                          │ HTTPS
                          ▼
                   ┌──────────────┐
                   │   FastAPI    │
                   │  (Uvicorn)   │
                   └──────┬───────┘
                          │ SQL (psycopg2)
                          ▼
                   ┌──────────────┐
                   │  PostgreSQL  │
                   └──────────────┘

CI/CD (GitHub Actions, on every push/PR to main):

  ┌────────┐      ┌───────────────────┐
  │  test  │ ───▶ │   security-scan    │
  │ pytest │  │   │ Semgrep, pip-audit,│
  │ + cov  │  │   │ Gitleaks           │
  └────────┘  │   └───────────────────┘
              │
              │   ┌───────────────────┐
              └──▶│    docker-scan     │
                  │ docker build +     │
                  │ Trivy image scan   │
                  └───────────────────┘

Deploy: Render builds this repo's Dockerfile and deploys it as a web service
(not a step in the GitHub Actions workflow above - triggered by Render's own
GitHub integration on push to main).
```

## Getting started

Requires Docker Desktop (or another Docker Engine + Compose) installed and running.

```powershell
# 1. Clone the repository
git clone https://github.com/Muskan-3/Secure-Task.git
cd Secure-Task

# 2. Create your local environment file and fill in real values
Copy-Item .env.example .env
# Generate a SECRET_KEY with:
# python -c "import secrets; print(secrets.token_urlsafe(32))"

# 3. Build the images and start the app + Postgres containers
docker compose up -d --build

# 4. Open the app
#    http://localhost:8000/        (web UI)
#    http://localhost:8000/docs    (API docs)
#    http://localhost:8000/health  (health check)

# 5. When you're done
docker compose down
```

`docker compose down` keeps your database data in a named Docker volume; add `-v` to also
delete it.

## Environment variables

Defined in `.env.example`; copy it to `.env` (never commit `.env` - it is gitignored).

| Variable | Used by | Description |
|---|---|---|
| `SECRET_KEY` | app | Signing key for JWTs. Must be a long random string; the app logs a warning and falls back to an insecure dev-only key if unset. |
| `POSTGRES_USER` | docker-compose `db` service | Postgres username created in the `db` container. |
| `POSTGRES_PASSWORD` | docker-compose `db` service | Postgres password for that user. |
| `POSTGRES_DB` | docker-compose `db` service | Name of the database created in the `db` container. |
| `DATABASE_URL` | app | SQLAlchemy connection string. In Docker, points at the `db` service: `postgresql+psycopg2://<user>:<password>@db:5432/<db>`. If unset, the app falls back to a local SQLite file (`securetask.db`). |

## API endpoints

| Method | Path | Auth required | Description |
|---|---|---|---|
| GET | `/health` | No | Health check, returns `{"status": "ok"}` |
| POST | `/auth/register` | No | Create a new user account (email + password) |
| POST | `/auth/login` | No | Log in with form-encoded email/password, returns a JWT |
| GET | `/tasks` | Yes | List the current user's tasks |
| POST | `/tasks` | Yes | Create a new task |
| GET | `/tasks/{task_id}` | Yes | Get one of the current user's tasks |
| PUT | `/tasks/{task_id}` | Yes | Update a task (title, description, and/or completed) |
| DELETE | `/tasks/{task_id}` | Yes | Delete a task |
| GET | `/` | No | Serves the web UI |
| GET | `/static/{path}` | No | Static web UI assets (CSS/JS) |
| GET | `/docs` | No | Interactive API documentation (Swagger UI) |

Authenticated requests use an `Authorization: Bearer <token>` header with the token returned
by `POST /auth/login`. Requesting or modifying another user's task returns `404 Not Found` -
identical to a task that doesn't exist, so ownership can't be probed from the response.

## Running tests

```powershell
pip install -r requirements.txt -r requirements-dev.txt
pytest -v --cov=app --cov-report=term-missing
```

The suite (`tests/`) covers the health check, registration/login, full task CRUD, cross-user
task isolation (`test_isolation.py`), and that unauthenticated requests to protected routes
are rejected with `401`. This is the same command CI runs, against a real Postgres service
container rather than SQLite.

## Security practices (implemented in CI)

Every push and pull request to `main` runs these checks; a finding in any of them fails the
corresponding job, so nothing with an unresolved finding merges silently:

| Tool | Job | Checks for |
|---|---|---|
| Semgrep (`--config auto`) | `security-scan` | Insecure code patterns in `app/` |
| pip-audit | `security-scan` | Known vulnerabilities in packages pinned in `requirements.txt` |
| Gitleaks | `security-scan` | Secrets committed anywhere in git history (full checkout, not just HEAD) |
| Trivy | `docker-scan` | HIGH/CRITICAL, fixable OS and library vulnerabilities in the built Docker image |

## CI/CD pipeline

Defined in `.github/workflows/ci.yml`, triggered on every push to `main` and every pull
request:

1. **test** - checks out the code, sets up Python 3.11 with pip caching, installs
   `requirements.txt` + `requirements-dev.txt`, and runs `pytest -v --cov=app
   --cov-report=term-missing` against a real `postgres:16` service container.
2. **security-scan** (runs after `test` passes) - checks out full git history, then runs
   Semgrep against `app/`, pip-audit against `requirements.txt`, and Gitleaks against the
   full commit history.
3. **docker-scan** (runs after `test` passes, in parallel with `security-scan`) - builds the
   Docker image (`docker build -t secure-task-app:ci .`), then scans it with Trivy
   (`vuln-type: os,library`, `severity: HIGH,CRITICAL`, `ignore-unfixed: true`), failing the
   job on any match.

Deployment is not part of this workflow - see below.

## Deployment

Hosted on Render as a Docker-based web service, built directly from the Dockerfile in this
repo, with a managed Render PostgreSQL database providing `DATABASE_URL`. Render rebuilds and
redeploys automatically on every push to `main` via its own GitHub integration, independent
of the GitHub Actions workflow above.

## Roadmap

<!-- TODO: fill in -->

## Author

**Muskan Shrivastava**

- GitHub: https://github.com/Muskan-3
