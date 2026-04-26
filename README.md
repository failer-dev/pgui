# pgui

[한국어 문서](README_kr.md)

A lightweight PostgreSQL data browser and editor for local development. Browse tables, edit rows, run queries, and inspect schema relationships from a local web UI.

![pgui overview](assets/readme/overview.png)

## Why pgui?

When developing locally against a PostgreSQL database, you often need to check data, tweak a few rows, run a query, or understand foreign key relationships. Full database workbenches like pgAdmin or DataGrip can be more than you need for that loop.

pgui runs as a single executable or Docker container, connects via your `DATABASE_URL`, and keeps common local database tasks in one browser tab. It includes read-only mode and environment labels for safer local sessions.

---

## Features

### Table Browsing and Inline Editing
Browse schemas, search for tables, and view data with adjustable density. The data grid can filter across columns, sort, and paginate through large datasets.
Rows can be edited through primary key-based updates. Edits stay as drafts until you review, save, or discard them.

![Data Grid Editing](assets/readme/data-grid-editing.webp)

### SQL Console
Write queries with a built-in CodeMirror editor featuring PostgreSQL syntax highlighting, schema-aware autocomplete, snippets, and auto-formatting. Execute queries via `Cmd/Ctrl+Enter` and view the result rows or affected row count alongside query execution time. Write and DDL operations require confirmation before execution.

![SQL Console](assets/readme/sql-console.webp)

### ERD Diagram
View foreign key relationships grouped by schema. Switch between Focus, Schema, and All modes to inspect specific relationships or the wider schema graph with zoom, pan, and fit interactions.

![Database Diagram](assets/readme/diagram.webp)

### Table Structure and Schema Types
Inspect table structures without writing `\d` queries. The Structure tab lists columns, data types, nullability rules, default values, primary keys, and editability.

![Table Structure](assets/readme/structure.png)

### Safety and Workflow Options
- **Dark, Light, and System Themes**: Theme support for local sessions.
- **Split View and Command Palette**: Side-by-side views and table jumping.
- **Read-only Mode**: Disable write operations when browsing data.
- **JSON Preview**: View, format, and copy nested JSON structures.

---

## Quick Start

To try pgui with sample data, use the included demo environment (requires Docker and Task):

```bash
task example:up
```

Then open [http://localhost:8080](http://localhost:8080).

## Docker

Run pgui as a standalone container connected to your local database:

```bash
docker run -p 127.0.0.1:8080:8080 \
  -e HOST=0.0.0.0 \
  -e DATABASE_URL="postgres://user:password@host:5432/dbname?sslmode=disable" \
  ghcr.io/failer-dev/pgui:latest
```

## Configuration

Customize pgui behavior via environment variables:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string. If set, pgui auto-connects on startup. |
| `HOST` | `127.0.0.1` | HTTP listen host. Docker images set this to `0.0.0.0`; publish ports to `127.0.0.1` for local-only access. |
| `PORT` | `8080` | HTTP listen port. |
| `CSRF_ALLOWED_ORIGINS` | — | Comma-separated browser origins allowed to call POST APIs in addition to localhost, for example `https://pgui.example.internal`. |
| `READ_ONLY` | `false` | Set to `true` to disable all write operations. |
| `BRAND_SECTION_NAME` | `pgui` | Optional replacement for the header brand text. |
| `BRAND_SECTION_ENV` | — | Optional environment label shown next to the header brand. `prod` and `production` are highlighted as high-risk contexts. |
| `THEME` | `system` | Initial theme preference. Supported values: `light`, `dark`, `system`. |

If `DATABASE_URL` is not set, pgui starts with a connection screen where you can enter the URL manually.

## Local Development

Build the frontend before running the Go server from the repository root:

```bash
cd frontend && npm install && npm run build
cd ..
PORT=8080 go run ./backend
```

The server dynamically resolves `frontend/dist` when launched from `backend/` during local development.

## Security Note

> [!CAUTION]
> pgui is an unauthenticated local development tool. Do not expose it directly to the public internet or to a shared network.

pgui can reduce common local-browser risks, but it is not a security boundary for your database.

What pgui does:

- Listens on `127.0.0.1` by default for local binary runs.
- Documents Docker usage with `127.0.0.1:8080:8080` port publishing for local-only access.
- Rejects browser POST requests from untrusted origins.
- Requires JSON POST requests and a CSRF token for browser-originated write requests.
- Supports `READ_ONLY=true` to disable write operations in the UI and API.
- Limits SQL console result size and execution time to reduce accidental resource exhaustion.

What pgui does not do:

- It does not provide login, sessions, user roles, or audit logs.
- It does not replace a VPN, SSO/OIDC proxy, reverse-proxy authentication, firewall, or Kubernetes network policy.
- It does not make a high-privilege database user safe to share.
- It does not prevent a user with access to pgui from running allowed SQL against the configured database.
- It does not protect a publicly exposed Docker port such as `0.0.0.0:8080:8080`.

If you run pgui in a sidecar or internal environment:

- Keep the pgui container private and expose it only through a trusted proxy or internal access path.
- Put authentication and IP policy in front of pgui, for example with a company VPN, SSO proxy, Basic Auth proxy, or ingress policy.
- Set `CSRF_ALLOWED_ORIGINS` to the exact browser origin users will access, such as `https://pgui.example.internal`.
- Use a least-privilege database account. Prefer `READ_ONLY=true` for production or shared databases.
- Bind Docker ports to loopback for local runs: `-p 127.0.0.1:8080:8080`.
- Avoid storing or sharing broad production `DATABASE_URL` values in shell history, compose files, screenshots, or issue reports.
