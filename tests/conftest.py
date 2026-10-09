import os

# These must be set before app.main (and app.security) are imported, because both
# read environment variables at import time:
#   - SECRET_KEY: app.security reads this once, at module load.
#   - DATABASE_URL: app.main runs Base.metadata.create_all(bind=engine) at import
#     time, using app.database's module-level engine. Pointing that at an in-memory
#     database means importing the app never touches the real securetask.db file.
os.environ["SECRET_KEY"] = "test-secret-key-for-pytest-only-do-not-use-in-prod"
os.environ["DATABASE_URL"] = "sqlite://"

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app

DEFAULT_PASSWORD = "password123"


@pytest.fixture
def client():
    """A TestClient wired to its own fresh, in-memory database.

    Each test gets a brand-new SQLite database that lives only in memory and is
    thrown away when the test ends, so tests can't see each other's data and never
    touch the real securetask.db file on disk.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)
    engine.dispose()


def _register_and_login(client, email, password=DEFAULT_PASSWORD):
    client.post("/auth/register", json={"email": email, "password": password})
    response = client.post("/auth/login", data={"username": email, "password": password})
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers(client):
    """Registers and logs in one user ('user A'); returns their auth header."""
    return _register_and_login(client, "user-a@example.com")


@pytest.fixture
def make_auth_headers(client):
    """Factory for registering additional users, e.g. 'user B' in isolation tests."""
    count = {"n": 0}

    def _make(email=None, password=DEFAULT_PASSWORD):
        count["n"] += 1
        email = email or f"user-b-{count['n']}@example.com"
        return _register_and_login(client, email, password)

    return _make
