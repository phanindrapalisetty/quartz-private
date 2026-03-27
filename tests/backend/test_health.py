def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_docs_reachable(client):
    r = client.get("/docs")
    assert r.status_code == 200
