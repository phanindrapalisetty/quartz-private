"""
Auth endpoint tests.

Google OAuth is NOT called — we create sessions directly via session_store
and verify that the /auth/me and /auth/logout endpoints behave correctly.
"""


def test_me_returns_user_info(client, session):
    r = client.get("/auth/me", params={"session_id": session})
    assert r.status_code == 200
    data = r.json()
    assert data["email"] == "testuser@example.com"
    assert data["name"] == "Test User"
    assert "picture" in data


def test_me_invalid_session_returns_401(client):
    r = client.get("/auth/me", params={"session_id": "not-a-real-session"})
    assert r.status_code == 401


def test_me_missing_session_id_returns_422(client):
    # FastAPI returns 422 when a required query param is missing
    r = client.get("/auth/me")
    assert r.status_code == 422


def test_logout_clears_session(client, session):
    r = client.delete("/auth/logout", params={"session_id": session})
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    # Session should no longer exist
    r2 = client.get("/auth/me", params={"session_id": session})
    assert r2.status_code == 401


def test_login_redirects_to_google(client):
    # Follow=False so we capture the redirect instead of following it
    r = client.get("/auth/login", follow_redirects=False)
    assert r.status_code in (302, 307)
    location = r.headers["location"]
    assert "accounts.google.com" in location
    assert "client_id=test-client-id" in location
    assert "response_type=code" in location
