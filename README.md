# Quartz

Query your Google Sheets and uploaded files with SQL. No service accounts. No sharing spreadsheets with bots. Just login with your Google account and run queries.

## What it is

Quartz is an open-source, self-hosted SQL query engine that lets multiple users connect their own Google accounts, load their own spreadsheets and files, and query them using DuckDB — all without ever granting a service account access to their data.

Each user's data is isolated in their own in-memory DuckDB session. Tables from multiple sheets or uploads can be joined together in a single query.

## Features

- **Per-user Google OAuth** — each logged-in user sees only their own Google Drive spreadsheets
- **Google Sheets loader** — browse your spreadsheets, pick a tab, load it as a SQL table
- **File upload** — upload CSV or Excel (`.xlsx`) files directly
- **SQL editor** — run any DuckDB-compatible SQL, including cross-table JOINs
- **Schema browser** — sidebar shows all loaded tables and column types
- **CSV export** — download query results as CSV
- **Drop tables** — unload any table from your session
- **Session persistence** — stay logged in across browser reloads
- **Multi-user** — each user's session is fully isolated; one Docker deployment serves many users

## Architecture

```
Browser
  │
  ├── :8501  Streamlit frontend  (Python, multipage)
  │              │
  │              └── API_URL=http://backend:8000  (Docker internal)
  │
  └── :8000  FastAPI backend
                 │
                 ├── Google OAuth 2.0 (Authorization Code flow)
                 ├── In-memory SessionStore (keyed by session_id)
                 ├── DuckDB engine (one in-memory connection per session)
                 └── Google Drive + Sheets API (per-user credentials)
```

### Two-URL pattern

Streamlit runs server-side Python inside Docker. It needs to talk to the FastAPI backend over Docker's internal network (`http://backend:8000`). But the browser's login button must point to the publicly reachable address (`http://localhost:8000`). Two separate env vars handle this:

| Variable | Used by | Value |
|---|---|---|
| `API_URL` | Streamlit Python (server-side requests) | `http://backend:8000` |
| `PUBLIC_API_URL` | Browser links (login button) | `http://localhost:8000` |

### Session model

1. User clicks "Login with Google" → browser navigates to `PUBLIC_API_URL/auth/login`
2. FastAPI redirects to Google OAuth consent screen
3. Google redirects back to `GOOGLE_REDIRECT_URI` (`/auth/callback`)
4. Backend exchanges the code for an access token, creates a session in `SessionStore`, and redirects the browser to `STREAMLIT_URL?session_id=<id>`
5. Streamlit stores the session ID in a browser cookie (7-day TTL, sliding window)
6. All subsequent API calls include `?session_id=<id>` as a query param
7. Sessions expire after 7 days of inactivity

### Data flow (Google Sheets load)

```
User selects spreadsheet + tab
  → GET /sheets/{id}/tabs          list tabs via Drive API
  → POST /sheets/{id}/load         fetch tab via Sheets API → Polars DataFrame
                                   → column names sanitized to snake_case
                                   → registered in user's DuckDB connection
  → GET /sheets/loaded             returns table list + schema
```

### Data flow (SQL query)

```
User writes SQL → POST /query/
  → duckdb_engine.query(session_id, sql)
  → returns rows, columns, execution_time_ms
  → frontend renders with Polars + Streamlit dataframe
```

## Stack

