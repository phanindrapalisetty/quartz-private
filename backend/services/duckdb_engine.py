import re
import duckdb
import polars as pl
from typing import Dict, List


class DuckDBEngine:
    """
    One DuckDB in-memory connection per session.
    Tables are registered from DataFrames and persist for the session lifetime.
    External databases (Postgres, MySQL, SQLite) can be attached per session.
    """

    def __init__(self):
        self._connections: Dict[str, duckdb.DuckDBPyConnection] = {}
        # session_id → {alias: db_type}
        self._attached: Dict[str, Dict[str, str]] = {}

    def _conn(self, session_id: str) -> duckdb.DuckDBPyConnection:
        if session_id not in self._connections:
            self._connections[session_id] = duckdb.connect(":memory:")
        return self._connections[session_id]

    # ── In-memory tables ───────────────────────────────────────────────────

    def load_dataframe(self, session_id: str, df: pl.DataFrame, name: str) -> str:
        conn = self._conn(session_id)
        safe = self._sanitize(name)
        conn.execute(f"DROP VIEW IF EXISTS {safe}")
        conn.register(safe, df)
        return safe

    def query(self, session_id: str, sql: str) -> pl.DataFrame:
        return self._conn(session_id).execute(sql).pl()

    def list_tables(self, session_id: str) -> List[str]:
        rows = self._conn(session_id).execute("SHOW TABLES").fetchall()
        return [r[0] for r in rows]

    def describe(self, session_id: str, table: str) -> List[dict]:
        rows = self._conn(session_id).execute(f"DESCRIBE {table}").fetchall()
        return [{"column": r[0], "type": r[1]} for r in rows]

    def drop_table(self, session_id: str, table: str) -> None:
        conn = self._conn(session_id)
        conn.execute(f"DROP VIEW IF EXISTS {table}")
        conn.execute(f"DROP TABLE IF EXISTS {table}")

    # ── External database connectors ───────────────────────────────────────

    def attach_database(
        self,
        session_id: str,
        url: str,
        alias: str,
        db_type: str,
        read_only: bool = True,
    ) -> None:
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', alias):
            raise ValueError("Alias must contain only letters, numbers, and underscores")

        conn = self._conn(session_id)

        # Detach cleanly if already attached under the same alias
        try:
            conn.execute(f"DETACH {alias}")
        except Exception:
            pass

        ro = "READ_ONLY" if read_only else "READ_WRITE"

        if db_type == "postgres":
            conn.execute("INSTALL postgres; LOAD postgres;")
            conn.execute(f"ATTACH '{url}' AS {alias} (TYPE POSTGRES, {ro})")
        elif db_type == "mysql":
            conn.execute("INSTALL mysql; LOAD mysql;")
            conn.execute(f"ATTACH '{url}' AS {alias} (TYPE MYSQL)")
        elif db_type == "sqlite":
            conn.execute("INSTALL sqlite; LOAD sqlite;")
            conn.execute(f"ATTACH '{url}' AS {alias} (TYPE SQLITE, {ro})")
        else:
            raise ValueError(f"Unsupported DB type: {db_type!r}. Use postgres, mysql, or sqlite.")

        self._attached.setdefault(session_id, {})[alias] = db_type

    def detach_database(self, session_id: str, alias: str) -> None:
        self._conn(session_id).execute(f"DETACH {alias}")
        self._attached.get(session_id, {}).pop(alias, None)

    def list_attached_databases(self, session_id: str) -> List[dict]:
        attached = self._attached.get(session_id, {})
        if not attached:
            return []

        conn = self._conn(session_id)
        try:
            # SHOW ALL TABLES → (database, schema, name, column_names, column_types, temporary)
            all_rows = conn.execute("SHOW ALL TABLES").fetchall()
        except Exception:
            return []

        result = []
        for alias, db_type in attached.items():
            tables = []
            for row in all_rows:
                if row[0] != alias:
                    continue
                col_names = row[3] if isinstance(row[3], list) else []
                col_types = row[4] if isinstance(row[4], list) else []
                tables.append({
                    "full_name": f"{row[0]}.{row[1]}.{row[2]}",
                    "name": row[2],
                    "schema_name": row[1],
                    "columns": [{"column": n, "type": t} for n, t in zip(col_names, col_types)],
                })
            result.append({"alias": alias, "db_type": db_type, "tables": tables})

        return result

    # ── Lifecycle ──────────────────────────────────────────────────────────

    def close(self, session_id: str) -> None:
        conn = self._connections.pop(session_id, None)
        self._attached.pop(session_id, None)
        if conn:
            conn.close()

    @staticmethod
    def _sanitize(name: str) -> str:
        safe = re.sub(r"[^a-zA-Z0-9_]", "_", name).lower()
        return f"t_{safe}" if safe[0].isdigit() else safe


duckdb_engine = DuckDBEngine()
