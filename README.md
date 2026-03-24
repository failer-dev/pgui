# pgui

A lightweight PostgreSQL data browser and editor for local development. Browse tables, edit rows, and filter data — no setup beyond a connection string.

![pgui screenshot](assets/showcase_01.png)

## Features

- Browse tables across multiple schemas
- Inline row editing with primary key-based updates
- Full-text filter across all columns
- Pagination for large tables
- Read-only mode
- Auto-connect via `DATABASE_URL`
- Single self-contained binary + embedded frontend

## Quick Start

The fastest way to try pgui is with the included demo environment:

```bash
task example:up
```

Then open [http://localhost:8080](http://localhost:8080).

> Requires [Docker](https://docs.docker.com/get-docker/) and [Task](https://taskfile.dev/installation/).

## Docker

```bash
docker run -p 8080:8080 \
  -e DATABASE_URL="postgres://user:password@host:5432/dbname?sslmode=disable" \
  ghcr.io/failer-dev/pgui:latest
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string. If set, pgui auto-connects on startup. |
| `PORT` | `8080` | HTTP listen port. |
| `READ_ONLY` | `false` | Set to `true` to disable all write operations. |

If `DATABASE_URL` is not set, pgui starts with a connection screen where you can enter the URL manually.

## Security Note

pgui is designed for **local use only**. It has no authentication layer — do not expose it on a public or shared network.

