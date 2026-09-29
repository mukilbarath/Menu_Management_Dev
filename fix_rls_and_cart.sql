-- 1. Create the Shared Table Cart table
CREATE TABLE table_cart_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id UUID REFERENCES tables(id) ON DELETE CASCADE,
    dish_id UUID REFERENCES dishes(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    notes TEXT,
    added_by_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable realtime for the shared cart
BEGIN;
  ALTER PUBLICATION supabase_realtime ADD TABLE table_cart_items;
COMMIT;

-- 2. Keep private data protected. Apply hardening.sql next to install policies and RPCs.
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE table_cart_items ENABLE ROW LEVEL SECURITY;
