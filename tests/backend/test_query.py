"""
SQL query endpoint tests.

Uses real DuckDB — no mocking. Data is loaded directly via duckdb_engine.
"""
import polars as pl
import pytest

from services.duckdb_engine import duckdb_engine


def test_basic_select(client, session_with_data):
    r = client.post(
        "/query/",
        params={"session_id": session_with_data},
        json={"sql": "SELECT * FROM test_users ORDER BY id"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 5
    assert set(data["columns"]) == {"id", "name", "revenue", "active"}
    assert data["execution_time_ms"] >= 0


def test_query_with_filter(client, session_with_data):
    r = client.post(
        "/query/",
        params={"session_id": session_with_data},
        json={"sql": "SELECT name FROM test_users WHERE active = true ORDER BY name"},
    )
    assert r.status_code == 200
    data = r.json()
    names = [row["name"] for row in data["data"]]
    assert "Charlie" not in names  # active=False
    assert "Alice" in names


def test_query_returns_null_values(client, session_with_data):
    r = client.post(
        "/query/",
        params={"session_id": session_with_data},
        json={"sql": "SELECT name, revenue FROM test_users WHERE revenue IS NULL"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 1
    assert data["data"][0]["name"] == "Charlie"
    assert data["data"][0]["revenue"] is None


def test_query_aggregation(client, session_with_data):
    r = client.post(
        "/query/",
        params={"session_id": session_with_data},
        json={"sql": "SELECT COUNT(*) AS total, SUM(revenue) AS total_rev FROM test_users"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 1
    assert data["data"][0]["total"] == 5


def test_cross_table_join(client, session):
    # Load two tables then join them
    orders = pl.DataFrame({
        "user_id": [1, 1, 2, 3],
        "amount":  [50.0, 30.0, 80.0, 20.0],
    })
    users = pl.DataFrame({
        "id":   [1, 2, 3],
        "name": ["Alice", "Bob", "Charlie"],
    })
    duckdb_engine.load_dataframe(session, users, "users")
    duckdb_engine.load_dataframe(session, orders, "orders")

    r = client.post(
        "/query/",
        params={"session_id": session},
        json={"sql": """
            SELECT u.name, SUM(o.amount) AS total
            FROM orders o JOIN users u ON o.user_id = u.id
            GROUP BY u.name ORDER BY total DESC
        """},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 3
    assert data["data"][0]["name"] == "Alice"  # 80.0 total


def test_empty_result_set(client, session_with_data):
    r = client.post(
        "/query/",
        params={"session_id": session_with_data},
        json={"sql": "SELECT * FROM test_users WHERE 1=0"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 0
    assert data["data"] == []
    assert len(data["columns"]) > 0  # columns still present


def test_invalid_sql_returns_error(client, session_with_data):
    r = client.post(
        "/query/",
        params={"session_id": session_with_data},
        json={"sql": "SELECT * FROM table_that_does_not_exist"},
    )
    assert r.status_code in (400, 500)
    assert "detail" in r.json()


def test_query_without_session_returns_401(client):
    r = client.post(
        "/query/",
        params={"session_id": "fake"},
        json={"sql": "SELECT 1"},
    )
    assert r.status_code == 401


def test_query_execution_time_is_present(client, session_with_data):
    r = client.post(
        "/query/",
        params={"session_id": session_with_data},
        json={"sql": "SELECT 42 AS answer"},
    )
    assert r.status_code == 200
    assert "execution_time_ms" in r.json()
