# Example Demo Environment

This directory contains a fully reproducible local demo for `pgui`.

## What it starts

- `postgres:16-alpine`
- `pgui` built from the current repository root `Dockerfile`

The app container receives `DATABASE_URL=postgres://postgres:postgres@postgres:5432/salon_ops_demo?sslmode=disable`, so it auto-connects on startup and lands directly in the main editor UI.
This means `task example:up` always uses your local frontend/backend changes instead of pulling a published image.

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
- Database name: `salon_ops_demo`
- Database user: `postgres`
- Database password: `postgres`

The app port is published on `127.0.0.1` only. The database port is not published to the host by default to avoid local port conflicts. If you need direct host access, add a port mapping in `example/docker-compose.yml`.

## Seed data

The demo initializes a salon booking and operations platform with 20 tables:

- `app.users`
- `salon.locations`
- `salon.chairs`
- `staff.stylists`
- `staff.stylist_locations`
- `staff.shifts`
- `service.categories`
- `service.services`
- `service.service_variants`
- `service.stylist_services`
- `crm.clients`
- `crm.client_profiles`
- `crm.client_notes`
- `booking.appointments`
- `booking.appointment_services`
- `booking.status_events`
- `commerce.products`
- `commerce.inventory_movements`
- `commerce.invoices`
- `commerce.payments`

The data is intentionally split across multiple schemas so the sidebar and Diagram tab demonstrate schema grouping, cross-schema foreign keys, composite foreign keys, and focus-mode ERD layout. `app.users` remains the first table and supports inline PK-based editing out of the box.
