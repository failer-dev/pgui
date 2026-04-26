INSERT INTO app.users (id, email, full_name, role, phone, timezone, active, created_at) VALUES
  (1, 'owner@lumi-salon.local', 'Sora Kim', 'OWNER', '+82-10-1000-0001', 'Asia/Seoul', TRUE, '2025-01-02 09:00:00'),
  (2, 'frontdesk@lumi-salon.local', 'Yuna Park', 'RECEPTION', '+82-10-1000-0002', 'Asia/Seoul', TRUE, '2025-01-05 09:00:00'),
  (3, 'mina@lumi-salon.local', 'Mina Choi', 'STYLIST', '+82-10-1000-0003', 'Asia/Seoul', TRUE, '2025-01-08 09:00:00'),
  (4, 'jae@lumi-salon.local', 'Jae Lee', 'STYLIST', '+82-10-1000-0004', 'Asia/Seoul', TRUE, '2025-01-08 09:00:00'),
  (5, 'hana@lumi-salon.local', 'Hana Jung', 'STYLIST', '+82-10-1000-0005', 'Asia/Seoul', TRUE, '2025-02-01 09:00:00'),
  (6, 'leo@lumi-salon.local', 'Leo Han', 'STYLIST', '+82-10-1000-0006', 'Asia/Seoul', TRUE, '2025-03-12 09:00:00'),
  (7, 'inventory@lumi-salon.local', 'Noah Shin', 'INVENTORY', '+82-10-1000-0007', 'Asia/Seoul', TRUE, '2025-03-15 09:00:00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO salon.locations (id, name, phone, address_line, city, timezone, opened_on, active, settings) VALUES
  (11, 'Lumi Hair Gangnam', '+82-2-555-0111', '12 Teheran-ro 4-gil', 'Seoul', 'Asia/Seoul', '2024-09-01', TRUE, '{"floor":3,"lateHours":["thu","fri"],"depositRequired":true}'),
  (12, 'Lumi Hair Hongdae', '+82-2-555-0122', '22 Wausan-ro 21-gil', 'Seoul', 'Asia/Seoul', '2025-02-14', TRUE, '{"floor":2,"lateHours":["sat"],"depositRequired":false}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO salon.chairs (id, location_id, name, chair_type, active) VALUES
  (101, 11, 'G-Color 1', 'color', TRUE),
  (102, 11, 'G-Perm 1', 'perm', TRUE),
  (103, 11, 'G-Cut 1', 'cut', TRUE),
  (201, 12, 'H-Color 1', 'color', TRUE),
  (202, 12, 'H-Cut 1', 'cut', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff.stylists (id, user_id, display_name, level, bio, hired_on, active, commission_rate) VALUES
  (1001, 3, 'Mina', 'senior', 'Soft layer cuts, root color, and scalp care.', '2024-09-01', TRUE, 45.00),
  (1002, 4, 'Jae', 'master', 'Color correction, digital perm, and premium treatments.', '2024-09-01', TRUE, 50.00),
  (1003, 5, 'Hana', 'senior', 'Long hair color, volume perm, and repair treatments.', '2025-02-14', TRUE, 42.00),
  (1004, 6, 'Leo', 'junior', 'Men cuts, styling, and express treatments.', '2025-03-12', TRUE, 35.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO staff.stylist_locations (stylist_id, location_id, home_location) VALUES
  (1001, 11, TRUE),
  (1002, 11, TRUE),
  (1002, 12, FALSE),
  (1003, 12, TRUE),
  (1004, 11, FALSE),
  (1004, 12, TRUE)
ON CONFLICT (stylist_id, location_id) DO NOTHING;

INSERT INTO staff.shifts (id, stylist_id, location_id, starts_at, ends_at, role, booking_capacity) VALUES
  (501, 1001, 11, '2026-04-25 09:00:00', '2026-04-25 17:00:00', 'stylist', 1),
  (502, 1002, 11, '2026-04-25 10:00:00', '2026-04-25 19:00:00', 'stylist', 1),
  (503, 1004, 11, '2026-04-25 13:00:00', '2026-04-25 20:00:00', 'stylist', 1),
  (504, 1002, 12, '2026-04-26 11:00:00', '2026-04-26 18:00:00', 'stylist', 1),
  (505, 1003, 12, '2026-04-26 09:00:00', '2026-04-26 17:00:00', 'stylist', 1),
  (506, 1004, 12, '2026-04-26 12:00:00', '2026-04-26 20:00:00', 'stylist', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO service.categories (id, name, display_order, active) VALUES
  (1, 'Cut', 10, TRUE),
  (2, 'Color', 20, TRUE),
  (3, 'Perm', 30, TRUE),
  (4, 'Treatment', 40, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO service.services (id, category_id, name, description, active) VALUES
  (10, 1, 'Women Cut', 'Consultation, wash, cut, and finish.', TRUE),
  (11, 1, 'Men Cut', 'Cut, wash, and quick styling.', TRUE),
  (20, 2, 'Root Color', 'Root touch-up color service.', TRUE),
  (21, 2, 'Full Color', 'Full head color by hair length.', TRUE),
  (30, 3, 'Digital Perm', 'Heat-assisted perm for long-lasting waves.', TRUE),
  (31, 3, 'Volume Perm', 'Root volume and soft curls.', TRUE),
  (40, 4, 'Scalp Care', 'Scalp balancing and cleansing treatment.', TRUE),
  (41, 4, 'Repair Treatment', 'Moisture and protein repair program.', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO service.service_variants (id, service_id, name, duration_minutes, buffer_minutes, list_price, active) VALUES
  (100, 10, 'Women Cut', 60, 10, 45000.00, TRUE),
  (101, 11, 'Men Cut', 45, 5, 35000.00, TRUE),
  (200, 20, 'Root Color', 90, 15, 80000.00, TRUE),
  (201, 21, 'Full Color Short', 120, 20, 130000.00, TRUE),
  (202, 21, 'Full Color Long', 150, 20, 170000.00, TRUE),
  (300, 30, 'Digital Perm Medium', 180, 20, 220000.00, TRUE),
  (301, 31, 'Volume Perm', 150, 15, 160000.00, TRUE),
  (400, 40, 'Basic Scalp Care', 50, 10, 60000.00, TRUE),
  (401, 41, 'Repair Ampoule', 70, 10, 90000.00, TRUE),
  (402, 41, 'Premium Repair Program', 100, 15, 150000.00, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO service.stylist_services (stylist_id, service_variant_id, price_override, duration_override_minutes, active) VALUES
  (1001, 100, NULL, NULL, TRUE),
  (1001, 101, NULL, NULL, TRUE),
  (1001, 200, NULL, NULL, TRUE),
  (1001, 201, NULL, NULL, TRUE),
  (1001, 400, NULL, NULL, TRUE),
  (1001, 401, NULL, NULL, TRUE),
  (1002, 100, 50000.00, NULL, TRUE),
  (1002, 200, NULL, NULL, TRUE),
  (1002, 202, 180000.00, NULL, TRUE),
  (1002, 300, 240000.00, NULL, TRUE),
  (1002, 401, NULL, NULL, TRUE),
  (1002, 402, 170000.00, NULL, TRUE),
  (1003, 100, NULL, NULL, TRUE),
  (1003, 201, NULL, NULL, TRUE),
  (1003, 202, NULL, NULL, TRUE),
  (1003, 301, NULL, NULL, TRUE),
  (1003, 400, NULL, NULL, TRUE),
  (1003, 402, NULL, NULL, TRUE),
  (1004, 100, NULL, NULL, TRUE),
  (1004, 101, NULL, NULL, TRUE),
  (1004, 400, NULL, NULL, TRUE),
  (1004, 401, NULL, NULL, TRUE)
ON CONFLICT (stylist_id, service_variant_id) DO NOTHING;

INSERT INTO crm.clients (id, email, full_name, phone, preferred_location_id, marketing_opt_in, created_at) VALUES
  (2001, 'ari.song@example.com', 'Ari Song', '+82-10-2000-0001', 11, TRUE, '2025-10-02 13:20:00'),
  (2002, 'dana.cho@example.com', 'Dana Cho', '+82-10-2000-0002', 11, FALSE, '2025-10-15 18:30:00'),
  (2003, 'nari.kang@example.com', 'Nari Kang', '+82-10-2000-0003', 12, TRUE, '2025-11-03 10:05:00'),
  (2004, 'min.joon@example.com', 'Min Joon', '+82-10-2000-0004', 12, FALSE, '2025-12-20 14:45:00'),
  (2005, 'seoyeon.lim@example.com', 'Seoyeon Lim', '+82-10-2000-0005', 11, TRUE, '2026-01-11 11:10:00'),
  (2006, 'riley.park@example.com', 'Riley Park', '+82-10-2000-0006', 12, TRUE, '2026-02-08 16:40:00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO crm.client_profiles (client_id, birth_date, hair_type, color_formula, allergy_notes, preferences) VALUES
  (2001, '1991-04-18', 'fine straight', '8N + 8A root blend', 'Avoid strong fragrance.', '{"preferredDrink":"iced tea","quietSeat":true}'),
  (2002, '1988-07-02', 'thick wavy', 'cool brown level 6', NULL, '{"preferredDrink":"americano","needsParking":true}'),
  (2003, '1995-11-23', 'long damaged', 'ash beige level 9', 'Patch test before bleach.', '{"photoConsent":true}'),
  (2004, '1990-02-13', 'short straight', NULL, NULL, '{"quickCheckout":true}'),
  (2005, '1993-09-09', 'medium layered', 'olive brown level 7', NULL, '{"sensitiveScalp":true}'),
  (2006, '1986-12-31', 'curly', NULL, 'No latex gloves.', '{"preferredDrink":"water"}')
ON CONFLICT (client_id) DO NOTHING;

INSERT INTO crm.client_notes (id, client_id, author_user_id, note, pinned, created_at) VALUES
  (2101, 2001, 2, 'Prefers morning appointments and low-volume music.', TRUE, '2026-03-01 09:30:00'),
  (2102, 2003, 5, 'Hair was dry after winter color, recommend premium repair.', TRUE, '2026-03-18 15:20:00'),
  (2103, 2004, 6, 'Usually books a men cut during lunch break.', FALSE, '2026-03-22 12:20:00'),
  (2104, 2006, 5, 'Interested in volume perm maintenance package.', FALSE, '2026-04-02 16:30:00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO booking.appointments (id, client_id, location_id, stylist_id, chair_id, created_by_user_id, status, source, starts_at, ends_at, notes) VALUES
  (3001, 2001, 11, 1001, 101, 2, 'completed', 'phone', '2026-04-25 10:00:00', '2026-04-25 12:30:00', 'Root color plus cut.'),
  (3002, 2002, 11, 1002, 102, 2, 'confirmed', 'web', '2026-04-25 12:00:00', '2026-04-25 15:00:00', 'Digital perm consultation first.'),
  (3003, 2003, 12, 1003, 201, 2, 'booked', 'web', '2026-04-26 10:00:00', '2026-04-26 12:30:00', 'Long color, allow extra finish time.'),
  (3004, 2004, 12, 1004, 202, 2, 'completed', 'walk_in', '2026-04-26 13:00:00', '2026-04-26 14:30:00', 'Men cut and scalp care.'),
  (3005, 2005, 11, 1002, 103, 1, 'confirmed', 'phone', '2026-04-27 11:00:00', '2026-04-27 14:00:00', 'Premium repair and cut.'),
  (3006, 2006, 12, 1003, 201, 2, 'booked', 'web', '2026-04-27 15:00:00', '2026-04-27 17:30:00', 'Volume perm.'),
  (3007, 2001, 11, 1001, 101, 2, 'booked', 'app', '2026-04-28 16:00:00', '2026-04-28 17:00:00', 'Scalp care follow-up.'),
  (3008, 2002, 12, 1002, 202, 2, 'booked', 'app', '2026-04-28 12:00:00', '2026-04-28 14:30:00', 'Full color long at Hongdae.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO booking.appointment_services (id, appointment_id, stylist_id, service_variant_id, sequence_no, duration_minutes, line_price, status) VALUES
  (9001, 3001, 1001, 200, 1, 90, 80000.00, 'completed'),
  (9002, 3001, 1001, 100, 2, 60, 45000.00, 'completed'),
  (9003, 3002, 1002, 300, 1, 180, 240000.00, 'scheduled'),
  (9004, 3003, 1003, 202, 1, 150, 170000.00, 'scheduled'),
  (9005, 3004, 1004, 101, 1, 45, 35000.00, 'completed'),
  (9006, 3004, 1004, 400, 2, 50, 60000.00, 'completed'),
  (9007, 3005, 1002, 402, 1, 100, 170000.00, 'scheduled'),
  (9008, 3005, 1002, 100, 2, 60, 50000.00, 'scheduled'),
  (9009, 3006, 1003, 301, 1, 150, 160000.00, 'scheduled'),
  (9010, 3007, 1001, 400, 1, 50, 60000.00, 'scheduled'),
  (9011, 3008, 1002, 202, 1, 150, 180000.00, 'scheduled')
ON CONFLICT (id) DO NOTHING;

INSERT INTO booking.status_events (id, appointment_id, changed_by_user_id, from_status, to_status, changed_at, reason) VALUES
  (3101, 3001, 2, NULL, 'booked', '2026-04-20 09:10:00', 'Created by phone.'),
  (3102, 3001, 2, 'booked', 'confirmed', '2026-04-23 10:10:00', 'Deposit received.'),
  (3103, 3001, 3, 'confirmed', 'completed', '2026-04-25 12:34:00', 'Service finished.'),
  (3104, 3002, 2, NULL, 'booked', '2026-04-21 18:20:00', 'Web booking.'),
  (3105, 3002, 2, 'booked', 'confirmed', '2026-04-24 11:05:00', 'Client confirmed by SMS.'),
  (3106, 3004, 6, NULL, 'completed', '2026-04-26 14:31:00', 'Walk-in completed.'),
  (3107, 3006, 2, NULL, 'booked', '2026-04-22 16:05:00', 'Web booking.'),
  (3108, 3008, 2, NULL, 'booked', '2026-04-23 13:20:00', 'App booking.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO commerce.products (id, sku, name, category, retail_price, active) VALUES
  (4001, 'LUMI-SHAMPOO-300', 'Lumi Moisture Shampoo 300ml', 'care', 28000.00, TRUE),
  (4002, 'LUMI-MASK-200', 'Color Lock Mask 200ml', 'color', 34000.00, TRUE),
  (4003, 'LUMI-SCALP-100', 'Scalp Tonic 100ml', 'scalp', 26000.00, TRUE),
  (4004, 'LUMI-AMP-10', 'Repair Ampoule Pack', 'treatment', 48000.00, TRUE),
  (4005, 'LUMI-WAX-80', 'Soft Texture Wax 80g', 'styling', 22000.00, TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO commerce.inventory_movements (id, location_id, product_id, appointment_id, created_by_user_id, movement_type, quantity_delta, unit_cost, occurred_at, note) VALUES
  (6001, 11, 4001, NULL, 7, 'receive', 36, 14000.00, '2026-04-01 10:00:00', 'Monthly stock receipt.'),
  (6002, 11, 4002, NULL, 7, 'receive', 24, 17000.00, '2026-04-01 10:10:00', 'Monthly stock receipt.'),
  (6003, 12, 4003, NULL, 7, 'receive', 30, 12000.00, '2026-04-02 11:00:00', 'Hongdae opening stock.'),
  (6004, 11, 4002, 3001, 3, 'service_usage', -1, 17000.00, '2026-04-25 12:20:00', 'Color mask used for appointment.'),
  (6005, 12, 4003, 3004, 6, 'service_usage', -1, 12000.00, '2026-04-26 14:20:00', 'Scalp tonic used for appointment.'),
  (6006, 11, 4004, 3005, 4, 'reserved_usage', -1, 25000.00, '2026-04-27 10:30:00', 'Reserved for premium repair.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO commerce.invoices (id, appointment_id, client_id, location_id, issued_by_user_id, subtotal, discount_amount, tax_amount, total_amount, status, issued_at) VALUES
  (7001, 3001, 2001, 11, 2, 125000.00, 5000.00, 12000.00, 132000.00, 'paid', '2026-04-25 12:36:00'),
  (7002, 3002, 2002, 11, 2, 240000.00, 0.00, 24000.00, 264000.00, 'open', '2026-04-25 12:05:00'),
  (7003, 3004, 2004, 12, 6, 95000.00, 0.00, 9500.00, 104500.00, 'paid', '2026-04-26 14:32:00'),
  (7004, 3005, 2005, 11, 1, 220000.00, 10000.00, 21000.00, 231000.00, 'open', '2026-04-27 10:55:00')
ON CONFLICT (id) DO NOTHING;

INSERT INTO commerce.payments (id, invoice_id, received_by_user_id, method, amount, paid_at, external_ref) VALUES
  (8001, 7001, 2, 'card', 132000.00, '2026-04-25 12:38:00', 'card_ks_3001'),
  (8002, 7003, 6, 'card', 104500.00, '2026-04-26 14:35:00', 'card_hd_3004'),
  (8003, 7002, 2, 'deposit', 50000.00, '2026-04-24 11:06:00', 'deposit_3002')
ON CONFLICT (id) DO NOTHING;
