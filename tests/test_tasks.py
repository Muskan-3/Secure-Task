import pytest

ENDPOINTS_REQUIRING_AUTH = [
    ("GET", "/tasks"),
    ("POST", "/tasks"),
    ("GET", "/tasks/1"),
    ("PUT", "/tasks/1"),
    ("DELETE", "/tasks/1"),
]


@pytest.mark.parametrize("method,path", ENDPOINTS_REQUIRING_AUTH)
def test_requires_auth(client, method, path):
    response = client.request(method, path)
    assert response.status_code == 401


def test_create_task(client, auth_headers):
    response = client.post("/tasks", json={"title": "Write tests"}, headers=auth_headers)
    assert response.status_code == 201
    body = response.json()
    assert body["title"] == "Write tests"
    assert body["completed"] is False


def test_create_task_missing_title(client, auth_headers):
    response = client.post("/tasks", json={}, headers=auth_headers)
    assert response.status_code == 422


def test_list_tasks(client, auth_headers):
    client.post("/tasks", json={"title": "Task 1"}, headers=auth_headers)
    client.post("/tasks", json={"title": "Task 2"}, headers=auth_headers)
    response = client.get("/tasks", headers=auth_headers)
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_get_single_task(client, auth_headers):
    created = client.post("/tasks", json={"title": "Read a book"}, headers=auth_headers).json()
    response = client.get(f"/tasks/{created['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["title"] == "Read a book"


def test_get_missing_task(client, auth_headers):
    response = client.get("/tasks/999", headers=auth_headers)
    assert response.status_code == 404


def test_update_task_title(client, auth_headers):
    created = client.post("/tasks", json={"title": "Old title"}, headers=auth_headers).json()
    response = client.put(
        f"/tasks/{created['id']}", json={"title": "New title"}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["title"] == "New title"


def test_update_task_completed(client, auth_headers):
    created = client.post("/tasks", json={"title": "Finish me"}, headers=auth_headers).json()
    response = client.put(
        f"/tasks/{created['id']}", json={"completed": True}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["completed"] is True


def test_delete_task(client, auth_headers):
    created = client.post("/tasks", json={"title": "Delete me"}, headers=auth_headers).json()
    response = client.delete(f"/tasks/{created['id']}", headers=auth_headers)
    assert response.status_code == 204

    follow_up = client.get(f"/tasks/{created['id']}", headers=auth_headers)
    assert follow_up.status_code == 404
