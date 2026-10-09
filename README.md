# SecureTask

A task management API with JWT authentication, built as a DevSecOps CI/CD learning project.

**Repository:** https://github.com/Muskan-3/Secure-Task
**Live demo:** Coming soon

## About

SecureTask is a small backend project for practicing DevSecOps skills. It is a FastAPI
service that lets a user register an account, log in, and manage a personal to-do list
through a REST API. Each user can only see and change their own tasks. The project also
includes a plain HTML/CSS/JavaScript web interface that talks to the API. Features such
as containerization, a CI/CD pipeline, automated security scanning, and a deployed demo
are planned next and are tracked in the Roadmap section below; they are not built yet.

## Features

- User registration and login with hashed passwords
- JWT-based authentication (30-minute access tokens)
- Full task management: create, list, view, update, and delete tasks
- Tasks are private to each user; one user cannot see or modify another user's tasks
- A `GET /health` endpoint for basic uptime checks
- A simple web UI (served at `/`) for registering, logging in, and managing tasks
- Interactive API documentation at `/docs` (generated automatically by FastAPI)

## Tech stack

| Component | Technology | Version |
|---|---|---|
| Language | Python | 3.13 |
| Web framework | FastAPI | 0.143.0 |
| ASGI server | Uvicorn | 0.54.0 |
| Database ORM | SQLAlchemy | 2.1.4 |
| Database | SQLite (file-based, default) | - |
| Auth tokens | PyJWT | 2.15.1 |
| Password hashing | bcrypt | 5.0.0 |
| Data validation | Pydantic | 2.14.0 |
| Form parsing | python-multipart | 0.0.32 |
| Email validation | email-validator | 2.3.0 |
| Frontend | Plain HTML, CSS, JavaScript (no framework) | - |

## Project structure

```
Secure-Task/
├── app/
│   ├── __init__.py
│   ├── main.py          # FastAPI app: routes, startup, serves the web UI
│   ├── auth_routes.py    # POST /auth/register and POST /auth/login
│   ├── security.py       # password hashing, JWT creation/validation
│   ├── models.py         # SQLAlchemy models: User, Task
│   ├── schemas.py        # Pydantic request/response schemas
│   ├── database.py       # DB engine, session, get_db dependency
│   └── static/            # Web UI
│       ├── index.html
│       ├── style.css
│       └── app.js
├── docs/
│   └── screenshots/       # UI screenshots (to be added)
├── .env.example           # Template for required environment variables
├── .gitignore
├── .dockerignore
├── Dockerfile
├── docker-compose.yml
├── requirements.txt
├── requirements-dev.txt
└── README.md
```

## Setup (Windows PowerShell)

```powershell
# 1. Clone the repository
git clone https://github.com/Muskan-3/Secure-Task.git
cd Secure-Task

# 2. Create a virtual environment
python -m venv .venv

# 3. Allow the activation script to run in this session, then activate
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1

# 4. Install dependencies
pip install -r requirements.txt

# 5. Create your local environment file and set a secret key
Copy-Item .env.example .env
# Open .env and replace the placeholder with a long random value, e.g.:
# python -c "import secrets; print(secrets.token_hex(32))"

# 6. Run the server (--env-file loads SECRET_KEY from .env)
uvicorn app.main:app --reload --env-file .env
```

The app will be available at http://127.0.0.1:8000/, with interactive API docs at
http://127.0.0.1:8000/docs.

All six steps above were run against a fresh clone to confirm they work as written. One
detail worth knowing: if you start uvicorn without `--env-file .env`, it will not read
your `.env` file, and the app falls back to an insecure development key (and prints a
warning). Always include `--env-file .env` for local runs, or set `SECRET_KEY` as a real
environment variable.

By default the app stores data in a local SQLite file (`securetask.db`), created
automatically on first run. This file is listed in `.gitignore` and is not committed.

## Run with Docker

This runs the app together with a real PostgreSQL database, both inside containers.
Requires Docker Desktop to be installed and running.

```powershell
# 1. Clone the repository (skip if you already have it)
git clone https://github.com/Muskan-3/Secure-Task.git
cd Secure-Task

# 2. Create your local environment file and fill in real values:
#    a random SECRET_KEY, and your own POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
Copy-Item .env.example .env
# Generate a key with:
# python -c "import secrets; print(secrets.token_urlsafe(32))"

# 3. Build the images and start both containers in the background
docker compose up -d --build

# 4. Open the app
#    http://localhost:8000/        (web UI)
#    http://localhost:8000/docs    (API docs)
#    http://localhost:8000/health  (health check)

# 5. When you're done, stop the containers
docker compose down
```

`docker compose down` stops and removes the containers but keeps your database data in a
named Docker volume. Running `docker compose up -d` again brings your data right back.
Adding `-v` to the down command (`docker compose down -v`) additionally deletes that
volume and permanently erases the database.

These exact commands were run against this project to confirm they work, including
registering a user, logging in, creating a task, and confirming the task survives an
`app` container restart.

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
| GET | `/docs` | No | Interactive API documentation (Swagger UI) |

Authenticated requests must include an `Authorization: Bearer <token>` header, using the
token returned by `POST /auth/login`. Requesting or modifying a task that does not belong
to the current user returns `404 Not Found`, the same response as for a task that does
not exist at all.

## Running tests

Automated tests are not written yet. See the Roadmap section below.

## Security notes

- Passwords are hashed with bcrypt before being stored; the raw password is never saved.
- Login tokens are signed JWTs that expire after 30 minutes.
- The JWT signing key is read from the `SECRET_KEY` environment variable, never hardcoded.
  If it is not set, the app uses a clearly labeled, insecure development fallback and logs
  a warning, so local runs still work without a real secret being checked into the repo.
- The web UI never inserts user-provided text with `innerHTML`; it uses `textContent` and
  DOM creation methods, so task titles and descriptions cannot be used to inject scripts.
- Every task is tied to the user who created it (`owner_id`). All task endpoints filter by
  the logged-in user, so one account can never read, edit, or delete another account's
  tasks.

## Roadmap (planned)

- [ ] Automated tests (pytest) with coverage reporting
- [x] Dockerfile and docker-compose setup
- [ ] CI pipeline (GitHub Actions) to run tests and lint on every push
- [ ] Static security scanning (Semgrep)
- [ ] Dependency vulnerability scanning (pip-audit)
- [ ] Secret scanning (Gitleaks)
- [ ] Container image scanning (Trivy)
- [ ] Deployment to a live environment

## Screenshots

Screenshots of the web UI will be added here once the interface is finalized.

## Author

**Muskan Shrivastava**

- GitHub: https://github.com/Muskan-3
- LinkedIn: https://www.linkedin.com/in/muskan-shrivastava-75b9a2250/
- Portfolio: https://muskan-portfolio-mr92.onrender.com
