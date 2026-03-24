INSERT INTO app.users (id, email, full_name, created_at, role, timezone, notes) VALUES
  (1, 'alex.v@data-editorial.com', 'Alex Volkov', '2023-11-01 10:24:12', 'ADMIN', 'Europe/Berlin', 'Primary workspace owner'),
  (2, 'sarah.chen@cloud.io', 'Sarah Chen', '2023-11-05 14:12:05', 'EDITOR', 'America/Los_Angeles', 'Leads billing operations'),
  (3, 'm.rodriguez@domain.net', 'Mateo Rodriguez', '2023-11-12 09:45:33', 'VIEWER', 'America/New_York', 'Ops observer account'),
  (4, 'james.wilson@tech.com', 'James Wilson', '2023-11-20 16:01:44', 'EDITOR', 'Europe/London', 'Owns order fulfillment'),
  (5, 'elara.moon@space.org', 'Elara Moon', '2023-11-22 11:30:19', 'VIEWER', 'Asia/Seoul', 'Product analytics access')
ON CONFLICT (id) DO NOTHING;

INSERT INTO billing.accounts (id, owner_user_id, company_name, plan_name, billing_status, renewal_date, settings) VALUES
  (101, 1, 'Northstar Labs', 'Enterprise', 'active', '2026-06-01', '{"region":"eu-central-1","seats":48}'),
  (102, 2, 'CloudPaper Inc', 'Growth', 'trialing', '2026-04-12', '{"region":"us-west-2","seats":12}'),
  (103, 4, 'Fulcrum Retail', 'Scale', 'past_due', '2026-03-28', '{"region":"us-east-1","seats":24}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO catalog.products (id, sku, name, category, unit_price, inventory_count, metadata) VALUES
  (201, 'SKU-ANL-01', 'Insight Monitor', 'analytics', 299.00, 35, '{"edition":"pro","connector":"postgres"}'),
  (202, 'SKU-OPS-02', 'Ops Console', 'operations', 149.00, 70, '{"edition":"team","connector":"stripe"}'),
  (203, 'SKU-CRM-03', 'Signal Desk', 'sales', 89.00, 120, '{"edition":"starter","connector":"hubspot"}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sales.orders (id, account_id, product_id, purchaser_email, status, total_amount, placed_at, delivered_at) VALUES
  (301, 101, 201, 'alex.v@data-editorial.com', 'fulfilled', 598.00, '2024-01-10 08:30:00', '2024-01-12 15:00:00'),
  (302, 102, 202, 'sarah.chen@cloud.io', 'processing', 149.00, '2024-02-19 13:12:00', NULL),
  (303, 103, 203, 'james.wilson@tech.com', 'fulfilled', 267.00, '2024-03-04 17:48:00', '2024-03-05 10:20:00')
ON CONFLICT (id) DO NOTHING;
