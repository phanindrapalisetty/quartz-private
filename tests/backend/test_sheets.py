"""
Sheets endpoint tests.

Google Drive/Sheets API calls are mocked with unittest.mock.patch.
DuckDB loading is real.
"""
from unittest.mock import patch

import polars as pl
import pytest

from services.duckdb_engine import duckdb_engine


# ── /sheets/loaded ─────────────────────────────────────────────────────────

def test_loaded_tables_empty_initially(client, session):
    r = client.get("/sheets/loaded", params={"session_id": session})
    assert r.status_code == 200
    assert r.json() == []


def test_loaded_tables_after_direct_load(client, session):
    df = pl.DataFrame({"col_a": [1, 2], "col_b": ["x", "y"]})
    duckdb_engine.load_dataframe(session, df, "my_table")

    r = client.get("/sheets/loaded", params={"session_id": session})
    assert r.status_code == 200
    tables = r.json()
    assert len(tables) == 1
    assert tables[0]["name"] == "my_table"
    cols = [c["column"] for c in tables[0]["schema"]]
    assert "col_a" in cols
    assert "col_b" in cols


def test_loaded_tables_invalid_session(client):
    r = client.get("/sheets/loaded", params={"session_id": "bad"})
    assert r.status_code == 401


# ── /sheets/loaded/{table_name} DELETE ────────────────────────────────────

def test_drop_table(client, session):
    df = pl.DataFrame({"x": [1, 2, 3]})
    duckdb_engine.load_dataframe(session, df, "drop_me")

    r = client.delete("/sheets/loaded/drop_me", params={"session_id": session})
    assert r.status_code == 200
    assert r.json() == {"ok": True}

    # Should be gone
    tables = client.get("/sheets/loaded", params={"session_id": session}).json()
    assert not any(t["name"] == "drop_me" for t in tables)


def test_drop_nonexistent_table(client, session):
    # Dropping a table that doesn't exist should not raise — DuckDB uses IF EXISTS
    r = client.delete("/sheets/loaded/ghost_table", params={"session_id": session})
    assert r.status_code == 200


# ── /sheets/{id}/load (Google Sheets API mocked) ──────────────────────────

def _make_sheets_values(headers, rows):
    """Helper to build the dict that the Sheets API returns."""
    return {"values": [headers] + rows}


@patch("routers.sheets.fetch_tab")
def test_load_sheet_tab(mock_fetch, client, session):
    mock_fetch.return_value = pl.DataFrame({
        "date":   ["2024-01-01", "2024-01-02"],
        "amount": [100.0, 200.0],
    })

    r = client.post(
        "/sheets/fake-spreadsheet-id/load",
        params={"session_id": session},
        json={"tab_name": "Sheet1"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["rows"] == 2
    assert "date" in data["columns"]
    assert data["table_name"] == "sheet1"  # sanitized to snake_case


@patch("routers.sheets.fetch_tab")
def test_load_sheet_with_custom_alias(mock_fetch, client, session):
    mock_fetch.return_value = pl.DataFrame({"val": [1, 2, 3]})

    r = client.post(
        "/sheets/fake-id/load",
        params={"session_id": session},
        json={"tab_name": "Sheet1", "table_alias": "my_custom_name"},
    )
    assert r.status_code == 200
    assert r.json()["table_name"] == "my_custom_name"


@patch("routers.sheets.fetch_tab")
def test_load_empty_sheet_returns_400(mock_fetch, client, session):
    mock_fetch.return_value = pl.DataFrame()

    r = client.post(
        "/sheets/fake-id/load",
        params={"session_id": session},
        json={"tab_name": "EmptySheet"},
    )
    assert r.status_code == 400
    assert "empty" in r.json()["detail"].lower()


@patch("routers.sheets.list_spreadsheets")
def test_list_sheets(mock_list, client, session):
    mock_list.return_value = [
        {"id": "abc", "name": "Sales 2024", "modifiedTime": "2024-03-01T00:00:00Z"},
        {"id": "def", "name": "Inventory",  "modifiedTime": "2024-02-15T00:00:00Z"},
    ]

    r = client.get("/sheets/list", params={"session_id": session})
    assert r.status_code == 200
    sheets = r.json()
    assert len(sheets) == 2
    assert sheets[0]["name"] == "Sales 2024"


@patch("routers.sheets.list_tabs")
def test_list_tabs(mock_list, client, session):
    mock_list.return_value = [
        {"id": 0, "name": "Sheet1"},
        {"id": 1, "name": "Summary"},
    ]

    r = client.get("/sheets/fake-id/tabs", params={"session_id": session})
    assert r.status_code == 200
    tabs = r.json()
    assert len(tabs) == 2
    assert tabs[1]["name"] == "Summary"
