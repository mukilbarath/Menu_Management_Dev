-- ==========================================
-- Database Schema for Digital Menu MVP
-- ==========================================

-- 1. Restaurants (Multi-tenant support)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE TABLE restaurants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tables (Each table belongs to a restaurant and has a unique QR code / ID)
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_number TEXT NOT NULL,
    qr_code_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(restaurant_id, table_number)
);

-- 3. Categories (Menu categories like Starters, Mains, etc.)
CREATE TABLE categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Dishes (Menu items)
CREATE TABLE dishes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    image_url TEXT,
    is_available BOOLEAN DEFAULT true,
    is_veg BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Orders
CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id UUID REFERENCES tables(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('placed', 'accepted', 'preparing', 'served', 'billed', 'closed')),
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Order Items
CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    dish_id UUID REFERENCES dishes(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_at_time DECIMAL(10, 2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ==========================================
-- Supabase Realtime Setup
-- ==========================================
-- Enable replication for orders table so the frontend can listen to status changes
BEGIN;
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;
  ALTER PUBLICATION supabase_realtime ADD TABLE orders;
COMMIT;


-- ==========================================
-- Seed Data for Prototype
-- ==========================================

-- Insert a demo restaurant
INSERT INTO restaurants (id, name, description) 
VALUES ('11111111-1111-1111-1111-111111111111', 'The Grand Cafe', 'A premium dining experience');

-- Insert demo tables
INSERT INTO tables (id, restaurant_id, table_number) VALUES 
('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Table 1'),
('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Table 2'),
('22222222-2222-2222-2222-222222222223', '11111111-1111-1111-1111-111111111111', 'Table 3');

-- Insert categories
INSERT INTO categories (id, restaurant_id, name, sort_order) VALUES
('33333333-3333-3333-3333-333333333331', '11111111-1111-1111-1111-111111111111', 'Starters', 1),
('33333333-3333-3333-3333-333333333332', '11111111-1111-1111-1111-111111111111', 'Main Course', 2),
('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Beverages', 3);

-- Insert dishes
INSERT INTO dishes (id, category_id, name, description, price, is_veg, image_url) VALUES
-- Starters
('44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333331', 'Paneer Tikka', 'Cottage cheese marinated in spices and grilled.', 250.00, true, 'https://images.unsplash.com/photo-1599487405270-b07cd9e9ceeb?auto=format&fit=crop&w=500&q=60'),
('44444444-4444-4444-4444-444444444442', '33333333-3333-3333-3333-333333333331', 'Chicken Wings', 'Spicy BBQ chicken wings.', 350.00, false, 'https://images.unsplash.com/photo-1524114664604-cd8133cd67ad?auto=format&fit=crop&w=500&q=60'),
-- Mains
('44444444-4444-4444-4444-444444444443', '33333333-3333-3333-3333-333333333332', 'Margherita Pizza', 'Classic delight with 100% real mozzarella cheese.', 400.00, true, 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=500&q=60'),
('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333332', 'Butter Chicken', 'Tender chicken in a rich, buttery tomato sauce.', 450.00, false, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=500&q=60'),
('44444444-4444-4444-4444-444444444445', '33333333-3333-3333-3333-333333333332', 'Dal Makhani', 'Creamy black lentils simmered overnight.', 300.00, true, 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=500&q=60'),
-- Beverages
('44444444-4444-4444-4444-444444444446', '33333333-3333-3333-3333-333333333333', 'Cold Coffee', 'Thick and creamy cold coffee.', 150.00, true, 'https://images.unsplash.com/photo-1461023058943-0708e5223eeb?auto=format&fit=crop&w=500&q=60'),
('44444444-4444-4444-4444-444444444447', '33333333-3333-3333-3333-333333333333', 'Fresh Lime Soda', 'Refreshing lime drink.', 100.00, true, 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=500&q=60');
