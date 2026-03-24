CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS sales;

CREATE TABLE IF NOT EXISTS app.users (
  id BIGINT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  role TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  notes TEXT
);

CREATE TABLE IF NOT EXISTS billing.accounts (
  id BIGINT PRIMARY KEY,
  owner_user_id BIGINT NOT NULL REFERENCES app.users(id),
  company_name TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  billing_status TEXT NOT NULL,
  renewal_date DATE NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS catalog.products (
  id BIGINT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit_price NUMERIC(10, 2) NOT NULL,
  inventory_count INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS sales.orders (
  id BIGINT PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES billing.accounts(id),
  product_id BIGINT NOT NULL REFERENCES catalog.products(id),
  purchaser_email TEXT NOT NULL,
  status TEXT NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  placed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMP
);
