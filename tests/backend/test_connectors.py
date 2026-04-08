"""
Connector endpoint tests — file upload and external DB attachment.
"""
import io
import os
import sqlite3
import tempfile

import polars as pl
import pytest


# ── File upload ────────────────────────────────────────────────────────────

def _csv_bytes(content: str) -> bytes:
    return content.encode()


def test_upload_csv(client, session):
    csv = _csv_bytes("name,age,score\nAlice,30,95.5\nBob,25,88.0\nCharlie,35,\n")
    r = client.post(
        "/connectors/upload",
        params={"session_id": session},
        files={"file": ("data.csv", io.BytesIO(csv), "text/csv")},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 3
    assert "name" in data["columns"]
    assert "age" in data["columns"]
    assert data["table_name"] == "data"


def test_upload_csv_with_custom_alias(client, session):
    csv = _csv_bytes("x,y\n1,2\n3,4\n")
    r = client.post(
        "/connectors/upload",
        params={"session_id": session, "table_alias": "coords"},
        files={"file": ("points.csv", io.BytesIO(csv), "text/csv")},
    )
    assert r.status_code == 200
    assert r.json()["table_name"] == "coords"


def test_upload_csv_column_names_sanitized(client, session):
    csv = _csv_bytes("First Name,Last Name,Return %\nAlice,Smith,12.5\n")
    r = client.post(
        "/connectors/upload",
        params={"session_id": session},
        files={"file": ("people.csv", io.BytesIO(csv), "text/csv")},
    )
    assert r.status_code == 200
    cols = r.json()["columns"]
    assert "first_name" in cols
    assert "last_name" in cols
    assert "return__pct" in cols or "return_pct" in cols or any("pct" in c for c in cols)


def test_upload_unsupported_type_returns_400(client, session):
    r = client.post(
        "/connectors/upload",
        params={"session_id": session},
        files={"file": ("report.pdf", io.BytesIO(b"%PDF content"), "application/pdf")},
    )
    assert r.status_code == 400
    assert "Unsupported" in r.json()["detail"]


def test_upload_without_session_returns_401(client):
    csv = _csv_bytes("a,b\n1,2\n")
    r = client.post(
        "/connectors/upload",
        params={"session_id": "fake"},
        files={"file": ("f.csv", io.BytesIO(csv), "text/csv")},
    )
    assert r.status_code == 401


def test_upload_makes_table_queryable(client, session):
    csv = _csv_bytes("product,price\nWidget,9.99\nGadget,24.99\n")
    client.post(
        "/connectors/upload",
        params={"session_id": session},
        files={"file": ("products.csv", io.BytesIO(csv), "text/csv")},
    )

    r = client.post(
        "/query/",
        params={"session_id": session},
        json={"sql": "SELECT product FROM products WHERE price > 10 ORDER BY price"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 1
    assert data["data"][0]["product"] == "Gadget"


# ── External DB attachment (SQLite — bundled with DuckDB, no network needed) ──

@pytest.fixture
def sqlite_db():
    """Creates a temporary SQLite database with test data."""
    with tempfile.NamedTemporaryFile(suffix=".sqlite", delete=False) as f:
        path = f.name
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT, price REAL)")
    conn.executemany(
        "INSERT INTO products VALUES (?, ?, ?)",
        [(1, "Widget", 9.99), (2, "Gadget", 24.99), (3, "Doohickey", 4.99)],
    )
    conn.commit()
    conn.close()
    yield path
    os.unlink(path)


def test_attach_sqlite_db(client, session, sqlite_db):
    r = client.post(
        "/connectors/db/attach",
        params={"session_id": session},
        json={"url": sqlite_db, "alias": "ext_db", "db_type": "sqlite", "read_only": True},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["alias"] == "ext_db"
    assert data["db_type"] == "sqlite"
    table_names = [t["name"] for t in data["tables"]]
    assert "products" in table_names


def test_attach_lists_columns(client, session, sqlite_db):
    client.post(
        "/connectors/db/attach",
        params={"session_id": session},
        json={"url": sqlite_db, "alias": "ext_db", "db_type": "sqlite", "read_only": True},
    )
    r = client.get("/connectors/db/list", params={"session_id": session})
    assert r.status_code == 200
    dbs = r.json()
    assert len(dbs) == 1
    products_table = next(t for t in dbs[0]["tables"] if t["name"] == "products")
    col_names = [c["column"] for c in products_table["columns"]]
    assert "id" in col_names
    assert "name" in col_names
    assert "price" in col_names


def test_attached_db_queryable(client, session, sqlite_db):
    client.post(
        "/connectors/db/attach",
        params={"session_id": session},
        json={"url": sqlite_db, "alias": "ext_db", "db_type": "sqlite", "read_only": True},
    )
    r = client.post(
        "/query/",
        params={"session_id": session},
        json={"sql": "SELECT name, price FROM ext_db.main.products ORDER BY price ASC"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 3
    assert data["data"][0]["name"] == "Doohickey"  # cheapest first


def test_detach_db(client, session, sqlite_db):
    client.post(
        "/connectors/db/attach",
        params={"session_id": session},
        json={"url": sqlite_db, "alias": "temp_db", "db_type": "sqlite", "read_only": True},
    )
    r = client.delete("/connectors/db/temp_db", params={"session_id": session})
    assert r.status_code == 200

    dbs = client.get("/connectors/db/list", params={"session_id": session}).json()
    assert not any(d["alias"] == "temp_db" for d in dbs)


def test_attach_invalid_alias_returns_400(client, session, sqlite_db):
    r = client.post(
        "/connectors/db/attach",
        params={"session_id": session},
        json={"url": sqlite_db, "alias": "bad alias!", "db_type": "sqlite", "read_only": True},
    )
    assert r.status_code == 400
    assert "Alias" in r.json()["detail"]


def test_attach_invalid_db_type_returns_400(client, session):
    r = client.post(
        "/connectors/db/attach",
        params={"session_id": session},
        json={"url": "whatever", "alias": "mydb", "db_type": "oracle", "read_only": True},
    )
    assert r.status_code == 400
