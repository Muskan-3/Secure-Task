def test_index_page_served(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]


def test_static_app_js_served(client):
    response = client.get("/static/app.js")
    assert response.status_code == 200
