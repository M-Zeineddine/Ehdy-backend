-- Kado Seed Data — Categories + Lebanese Merchants + Gift Cards
-- Run this in Supabase SQL Editor

-- ─── Categories ──────────────────────────────────────────────────────────────
INSERT INTO categories (id, name, slug, description, display_order, is_active) VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Food & Drinks',  'food-drinks',  'Restaurants, cafes & food spots',    1, TRUE),
  ('a1000000-0000-0000-0000-000000000002', 'Sweets',         'sweets',       'Chocolates, pastries & desserts',    2, TRUE),
  ('a1000000-0000-0000-0000-000000000003', 'Shopping',       'shopping',     'Fashion, lifestyle & retail',        3, TRUE),
  ('a1000000-0000-0000-0000-000000000004', 'Beauty',         'beauty',       'Salons, spas & beauty brands',       4, TRUE),
  ('a1000000-0000-0000-0000-000000000005', 'Entertainment',  'entertainment','Activities, experiences & fun',      5, TRUE),
  ('a1000000-0000-0000-0000-000000000006', 'Wellness',       'wellness',     'Gyms, yoga & wellness centers',      6, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- ─── Merchants ────────────────────────────────────────────────────────────────
INSERT INTO merchants (id, name, slug, description, logo_url, banner_image_url, category_id, country_code, city, is_active, is_verified, rating, review_count) VALUES
  (
    'b1000000-0000-0000-0000-000000000001',
    'Patchi',
    'patchi',
    'Lebanon''s iconic luxury chocolate brand. Perfect for every occasion.',
    'https://images.unsplash.com/photo-1511381939415-e44015466834?w=200&q=80',
    'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=800&q=80',
    'a1000000-0000-0000-0000-000000000002',
    'LB', 'Beirut', TRUE, TRUE, 4.8, 320
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    'Paul Bakery',
    'paul-bakery',
    'Authentic French bakery and café with fresh pastries and artisan breads.',
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200&q=80',
    'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=800&q=80',
    'a1000000-0000-0000-0000-000000000001',
    'LB', 'Beirut', TRUE, TRUE, 4.6, 215
  ),
  (
    'b1000000-0000-0000-0000-000000000003',
    'Roadster Diner',
    'roadster-diner',
    'Lebanon''s beloved American-style diner. Burgers, shakes, and good vibes.',
    'https://images.unsplash.com/photo-1550547660-d9450f859349?w=200&q=80',
    'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=800&q=80',
    'a1000000-0000-0000-0000-000000000001',
    'LB', 'Beirut', TRUE, TRUE, 4.5, 480
  ),
  (
    'b1000000-0000-0000-0000-000000000004',
    'Starbucks Lebanon',
    'starbucks-lb',
    'Your favorite coffee destination. Hundreds of customizable drinks.',
    'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=200&q=80',
    'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=800&q=80',
    'a1000000-0000-0000-0000-000000000001',
    'LB', 'Beirut', TRUE, TRUE, 4.4, 650
  ),
  (
    'b1000000-0000-0000-0000-000000000005',
    'Zara Lebanon',
    'zara-lb',
    'Global fashion for women, men, and kids. New collections every week.',
    'https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=200&q=80',
    'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=800&q=80',
    'a1000000-0000-0000-0000-000000000003',
    'LB', 'Beirut', TRUE, TRUE, 4.3, 290
  ),
  (
    'b1000000-0000-0000-0000-000000000006',
    'Nails & More',
    'nails-and-more',
    'Premium nail salon and beauty lounge in the heart of Beirut.',
    'https://images.unsplash.com/photo-1604654894610-df63bc536371?w=200&q=80',
    'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=800&q=80',
    'a1000000-0000-0000-0000-000000000004',
    'LB', 'Beirut', TRUE, TRUE, 4.7, 180
  )
ON CONFLICT (slug) DO NOTHING;

-- ─── Gift Cards ───────────────────────────────────────────────────────────────
INSERT INTO gift_cards (id, merchant_id, name, description, type, is_store_credit, credit_amount, currency_code, image_url, is_active) VALUES
  -- Patchi
  (
    'c1000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'Patchi Gift Card $20',
    'Treat someone to Patchi''s world-class Lebanese chocolates.',
    'store_credit', TRUE, 20.00, 'USD',
    'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=400&q=80',
    TRUE
  ),
  (
    'c1000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000001',
    'Patchi Gift Card $50',
    'The ultimate chocolate gift for special occasions.',
    'store_credit', TRUE, 50.00, 'USD',
    'https://images.unsplash.com/photo-1511381939415-e44015466834?w=400&q=80',
    TRUE
  ),
  -- Paul Bakery
  (
    'c1000000-0000-0000-0000-000000000003',
    'b1000000-0000-0000-0000-000000000002',
    'Paul Gift Card $15',
    'Fresh pastries, sandwiches, and coffee for a loved one.',
    'store_credit', TRUE, 15.00, 'USD',
    'https://images.unsplash.com/photo-1486427944299-d1955d23e34d?w=400&q=80',
    TRUE
  ),
  (
    'c1000000-0000-0000-0000-000000000004',
    'b1000000-0000-0000-0000-000000000002',
    'Paul Gift Card $30',
    'A generous gift for any bakery lover.',
    'store_credit', TRUE, 30.00, 'USD',
    'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=400&q=80',
    TRUE
  ),
  -- Roadster
  (
    'c1000000-0000-0000-0000-000000000005',
    'b1000000-0000-0000-0000-000000000003',
    'Roadster Gift Card $20',
    'Burgers, milkshakes, and loaded fries. A diner classic.',
    'store_credit', TRUE, 20.00, 'USD',
    'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=400&q=80',
    TRUE
  ),
  -- Starbucks
  (
    'c1000000-0000-0000-0000-000000000006',
    'b1000000-0000-0000-0000-000000000004',
    'Starbucks Gift Card $10',
    'Coffee, Frappuccinos, teas — endless ways to enjoy Starbucks.',
    'store_credit', TRUE, 10.00, 'USD',
    'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&q=80',
    TRUE
  ),
  (
    'c1000000-0000-0000-0000-000000000007',
    'b1000000-0000-0000-0000-000000000004',
    'Starbucks Gift Card $25',
    'The perfect gift for coffee lovers.',
    'store_credit', TRUE, 25.00, 'USD',
    'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&q=80',
    TRUE
  ),
  -- Zara
  (
    'c1000000-0000-0000-0000-000000000008',
    'b1000000-0000-0000-0000-000000000005',
    'Zara Gift Card $50',
    'Fashion for every style and season at Zara.',
    'store_credit', TRUE, 50.00, 'USD',
    'https://images.unsplash.com/photo-1567401893414-76b7b1e5a7a5?w=400&q=80',
    TRUE
  ),
  -- Nails & More
  (
    'c1000000-0000-0000-0000-000000000009',
    'b1000000-0000-0000-0000-000000000006',
    'Nail Session Gift Card',
    'A full nail treatment session at Nails & More.',
    'gift_item', FALSE, NULL, 'USD',
    'https://images.unsplash.com/photo-1519014816548-bf5fe059798b?w=400&q=80',
    TRUE
  )
ON CONFLICT DO NOTHING;
