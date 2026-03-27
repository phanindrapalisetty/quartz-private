"""
Shared fixtures for backend integration tests.

Run from repo root:
    pip install -r tests/backend/requirements.txt
    pytest tests/backend/ -v
"""
import os
import sys

# Must set env vars before importing app (Pydantic Settings loads at import time)
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id.apps.googleusercontent.com")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-secret")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../backend"))

import polars as pl
import pytest
from fastapi.testclient import TestClient

from main import app
from services.duckdb_engine import duckdb_engine
from services.session_store import session_store


@pytest.fixture(scope="function")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="function")
def session():
    """Real session created directly in the store — bypasses Google OAuth."""
    sid = session_store.create({
        "access_token": "test-access-token",
        "refresh_token": "test-refresh-token",
        "client_id": "test-client-id",
        "client_secret": "test-secret",
        "user_email": "testuser@example.com",
        "user_name": "Test User",
        "user_picture": "https://example.com/avatar.jpg",
    })
    yield sid
    session_store.delete(sid)
    duckdb_engine.close(sid)


@pytest.fixture(scope="function")
def session_with_data(session):
    """Session with a pre-loaded DataFrame so query tests have a table to hit."""
    df = pl.DataFrame({
        "id":      [1, 2, 3, 4, 5],
        "name":    ["Alice", "Bob", "Charlie", "Diana", "Eve"],
        "revenue": [1000.0, 2500.5, None, 800.0, 3200.0],
        "active":  [True, True, False, True, True],
    })
    duckdb_engine.load_dataframe(session, df, "test_users")
    return session
