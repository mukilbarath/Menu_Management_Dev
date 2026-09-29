-- Production feature migration. Apply after hardening.sql on a new Supabase project.
-- Target region: ap-south-1 (Mumbai). Phone Auth and an SMS provider must be enabled.
BEGIN;

-- Restaurant-controlled defaults. Optional charges remain zero until configured.
CREATE TABLE restaurant_settings (
  restaurant_id uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  timezone text NOT NULL DEFAULT 'Asia/Kolkata',
  default_locale text NOT NULL DEFAULT 'en-IN',
  gst_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (gst_percent BETWEEN 0 AND 100),
  prices_include_gst boolean NOT NULL DEFAULT true,
  service_charge_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (service_charge_percent BETWEEN 0 AND 100),
  packaging_charge numeric(10,2) NOT NULL DEFAULT 0 CHECK (packaging_charge >= 0),
  rounding_increment numeric(5,2) NOT NULL DEFAULT 0 CHECK (rounding_increment >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO restaurant_settings(restaurant_id) SELECT id FROM restaurants ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION create_restaurant_settings() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO restaurant_settings(restaurant_id) VALUES(NEW.id) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS restaurant_settings_after_insert ON restaurants;
CREATE TRIGGER restaurant_settings_after_insert AFTER INSERT ON restaurants FOR EACH ROW EXECUTE FUNCTION create_restaurant_settings();

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS slug text;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS address text;
CREATE UNIQUE INDEX IF NOT EXISTS restaurants_slug_key ON restaurants(lower(slug)) WHERE slug IS NOT NULL;

-- A reset changes public_token and invalidates the old printed QR immediately.
ALTER TABLE tables ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE tables ADD COLUMN IF NOT EXISTS qr_version integer NOT NULL DEFAULT 1;
ALTER TABLE tables ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX IF NOT EXISTS tables_public_token_key ON tables(public_token);

ALTER TABLE dishes ADD COLUMN IF NOT EXISTS dietary_type text NOT NULL DEFAULT 'veg'
  CHECK (dietary_type IN ('veg','non_veg','egg','vegan'));
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS ingredients text[] NOT NULL DEFAULT '{}';
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS allergens text[] NOT NULL DEFAULT '{}';
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS stock_tracking boolean NOT NULL DEFAULT false;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0);
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS available_from time;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS available_until time;
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS available_days smallint[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::smallint[];
ALTER TABLE dishes ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE TABLE dish_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dish_id uuid NOT NULL REFERENCES dishes(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  price numeric(10,2) NOT NULL CHECK (price >= 0),
  is_default boolean NOT NULL DEFAULT false,
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(dish_id,name)
);
CREATE UNIQUE INDEX one_default_variant_per_dish ON dish_variants(dish_id) WHERE is_default;

CREATE TABLE modifier_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  min_selections integer NOT NULL DEFAULT 0 CHECK (min_selections >= 0),
  max_selections integer NOT NULL DEFAULT 1 CHECK (max_selections > 0 AND max_selections >= min_selections),
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE modifier_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES modifier_groups(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  price_delta numeric(10,2) NOT NULL DEFAULT 0 CHECK (price_delta >= 0),
  is_available boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(group_id,name)
);
CREATE TABLE dish_modifier_groups (
  dish_id uuid REFERENCES dishes(id) ON DELETE CASCADE,
  group_id uuid REFERENCES modifier_groups(id) ON DELETE CASCADE,
  PRIMARY KEY(dish_id,group_id)
);

-- Generalize table sessions so the same cart/order engine supports takeaway.
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'dine_in'
  CHECK (order_type IN ('dine_in','takeaway'));
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS customer_name text;
ALTER TABLE table_sessions ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE table_sessions ALTER COLUMN table_id DROP NOT NULL;
ALTER TABLE table_sessions ADD CONSTRAINT table_required_for_dine_in
  CHECK ((order_type='dine_in' AND table_id IS NOT NULL) OR order_type='takeaway') NOT VALID;
ALTER TABLE table_sessions VALIDATE CONSTRAINT table_required_for_dine_in;

ALTER TABLE table_cart_items ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES dish_variants(id);
ALTER TABLE table_cart_items ADD COLUMN IF NOT EXISTS added_by_user uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE TABLE cart_item_modifiers (
  cart_item_id uuid REFERENCES table_cart_items(id) ON DELETE CASCADE,
  option_id uuid REFERENCES modifier_options(id),
  PRIMARY KEY(cart_item_id,option_id)
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_type text NOT NULL DEFAULT 'dine_in'
  CHECK (order_type IN ('dine_in','takeaway'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gst_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_charge numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packaging_charge numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS rounding_amount numeric(10,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid','partially_paid','paid','refunded'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method text
  CHECK (payment_method IS NULL OR payment_method IN ('cash','counter_card','online_upi','online_card','mixed'));
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS dish_name text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_name text;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS modifiers jsonb NOT NULL DEFAULT '[]';

CREATE TABLE bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  session_id uuid REFERENCES table_sessions(id),
  order_id uuid REFERENCES orders(id),
  subtotal numeric(10,2) NOT NULL CHECK (subtotal >= 0),
  gst_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (gst_amount >= 0),
  service_charge numeric(10,2) NOT NULL DEFAULT 0 CHECK (service_charge >= 0),
  packaging_charge numeric(10,2) NOT NULL DEFAULT 0 CHECK (packaging_charge >= 0),
  discount_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  rounding_amount numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(10,2) NOT NULL CHECK (total_amount >= 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','partially_paid','paid','void')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (session_id IS NOT NULL OR order_id IS NOT NULL)
);
CREATE TABLE bill_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  split_type text NOT NULL CHECK (split_type IN ('full','equal','item','custom')),
  label text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','void')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE bill_split_items (
  split_id uuid REFERENCES bill_splits(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES order_items(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  amount numeric(10,2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY(split_id,order_item_id)
);
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id),
  bill_id uuid REFERENCES bills(id),
  split_id uuid REFERENCES bill_splits(id),
  method text NOT NULL CHECK (method IN ('cash','counter_card','online_upi','online_card')),
  provider text NOT NULL CHECK (provider IN ('manual','razorpay')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','authorized','captured','failed','refunded')),
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  provider_order_id text UNIQUE,
  provider_payment_id text UNIQUE,
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  recorded_by uuid REFERENCES staff_profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz,
  CHECK (order_id IS NOT NULL OR bill_id IS NOT NULL)
);

-- Useful production indexes.
CREATE INDEX IF NOT EXISTS orders_restaurant_status_created ON orders(restaurant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS orders_session_created ON orders(session_id,created_at);
CREATE INDEX IF NOT EXISTS order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS cart_items_session ON table_cart_items(session_id);
CREATE INDEX IF NOT EXISTS dishes_category_available ON dishes(category_id,is_available,sort_order);
CREATE INDEX IF NOT EXISTS payments_order_status ON payments(order_id,status);

-- Public QR resolution exposes only the minimum needed to render the menu.
CREATE OR REPLACE FUNCTION resolve_table_qr(p_token uuid)
RETURNS TABLE(restaurant_id uuid,restaurant_name text,table_id uuid,table_number text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT r.id,r.name,t.id,t.table_number FROM tables t
  JOIN restaurants r ON r.id=t.restaurant_id
  WHERE t.public_token=p_token AND t.is_active;
$$;

CREATE OR REPLACE FUNCTION add_restaurant_table(p_number text)
RETURNS TABLE(id uuid,table_number text,public_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rid uuid;
BEGIN
 SELECT restaurant_id INTO rid FROM staff_profiles WHERE staff_profiles.id=auth.uid() AND role IN ('owner','manager');
 IF rid IS NULL THEN RAISE EXCEPTION 'Only owners and managers can add tables'; END IF;
 IF length(trim(p_number)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'Invalid table number'; END IF;
 RETURN QUERY INSERT INTO tables(restaurant_id,table_number) VALUES(rid,trim(p_number)) RETURNING tables.id,tables.table_number,tables.public_token;
END $$;

CREATE OR REPLACE FUNCTION reset_table_qr(p_table uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE token uuid; rid uuid;
BEGIN
 SELECT restaurant_id INTO rid FROM tables WHERE id=p_table FOR UPDATE;
 IF rid IS NULL OR NOT staff_access(rid,ARRAY['owner','manager']) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 UPDATE tables SET public_token=gen_random_uuid(),qr_version=qr_version+1 WHERE id=p_table RETURNING public_token INTO token;
 INSERT INTO audit_logs(restaurant_id,staff_id,action_type,description,metadata)
 VALUES(rid,auth.uid(),'table_qr_reset','Table QR reset',jsonb_build_object('table_id',p_table));
 RETURN token;
END $$;

CREATE OR REPLACE FUNCTION join_table_by_qr(p_token uuid,p_name text,p_phone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t tables; s uuid; v_phone text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Phone verification required'; END IF;
 v_phone := left(trim(p_phone), 20);
 IF v_phone IS NULL OR v_phone = '' THEN RAISE EXCEPTION 'Mobile number required'; END IF;
 SELECT * INTO t FROM tables WHERE public_token=p_token AND is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'This QR code is no longer valid'; END IF;
 SELECT id INTO s FROM table_sessions WHERE table_id=t.id AND closed_at IS NULL AND order_type='dine_in';
 IF s IS NULL THEN
   INSERT INTO table_sessions(restaurant_id,table_id,order_type,customer_id,customer_name,customer_phone)
   VALUES(t.restaurant_id,t.id,'dine_in',auth.uid(),left(trim(p_name),100),v_phone) RETURNING id INTO s;
 END IF;
 INSERT INTO session_members(session_id,user_id) VALUES(s,auth.uid()) ON CONFLICT DO NOTHING;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION create_takeaway_session(p_restaurant uuid,p_name text,p_phone text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid; v_phone text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Phone verification required'; END IF;
 v_phone := left(trim(p_phone), 20);
 IF v_phone IS NULL OR v_phone = '' THEN RAISE EXCEPTION 'Mobile number required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM restaurants WHERE id=p_restaurant) THEN RAISE EXCEPTION 'Restaurant not found'; END IF;
 SELECT id INTO s FROM table_sessions WHERE restaurant_id=p_restaurant AND order_type='takeaway' AND customer_id=auth.uid() AND closed_at IS NULL ORDER BY created_at DESC LIMIT 1;
 IF s IS NULL THEN
   INSERT INTO table_sessions(restaurant_id,order_type,customer_id,customer_name,customer_phone)
   VALUES(p_restaurant,'takeaway',auth.uid(),left(trim(p_name),100),v_phone) RETURNING id INTO s;
 END IF;
 INSERT INTO session_members(session_id,user_id) VALUES(s,auth.uid()) ON CONFLICT DO NOTHING;
 RETURN s;
END $$;

-- Secure all new tables and keep writes behind checked RPC functions.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['restaurant_settings','dish_variants','modifier_groups','modifier_options','dish_modifier_groups','cart_item_modifiers','bills','bill_splits','bill_split_items','payments'] LOOP
   EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 END LOOP;
END $$;
CREATE POLICY public_settings ON restaurant_settings FOR SELECT USING(true);
CREATE POLICY public_variants ON dish_variants FOR SELECT USING(true);
CREATE POLICY public_modifier_groups ON modifier_groups FOR SELECT USING(true);
CREATE POLICY public_modifier_options ON modifier_options FOR SELECT USING(true);
CREATE POLICY public_dish_modifier_groups ON dish_modifier_groups FOR SELECT USING(true);
CREATE POLICY session_cart_modifiers ON cart_item_modifiers FOR SELECT USING(EXISTS(SELECT 1 FROM table_cart_items c WHERE c.id=cart_item_id AND session_access(c.session_id)));
CREATE POLICY staff_bills ON bills FOR SELECT USING(staff_access(restaurant_id) OR session_access(session_id));
CREATE POLICY bill_splits_access ON bill_splits FOR SELECT USING(EXISTS(SELECT 1 FROM bills b WHERE b.id=bill_id AND (staff_access(b.restaurant_id) OR session_access(b.session_id))));
CREATE POLICY bill_split_items_access ON bill_split_items FOR SELECT USING(EXISTS(SELECT 1 FROM bill_splits s JOIN bills b ON b.id=s.bill_id WHERE s.id=split_id AND (staff_access(b.restaurant_id) OR session_access(b.session_id))));
CREATE POLICY payment_access ON payments FOR SELECT USING(staff_access(restaurant_id) OR EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND session_access(o.session_id)));
CREATE POLICY manage_settings ON restaurant_settings FOR UPDATE USING(staff_access(restaurant_id,ARRAY['owner','manager'])) WITH CHECK(staff_access(restaurant_id,ARRAY['owner','manager']));
CREATE POLICY manage_variants ON dish_variants FOR ALL USING(EXISTS(SELECT 1 FROM dishes d JOIN categories c ON c.id=d.category_id WHERE d.id=dish_id AND staff_access(c.restaurant_id,ARRAY['owner','manager']))) WITH CHECK(EXISTS(SELECT 1 FROM dishes d JOIN categories c ON c.id=d.category_id WHERE d.id=dish_id AND staff_access(c.restaurant_id,ARRAY['owner','manager'])));
CREATE POLICY manage_modifier_groups ON modifier_groups FOR ALL USING(staff_access(restaurant_id,ARRAY['owner','manager'])) WITH CHECK(staff_access(restaurant_id,ARRAY['owner','manager']));
CREATE POLICY manage_modifier_options ON modifier_options FOR ALL USING(EXISTS(SELECT 1 FROM modifier_groups g WHERE g.id=group_id AND staff_access(g.restaurant_id,ARRAY['owner','manager']))) WITH CHECK(EXISTS(SELECT 1 FROM modifier_groups g WHERE g.id=group_id AND staff_access(g.restaurant_id,ARRAY['owner','manager'])));
CREATE POLICY manage_dish_groups ON dish_modifier_groups FOR ALL USING(EXISTS(SELECT 1 FROM dishes d JOIN categories c ON c.id=d.category_id WHERE d.id=dish_id AND staff_access(c.restaurant_id,ARRAY['owner','manager']))) WITH CHECK(EXISTS(SELECT 1 FROM dishes d JOIN categories c ON c.id=d.category_id WHERE d.id=dish_id AND staff_access(c.restaurant_id,ARRAY['owner','manager'])));

REVOKE ALL ON FUNCTION resolve_table_qr(uuid),add_restaurant_table(text),reset_table_qr(uuid),join_table_by_qr(uuid,text),join_table_by_qr(uuid,text,text),create_takeaway_session(uuid,text),create_takeaway_session(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_table_qr(uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION add_restaurant_table(text),reset_table_qr(uuid),join_table_by_qr(uuid,text),join_table_by_qr(uuid,text,text),create_takeaway_session(uuid,text),create_takeaway_session(uuid,text,text) TO authenticated,service_role;
GRANT SELECT ON restaurant_settings,dish_variants,modifier_groups,modifier_options,dish_modifier_groups TO anon,authenticated;
GRANT SELECT ON cart_item_modifiers,bills,bill_splits,bill_split_items,payments TO authenticated;
GRANT INSERT,UPDATE,DELETE ON dish_variants,modifier_groups,modifier_options,dish_modifier_groups TO authenticated;
GRANT UPDATE ON restaurant_settings TO authenticated;

-- Never expose table identifiers or resettable QR tokens through PostgREST.
DROP POLICY IF EXISTS public_tables ON tables;
CREATE POLICY staff_tables ON tables FOR SELECT USING(staff_access(restaurant_id));
DROP POLICY IF EXISTS read_items ON order_items;
CREATE POLICY read_items ON order_items FOR SELECT USING(EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id AND (session_access(o.session_id) OR staff_access(o.restaurant_id))));
REVOKE SELECT ON tables FROM anon;
GRANT SELECT ON tables TO authenticated;
REVOKE ALL ON FUNCTION join_table(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION join_table(uuid,uuid) TO service_role;

-- Takeaway orders wait for online payment before they reach the kitchen.
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK
  (status IN ('pending_payment','placed','accepted','preparing','served','billed','closed','cancelled'));

CREATE OR REPLACE FUNCTION add_cart_item(
  p_session uuid,
  p_dish uuid,
  p_variant uuid DEFAULT NULL,
  p_options uuid[] DEFAULT '{}',
  p_name text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s table_sessions;
  d dishes;
  item_id uuid;
  group_row record;
  selected_count integer;
BEGIN
  SELECT * INTO s FROM table_sessions WHERE id=p_session FOR UPDATE;
  IF NOT FOUND OR s.closed_at IS NOT NULL OR NOT session_access(p_session) THEN
    RAISE EXCEPTION 'Session expired';
  END IF;
  SELECT dishes.* INTO d FROM dishes JOIN categories c ON c.id=dishes.category_id
   WHERE dishes.id=p_dish AND c.restaurant_id=s.restaurant_id;
  IF NOT FOUND OR NOT d.is_available THEN RAISE EXCEPTION 'Dish unavailable'; END IF;
  IF d.stock_tracking AND coalesce(d.stock_quantity,0) < 1 THEN RAISE EXCEPTION 'Dish is sold out'; END IF;
  IF d.available_days IS NOT NULL AND NOT (extract(dow FROM now() AT TIME ZONE 'Asia/Kolkata')::smallint = ANY(d.available_days)) THEN
    RAISE EXCEPTION 'Dish is not available today';
  END IF;
  IF d.available_from IS NOT NULL AND (now() AT TIME ZONE 'Asia/Kolkata')::time < d.available_from THEN RAISE EXCEPTION 'Dish is not available yet'; END IF;
  IF d.available_until IS NOT NULL AND (now() AT TIME ZONE 'Asia/Kolkata')::time > d.available_until THEN RAISE EXCEPTION 'Dish is no longer available today'; END IF;
  IF p_variant IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dish_variants WHERE id=p_variant AND dish_id=p_dish AND is_available) THEN
    RAISE EXCEPTION 'Invalid variant';
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(coalesce(p_options,'{}'::uuid[])) x
    WHERE NOT EXISTS(SELECT 1 FROM modifier_options o JOIN dish_modifier_groups dg ON dg.group_id=o.group_id
      WHERE o.id=x AND dg.dish_id=p_dish AND o.is_available)) THEN RAISE EXCEPTION 'Invalid modifier'; END IF;
  FOR group_row IN SELECT g.id,g.min_selections,g.max_selections FROM modifier_groups g
    JOIN dish_modifier_groups dg ON dg.group_id=g.id WHERE dg.dish_id=p_dish LOOP
    SELECT count(*) INTO selected_count FROM modifier_options o
      WHERE o.group_id=group_row.id AND o.id=ANY(coalesce(p_options,'{}'::uuid[]));
    IF selected_count < group_row.min_selections OR selected_count > group_row.max_selections THEN
      RAISE EXCEPTION 'Select the required options for %', (SELECT name FROM modifier_groups WHERE id=group_row.id);
    END IF;
  END LOOP;
  INSERT INTO table_cart_items(restaurant_id,table_id,session_id,dish_id,variant_id,quantity,added_by_name,added_by_user)
  VALUES(s.restaurant_id,s.table_id,s.id,p_dish,p_variant,1,left(trim(p_name),100),auth.uid()) RETURNING id INTO item_id;
  INSERT INTO cart_item_modifiers(cart_item_id,option_id) SELECT item_id,x FROM unnest(coalesce(p_options,'{}'::uuid[])) x;
  RETURN item_id;
END $$;

CREATE OR REPLACE FUNCTION change_cart_item_quantity(p_session uuid,p_item uuid,p_delta integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE current_quantity integer;
BEGIN
  IF p_delta NOT IN (-1,1) OR NOT session_access(p_session) THEN RAISE EXCEPTION 'Invalid cart update'; END IF;
  SELECT quantity INTO current_quantity FROM table_cart_items WHERE id=p_item AND session_id=p_session FOR UPDATE;
  IF current_quantity IS NULL THEN RAISE EXCEPTION 'Cart item no longer exists'; END IF;
  IF current_quantity+p_delta <= 0 THEN DELETE FROM table_cart_items WHERE id=p_item;
  ELSIF current_quantity+p_delta > 99 THEN RAISE EXCEPTION 'Maximum quantity is 99';
  ELSE UPDATE table_cart_items SET quantity=quantity+p_delta WHERE id=p_item; END IF;
END $$;

CREATE OR REPLACE FUNCTION checkout_table(p_session uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  s table_sessions; settings restaurant_settings; oid uuid; bid uuid;
  v_subtotal numeric(10,2); v_gst numeric(10,2); v_service numeric(10,2); v_packaging numeric(10,2);
  v_total_before_round numeric(10,2); v_total numeric(10,2); v_rounding numeric(10,2);
BEGIN
  SELECT * INTO s FROM table_sessions WHERE id=p_session FOR UPDATE;
  IF NOT FOUND OR s.closed_at IS NOT NULL OR NOT session_access(p_session) THEN RAISE EXCEPTION 'Session expired'; END IF;
  SELECT * INTO settings FROM restaurant_settings WHERE restaurant_id=s.restaurant_id;
  IF EXISTS(SELECT 1 FROM table_cart_items i JOIN dishes d ON d.id=i.dish_id
    WHERE i.session_id=p_session AND (NOT d.is_available OR (d.stock_tracking AND coalesce(d.stock_quantity,0)<i.quantity))) THEN
    RAISE EXCEPTION 'A cart item is unavailable or sold out';
  END IF;
  SELECT round(sum(i.quantity*(coalesce(v.price,d.price)+coalesce(m.modifier_total,0))),2) INTO v_subtotal
  FROM table_cart_items i JOIN dishes d ON d.id=i.dish_id LEFT JOIN dish_variants v ON v.id=i.variant_id
  LEFT JOIN LATERAL (SELECT sum(o.price_delta) modifier_total FROM cart_item_modifiers cm JOIN modifier_options o ON o.id=cm.option_id WHERE cm.cart_item_id=i.id) m ON true
  WHERE i.session_id=p_session;
  IF v_subtotal IS NULL THEN RAISE EXCEPTION 'Cart is empty or has already been ordered'; END IF;
  v_service:=round(v_subtotal*settings.service_charge_percent/100,2);
  v_packaging:=CASE WHEN s.order_type='takeaway' THEN settings.packaging_charge ELSE 0 END;
  v_gst:=CASE WHEN settings.prices_include_gst THEN round(v_subtotal*settings.gst_percent/(100+settings.gst_percent),2) ELSE round(v_subtotal*settings.gst_percent/100,2) END;
  v_total_before_round:=v_subtotal+v_service+v_packaging+CASE WHEN settings.prices_include_gst THEN 0 ELSE v_gst END;
  v_total:=CASE WHEN settings.rounding_increment>0 THEN round(v_total_before_round/settings.rounding_increment)*settings.rounding_increment ELSE v_total_before_round END;
  v_rounding:=v_total-v_total_before_round;
  INSERT INTO orders(restaurant_id,table_id,session_id,status,total_amount,order_type,customer_id,customer_phone,subtotal,gst_amount,service_charge,packaging_charge,rounding_amount)
  VALUES(s.restaurant_id,s.table_id,s.id,CASE WHEN s.order_type='takeaway' THEN 'pending_payment' ELSE 'placed' END,v_total,s.order_type,s.customer_id,s.customer_phone,v_subtotal,v_gst,v_service,v_packaging,v_rounding)
  RETURNING id INTO oid;
  INSERT INTO order_items(order_id,dish_id,quantity,price_at_time,notes,dish_name,variant_name,modifiers)
  SELECT oid,i.dish_id,i.quantity,coalesce(v.price,d.price)+coalesce(m.modifier_total,0),i.notes,d.name,v.name,coalesce(m.modifiers,'[]'::jsonb)
  FROM table_cart_items i JOIN dishes d ON d.id=i.dish_id LEFT JOIN dish_variants v ON v.id=i.variant_id
  LEFT JOIN LATERAL (SELECT sum(o.price_delta) modifier_total,jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'price',o.price_delta) ORDER BY o.sort_order) modifiers
    FROM cart_item_modifiers cm JOIN modifier_options o ON o.id=cm.option_id WHERE cm.cart_item_id=i.id) m ON true WHERE i.session_id=p_session;
  UPDATE dishes d SET stock_quantity=d.stock_quantity-x.quantity
    FROM (SELECT dish_id,sum(quantity)::integer quantity FROM table_cart_items WHERE session_id=p_session GROUP BY dish_id) x
    WHERE d.id=x.dish_id AND d.stock_tracking;
  INSERT INTO bills(restaurant_id,session_id,order_id,subtotal,gst_amount,service_charge,packaging_charge,rounding_amount,total_amount)
    VALUES(s.restaurant_id,s.id,oid,v_subtotal,v_gst,v_service,v_packaging,v_rounding,v_total) RETURNING id INTO bid;
  INSERT INTO bill_splits(bill_id,split_type,label,amount) VALUES(bid,'full','Full bill',v_total);
  DELETE FROM table_cart_items WHERE session_id=p_session;
  RETURN oid;
END $$;

CREATE OR REPLACE FUNCTION split_bill_equal(p_bill uuid,p_people integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bills; base numeric(10,2); last_amount numeric(10,2); n integer;
BEGIN
  SELECT * INTO b FROM bills WHERE id=p_bill FOR UPDATE;
  IF NOT FOUND OR b.status<>'open' OR NOT (staff_access(b.restaurant_id,ARRAY['owner','manager','cashier']) OR session_access(b.session_id)) THEN RAISE EXCEPTION 'Bill cannot be split'; END IF;
  IF p_people NOT BETWEEN 2 AND 20 THEN RAISE EXCEPTION 'Choose 2 to 20 people'; END IF;
  DELETE FROM bill_splits WHERE bill_id=p_bill AND status='unpaid';
  base:=trunc((b.total_amount/p_people)*100)/100; last_amount:=b.total_amount-base*(p_people-1);
  FOR n IN 1..p_people LOOP INSERT INTO bill_splits(bill_id,split_type,label,amount) VALUES(p_bill,'equal','Person '||n,CASE WHEN n=p_people THEN last_amount ELSE base END); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION split_bill_custom(p_bill uuid,p_amounts numeric[]) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bills; n integer;
BEGIN
  SELECT * INTO b FROM bills WHERE id=p_bill FOR UPDATE;
  IF NOT FOUND OR b.status<>'open' OR NOT (staff_access(b.restaurant_id,ARRAY['owner','manager','cashier']) OR session_access(b.session_id)) THEN RAISE EXCEPTION 'Bill cannot be split'; END IF;
  IF coalesce(array_length(p_amounts,1),0) NOT BETWEEN 2 AND 20 OR EXISTS(SELECT 1 FROM unnest(p_amounts) a WHERE a<=0) OR abs((SELECT sum(a) FROM unnest(p_amounts) a)-b.total_amount)>0.01 THEN RAISE EXCEPTION 'Split amounts must equal the bill total'; END IF;
  DELETE FROM bill_splits WHERE bill_id=p_bill AND status='unpaid';
  FOR n IN 1..array_length(p_amounts,1) LOOP INSERT INTO bill_splits(bill_id,split_type,label,amount) VALUES(p_bill,'custom','Person '||n,p_amounts[n]); END LOOP;
END $$;

CREATE OR REPLACE FUNCTION split_bill_items(p_bill uuid,p_splits jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b bills; split jsonb; line jsonb; sid uuid; item_amount numeric(10,2); split_total numeric(10,2); n integer:=0; split_count integer;
BEGIN
  SELECT * INTO b FROM bills WHERE id=p_bill FOR UPDATE;
  IF NOT FOUND OR b.status<>'open' OR NOT (staff_access(b.restaurant_id,ARRAY['owner','manager','cashier']) OR session_access(b.session_id)) THEN RAISE EXCEPTION 'Bill cannot be split'; END IF;
  IF jsonb_typeof(p_splits)<>'array' OR jsonb_array_length(p_splits) NOT BETWEEN 2 AND 20 THEN RAISE EXCEPTION 'Invalid item split'; END IF;
  IF EXISTS(SELECT 1 FROM order_items oi WHERE oi.order_id=b.order_id AND coalesce((SELECT sum((x.value->>'quantity')::integer) FROM jsonb_array_elements(p_splits) AS s(value) CROSS JOIN jsonb_array_elements(s.value->'items') AS x(value) WHERE (x.value->>'order_item_id')::uuid=oi.id),0)<>oi.quantity) THEN RAISE EXCEPTION 'Every item quantity must be assigned exactly once'; END IF;
  DELETE FROM bill_splits WHERE bill_id=p_bill AND status='unpaid';
  FOR split IN SELECT * FROM jsonb_array_elements(p_splits) LOOP
    split_total:=0;
    INSERT INTO bill_splits(bill_id,split_type,label,amount) VALUES(p_bill,'item',left(coalesce(nullif(trim(split->>'label'),''),'Guest'),80),0.01) RETURNING id INTO sid;
    FOR line IN SELECT * FROM jsonb_array_elements(split->'items') LOOP
      SELECT oi.price_at_time*(line->>'quantity')::integer INTO item_amount FROM order_items oi WHERE oi.id=(line->>'order_item_id')::uuid AND oi.order_id=b.order_id AND (line->>'quantity')::integer>0;
      IF item_amount IS NULL THEN RAISE EXCEPTION 'Invalid item assignment'; END IF;
      INSERT INTO bill_split_items(split_id,order_item_id,quantity,amount) VALUES(sid,(line->>'order_item_id')::uuid,(line->>'quantity')::integer,item_amount);
      split_total:=split_total+item_amount;
    END LOOP;
    IF split_total<=0 THEN RAISE EXCEPTION 'Each person needs at least one item'; END IF;
    UPDATE bill_splits SET amount=split_total WHERE id=sid;
  END LOOP;
  SELECT count(*) INTO split_count FROM bill_splits WHERE bill_id=p_bill;
  WITH ranked AS (SELECT id,amount,row_number() OVER(ORDER BY created_at,id) rn,count(*) OVER() cnt,sum(amount) OVER() base FROM bill_splits WHERE bill_id=p_bill), calculated AS (SELECT id,rn,cnt,CASE WHEN rn=cnt THEN b.total_amount ELSE round(b.total_amount*amount/nullif(base,0),2) END amount FROM ranked), prior AS (SELECT coalesce(sum(amount),0) amount FROM calculated WHERE rn<cnt)
  UPDATE bill_splits s SET amount=CASE WHEN c.rn=c.cnt THEN b.total_amount-p.amount ELSE c.amount END FROM calculated c CROSS JOIN prior p WHERE s.id=c.id;
END $$;
CREATE OR REPLACE FUNCTION record_counter_payment(p_order uuid,p_method text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders; bid uuid; pid uuid; already_paid numeric(10,2); remaining numeric(10,2);
BEGIN
  IF p_method NOT IN ('cash','counter_card') THEN RAISE EXCEPTION 'Invalid counter payment method'; END IF;
  SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
  IF NOT FOUND OR NOT staff_access(o.restaurant_id,ARRAY['owner','manager','cashier']) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF o.status<>'billed' OR o.payment_status='paid' THEN RAISE EXCEPTION 'Order is not awaiting counter payment'; END IF;
  SELECT id INTO bid FROM bills WHERE order_id=o.id FOR UPDATE;
  SELECT coalesce(sum(amount),0) INTO already_paid FROM payments WHERE bill_id=bid AND status='captured';
  remaining:=o.total_amount-already_paid;
  IF remaining<=0 THEN RAISE EXCEPTION 'Bill is already fully paid'; END IF;
  INSERT INTO payments(restaurant_id,order_id,bill_id,method,provider,status,amount,recorded_by,captured_at)
    VALUES(o.restaurant_id,o.id,bid,p_method,'manual','captured',remaining,auth.uid(),now()) RETURNING id INTO pid;
  UPDATE bills SET status='paid' WHERE id=bid;
  UPDATE bill_splits SET status='paid' WHERE bill_id=bid;
  UPDATE orders SET payment_status='paid',payment_method=CASE WHEN already_paid>0 THEN 'mixed' ELSE p_method END,status='closed',paid_at=now() WHERE id=o.id;
  INSERT INTO audit_logs(restaurant_id,staff_id,action_type,description,metadata) VALUES(o.restaurant_id,auth.uid(),'counter_payment','Counter payment recorded',jsonb_build_object('order_id',o.id,'method',p_method,'payment_id',pid));
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION capture_online_payment(p_provider_order text,p_provider_payment text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE p payments; o orders; b bills; paid_total numeric(10,2);
BEGIN
  SELECT * INTO p FROM payments WHERE provider_order_id=p_provider_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment order not found'; END IF;
  IF p.status='captured' AND p.provider_payment_id=p_provider_payment THEN RETURN; END IF;
  IF p.status<>'pending' THEN RAISE EXCEPTION 'Payment is no longer pending'; END IF;
  IF EXISTS(SELECT 1 FROM payments WHERE provider_payment_id=p_provider_payment AND id<>p.id) THEN RAISE EXCEPTION 'Payment was already used'; END IF;
  SELECT * INTO o FROM orders WHERE id=p.order_id FOR UPDATE;
  SELECT * INTO b FROM bills WHERE id=p.bill_id FOR UPDATE;
  UPDATE payments SET status='captured',provider_payment_id=p_provider_payment,captured_at=now() WHERE id=p.id;
  IF p.split_id IS NOT NULL THEN UPDATE bill_splits SET status='paid' WHERE id=p.split_id AND status='unpaid'; END IF;
  SELECT coalesce(sum(amount),0) INTO paid_total FROM payments WHERE bill_id=b.id AND status='captured';
  IF paid_total+0.01>=b.total_amount THEN
    UPDATE bills SET status='paid' WHERE id=b.id;
    UPDATE bill_splits SET status='paid' WHERE bill_id=b.id AND status='unpaid';
    UPDATE orders SET status=CASE WHEN order_type='takeaway' THEN 'placed' ELSE 'closed' END,payment_status='paid',payment_method='online_upi',payment_id=p_provider_payment,paid_at=now() WHERE id=o.id;
  ELSE
    UPDATE bills SET status='partially_paid' WHERE id=b.id;
    UPDATE orders SET payment_status='partially_paid',payment_method='online_upi' WHERE id=o.id;
  END IF;
END $$;

REVOKE ALL ON FUNCTION add_cart_item(uuid,uuid,uuid,uuid[],text),change_cart_item_quantity(uuid,uuid,integer),split_bill_equal(uuid,integer),split_bill_custom(uuid,numeric[]),split_bill_items(uuid,jsonb),record_counter_payment(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION add_cart_item(uuid,uuid,uuid,uuid[],text),change_cart_item_quantity(uuid,uuid,integer),split_bill_equal(uuid,integer),split_bill_custom(uuid,numeric[]),split_bill_items(uuid,jsonb),record_counter_payment(uuid,text) TO authenticated,service_role;
REVOKE ALL ON FUNCTION capture_online_payment(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION capture_online_payment(text,text) TO service_role;

COMMIT;


