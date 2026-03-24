# Example Demo Environment

This directory contains a fully reproducible local demo for `pgui`.

## What it starts

- `postgres:16-alpine`
- `pgui` built from the repository root `Dockerfile`

The app container receives `DATABASE_URL=postgres://postgres:postgres@postgres:5432/ecommerce_demo?sslmode=disable`, so it auto-connects on startup and lands directly in the main editor UI.

## Commands

Run these from the repository root:

```bash
task example:up
task example:logs
task example:down
task example:reset
```

## Access

- App: `http://localhost:8080`
- Database name: `ecommerce_demo`
- Database user: `postgres`
- Database password: `postgres`

The database port is not published to the host by default to avoid local port conflicts. If you need direct host access, add a port mapping in `example/docker-compose.yml`.

## Seed data

The demo initializes these tables:

- `app.users`
- `billing.accounts`
- `catalog.products`
- `sales.orders`

The data is intentionally split across multiple schemas so the sidebar demonstrates schema grouping, while `app.users` still matches the main design mock and supports inline PK-based editing out of the box.