| Layer | Technology |
|---|---|
| Frontend | [Streamlit](https://streamlit.io) |
| Backend | [FastAPI](https://fastapi.tiangolo.com) + [Uvicorn](https://www.uvicorn.org) |
| Query engine | [DuckDB](https://duckdb.org) (in-memory, per session) |
| Data layer | [Polars](https://pola.rs) |
| Auth | Google OAuth 2.0 (Authorization Code flow) |
| Sheets/Drive | `google-api-python-client` |
| Excel parsing | [fastexcel](https://github.com/ToucanToco/fastexcel) |
| Containerisation | Docker + Docker Compose |

## Getting started

### Prerequisites

- Docker and Docker Compose
- A Google Cloud project with the **Google Drive API** and **Google Sheets API** enabled

### 1. Create a Google OAuth app

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Add an Authorized redirect URI: `http://localhost:8000/auth/callback`
5. Copy the **Client ID** and **Client Secret**

Also enable both APIs:
- [Google Drive API](https://console.developers.google.com/apis/api/drive.googleapis.com)
- [Google Sheets API](https://console.developers.google.com/apis/api/sheets.googleapis.com)

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/callback
STREAMLIT_URL=http://localhost:8501
```

The `API_URL` and `PUBLIC_API_URL` values are set in `docker-compose.yml` and generally don't need changing for local development.

### 3. Run

```bash
docker-compose up --build
```

- Frontend: http://localhost:8501
- Backend API docs: http://localhost:8000/docs

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | — | OAuth client ID from GCP |
| `GOOGLE_CLIENT_SECRET` | — | OAuth client secret from GCP |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8000/auth/callback` | Must match GCP exactly |
| `STREAMLIT_URL` | `http://localhost:8501` | Where backend redirects after login |
| `API_URL` | `http://backend:8000` | Backend URL for server-side Streamlit requests |
| `PUBLIC_API_URL` | `http://localhost:8000` | Backend URL for browser-side links |
| `SECRET_KEY` | `change-me-in-production` | Used for internal signing |

## API reference

The full interactive API reference is available at `http://localhost:8000/docs` when the backend is running.

### Auth

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/login` | Redirect to Google OAuth consent screen |
| `GET` | `/auth/callback` | OAuth callback — exchanges code, creates session |
| `GET` | `/auth/me` | Return logged-in user info |
| `DELETE` | `/auth/logout` | Delete session |

### Sheets

| Method | Path | Description |
|---|---|---|
| `GET` | `/sheets/list` | List user's Google Drive spreadsheets |
| `GET` | `/sheets/{id}/tabs` | List tabs in a spreadsheet |
| `POST` | `/sheets/{id}/load` | Load a tab into DuckDB |
| `GET` | `/sheets/loaded` | List loaded tables with schema |
| `DELETE` | `/sheets/loaded/{table}` | Drop a loaded table |

### Connectors

| Method | Path | Description |
|---|---|---|
| `POST` | `/connectors/upload` | Upload a CSV or Excel file into DuckDB |

### Query

| Method | Path | Description |
|---|---|---|
| `POST` | `/query/` | Execute SQL, returns rows + execution time |

## Project structure

```
quartz/
├── backend/
│   ├── core/
│   │   └── config.py          # Pydantic settings (loaded from .env)
│   ├── models/
│   │   └── schemas.py         # Pydantic request/response models
│   ├── routers/
│   │   ├── auth.py            # Google OAuth flow
│   │   ├── sheets.py          # Drive + Sheets endpoints
│   │   ├── connectors.py      # File upload endpoint
│   │   └── query.py           # SQL execution endpoint
│   ├── services/
│   │   ├── session_store.py   # In-memory session store (Redis-swappable)
│   │   ├── duckdb_engine.py   # Per-session DuckDB connections
│   │   └── google_sheets.py   # Drive + Sheets API helpers
│   ├── Dockerfile
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── pages/
│   │   ├── 1_Load.py          # Google Sheets picker + file upload
│   │   └── 2_Query.py         # SQL editor + results
│   ├── utils/
│   │   └── session.py         # Cookie-based session persistence
│   ├── app.py                 # Home page + login gate
│   ├── Dockerfile
│   └── requirements.txt
├── docker-compose.yml
├── .env.example
└── README.md
```

## Deploying to a server

To deploy on a remote host (e.g. `myserver.com`), update the following:

**`.env`**
```env
GOOGLE_REDIRECT_URI=http://myserver.com:8000/auth/callback
STREAMLIT_URL=http://myserver.com:8501
```

**`docker-compose.yml`**
```yaml
frontend:
  environment:
    API_URL: http://backend:8000           # unchanged — internal Docker DNS
    PUBLIC_API_URL: http://myserver.com:8000
```

Also add `http://myserver.com:8000/auth/callback` to the **Authorized redirect URIs** in Google Cloud Console.

For HTTPS, put an nginx reverse proxy in front of both services.

## Swapping the session store for Redis

`SessionStore` in `backend/services/session_store.py` uses a plain Python dict. To scale horizontally or survive backend restarts, implement the same four-method interface (`create`, `get`, `update`, `delete`) backed by `redis-py` and swap the singleton:

```python
# services/session_store.py
session_store = RedisSessionStore(url=os.getenv("REDIS_URL"))
```

## Contributing

Pull requests are welcome. For large changes, open an issue first to discuss what you'd like to change.

```bash
# Run backend locally (outside Docker)
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Run frontend locally (outside Docker)
cd frontend && pip install -r requirements.txt
streamlit run app.py
```

## License

MIT
