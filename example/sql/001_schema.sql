CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS salon;
CREATE SCHEMA IF NOT EXISTS staff;
CREATE SCHEMA IF NOT EXISTS service;
CREATE SCHEMA IF NOT EXISTS crm;
CREATE SCHEMA IF NOT EXISTS booking;
CREATE SCHEMA IF NOT EXISTS commerce;

CREATE TABLE IF NOT EXISTS app.users (
  id BIGINT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL,
  phone TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salon.locations (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address_line TEXT NOT NULL,
  city TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Seoul',
  opened_on DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS salon.chairs (
  id BIGINT PRIMARY KEY,
  location_id BIGINT NOT NULL REFERENCES salon.locations(id),
  name TEXT NOT NULL,
  chair_type TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS staff.stylists (
  id BIGINT PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES app.users(id),
  display_name TEXT NOT NULL,
  level TEXT NOT NULL,
  bio TEXT,
  hired_on DATE NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  commission_rate NUMERIC(5, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS staff.stylist_locations (
  stylist_id BIGINT NOT NULL REFERENCES staff.stylists(id),
  location_id BIGINT NOT NULL REFERENCES salon.locations(id),
  home_location BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (stylist_id, location_id)
);

CREATE TABLE IF NOT EXISTS staff.shifts (
  id BIGINT PRIMARY KEY,
  stylist_id BIGINT NOT NULL,
  location_id BIGINT NOT NULL,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  role TEXT NOT NULL DEFAULT 'stylist',
  booking_capacity INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (stylist_id, location_id) REFERENCES staff.stylist_locations(stylist_id, location_id),
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS service.categories (
  id BIGINT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_order INTEGER NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS service.services (
  id BIGINT PRIMARY KEY,
  category_id BIGINT NOT NULL REFERENCES service.categories(id),
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS service.service_variants (
  id BIGINT PRIMARY KEY,
  service_id BIGINT NOT NULL REFERENCES service.services(id),
  name TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  buffer_minutes INTEGER NOT NULL DEFAULT 0,
  list_price NUMERIC(10, 2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS service.stylist_services (
  stylist_id BIGINT NOT NULL REFERENCES staff.stylists(id),
  service_variant_id BIGINT NOT NULL REFERENCES service.service_variants(id),
  price_override NUMERIC(10, 2),
  duration_override_minutes INTEGER,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (stylist_id, service_variant_id)
);

CREATE TABLE IF NOT EXISTS crm.clients (
  id BIGINT PRIMARY KEY,
  email TEXT UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  preferred_location_id BIGINT REFERENCES salon.locations(id),
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm.client_profiles (
  client_id BIGINT PRIMARY KEY REFERENCES crm.clients(id),
  birth_date DATE,
  hair_type TEXT,
  color_formula TEXT,
  allergy_notes TEXT,
  preferences JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS crm.client_notes (
  id BIGINT PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES crm.clients(id),
  author_user_id BIGINT NOT NULL REFERENCES app.users(id),
  note TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking.appointments (
  id BIGINT PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES crm.clients(id),
  location_id BIGINT NOT NULL REFERENCES salon.locations(id),
  stylist_id BIGINT NOT NULL REFERENCES staff.stylists(id),
  chair_id BIGINT REFERENCES salon.chairs(id),
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id),
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  notes TEXT,
  CHECK (ends_at > starts_at)
);

CREATE TABLE IF NOT EXISTS booking.appointment_services (
  id BIGINT PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES booking.appointments(id),
  stylist_id BIGINT NOT NULL,
  service_variant_id BIGINT NOT NULL,
  sequence_no INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL,
  line_price NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  FOREIGN KEY (stylist_id, service_variant_id) REFERENCES service.stylist_services(stylist_id, service_variant_id)
);

CREATE TABLE IF NOT EXISTS booking.status_events (
  id BIGINT PRIMARY KEY,
  appointment_id BIGINT NOT NULL REFERENCES booking.appointments(id),
  changed_by_user_id BIGINT NOT NULL REFERENCES app.users(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  reason TEXT
);

CREATE TABLE IF NOT EXISTS commerce.products (
  id BIGINT PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  retail_price NUMERIC(10, 2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS commerce.inventory_movements (
  id BIGINT PRIMARY KEY,
  location_id BIGINT NOT NULL REFERENCES salon.locations(id),
  product_id BIGINT NOT NULL REFERENCES commerce.products(id),
  appointment_id BIGINT REFERENCES booking.appointments(id),
  created_by_user_id BIGINT NOT NULL REFERENCES app.users(id),
  movement_type TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL,
  unit_cost NUMERIC(10, 2),
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  note TEXT
);

CREATE TABLE IF NOT EXISTS commerce.invoices (
  id BIGINT PRIMARY KEY,
  appointment_id BIGINT NOT NULL UNIQUE REFERENCES booking.appointments(id),
  client_id BIGINT NOT NULL REFERENCES crm.clients(id),
  location_id BIGINT NOT NULL REFERENCES salon.locations(id),
  issued_by_user_id BIGINT NOT NULL REFERENCES app.users(id),
  subtotal NUMERIC(10, 2) NOT NULL,
  discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL,
  issued_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS commerce.payments (
  id BIGINT PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES commerce.invoices(id),
  received_by_user_id BIGINT NOT NULL REFERENCES app.users(id),
  method TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  paid_at TIMESTAMP NOT NULL DEFAULT NOW(),
  external_ref TEXT
);
