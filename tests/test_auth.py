def test_register_success(client):
    response = client.post(
        "/auth/register", json={"email": "alice@example.com", "password": "password123"}
    )
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "alice@example.com"
    assert "id" in body


def test_register_response_never_contains_password_or_hash(client):
    response = client.post(
        "/auth/register", json={"email": "frank@example.com", "password": "password123"}
    )
    body = response.json()
    assert "password" not in body
    assert "hashed_password" not in body
    assert "password123" not in response.text
    assert "hashed_password" not in response.text


def test_register_duplicate_email(client):
    client.post("/auth/register", json={"email": "bob@example.com", "password": "password123"})
    response = client.post(
        "/auth/register", json={"email": "bob@example.com", "password": "password123"}
    )
    assert response.status_code == 400


def test_register_short_password(client):
    response = client.post(
        "/auth/register", json={"email": "carol@example.com", "password": "short"}
    )
    assert response.status_code == 422


def test_register_invalid_email(client):
    response = client.post(
        "/auth/register", json={"email": "not-an-email", "password": "password123"}
    )
    assert response.status_code == 422


def test_login_success_returns_token(client):
    client.post("/auth/register", json={"email": "dave@example.com", "password": "password123"})
    response = client.post(
        "/auth/login", data={"username": "dave@example.com", "password": "password123"}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert len(body["access_token"]) > 10


def test_login_wrong_password(client):
    client.post("/auth/register", json={"email": "erin@example.com", "password": "password123"})
    response = client.post(
        "/auth/login", data={"username": "erin@example.com", "password": "wrongpass1"}
    )
    assert response.status_code == 401


def test_login_unknown_email(client):
    response = client.post(
        "/auth/login", data={"username": "nobody@example.com", "password": "password123"}
    )
    assert response.status_code == 401
