def test_user_b_list_never_contains_user_a_task(client, auth_headers, make_auth_headers):
    client.post("/tasks", json={"title": "User A's secret"}, headers=auth_headers)
    user_b_headers = make_auth_headers()

    response = client.get("/tasks", headers=user_b_headers)
    assert response.status_code == 200
    assert response.json() == []


def test_user_b_cannot_get_user_a_task(client, auth_headers, make_auth_headers):
    task = client.post("/tasks", json={"title": "User A's task"}, headers=auth_headers).json()
    user_b_headers = make_auth_headers()

    response = client.get(f"/tasks/{task['id']}", headers=user_b_headers)
    assert response.status_code == 404


def test_user_b_cannot_update_user_a_task(client, auth_headers, make_auth_headers):
    task = client.post("/tasks", json={"title": "User A's task"}, headers=auth_headers).json()
    user_b_headers = make_auth_headers()

    response = client.put(
        f"/tasks/{task['id']}", json={"title": "Hacked by B"}, headers=user_b_headers
    )
    assert response.status_code == 404

    unchanged = client.get(f"/tasks/{task['id']}", headers=auth_headers)
    assert unchanged.json()["title"] == "User A's task"


def test_user_b_cannot_delete_user_a_task(client, auth_headers, make_auth_headers):
    task = client.post("/tasks", json={"title": "User A's task"}, headers=auth_headers).json()
    user_b_headers = make_auth_headers()

    response = client.delete(f"/tasks/{task['id']}", headers=user_b_headers)
    assert response.status_code == 404

    still_there = client.get(f"/tasks/{task['id']}", headers=auth_headers)
    assert still_there.status_code == 200
