-- Apply AFTER database.sql, phase2_database.sql and fix_rls_and_cart.sql.
-- Run once in Supabase SQL editor. This transaction preserves existing rows.
BEGIN;
ALTER TABLE staff_profiles DROP CONSTRAINT IF EXISTS staff_profiles_role_check;
ALTER TABLE staff_profiles ADD CONSTRAINT staff_profiles_role_check CHECK(role IN ('owner','manager','cashier','waiter','kitchen'));
CREATE TABLE IF NOT EXISTS table_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), restaurant_id uuid NOT NULL REFERENCES restaurants,
 table_id uuid NOT NULL REFERENCES tables, closed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS active_table_session ON table_sessions(table_id) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS session_members (
 session_id uuid REFERENCES table_sessions ON DELETE CASCADE, user_id uuid REFERENCES auth.users ON DELETE CASCADE,
 PRIMARY KEY(session_id,user_id)
);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES table_sessions;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id text UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_id text UNIQUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE table_cart_items ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES table_sessions;

CREATE OR REPLACE FUNCTION staff_access(r uuid, roles text[] DEFAULT ARRAY['owner','manager','cashier','waiter','kitchen']) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM staff_profiles WHERE id=auth.uid() AND restaurant_id=r AND role=ANY(roles));
$$;
CREATE OR REPLACE FUNCTION session_access(s uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM session_members WHERE session_id=s AND user_id=auth.uid());
$$;

-- Replace permissive legacy policies; private data is only readable by its tenant/session.
DO $$ DECLARE t text; p record; BEGIN
 FOREACH t IN ARRAY ARRAY['restaurants','tables','categories','dishes','orders','order_items','table_cart_items','service_calls','staff_profiles','audit_logs','table_sessions','session_members'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t LOOP
   EXECUTE format('DROP POLICY %I ON %I',p.policyname,t);
  END LOOP;
 END LOOP;
END $$;
CREATE POLICY public_menu ON restaurants FOR SELECT USING(true);
CREATE POLICY public_tables ON tables FOR SELECT USING(true);
CREATE POLICY public_categories ON categories FOR SELECT USING(true);
CREATE POLICY public_dishes ON dishes FOR SELECT USING(true);
CREATE POLICY own_profile ON staff_profiles FOR SELECT USING(id=auth.uid());
CREATE POLICY read_sessions ON table_sessions FOR SELECT USING(session_access(id) OR staff_access(restaurant_id));
CREATE POLICY read_members ON session_members FOR SELECT USING(user_id=auth.uid());
CREATE POLICY read_orders ON orders FOR SELECT USING(session_access(session_id) OR staff_access(restaurant_id));
CREATE POLICY read_items ON order_items FOR SELECT USING(EXISTS(SELECT 1 FROM orders o WHERE o.id=order_id));
CREATE POLICY read_cart ON table_cart_items FOR SELECT USING(session_access(session_id) OR staff_access(restaurant_id));
CREATE POLICY read_calls ON service_calls FOR SELECT USING(staff_access(restaurant_id));
CREATE POLICY resolve_calls ON service_calls FOR UPDATE USING(staff_access(restaurant_id, ARRAY['owner','manager','waiter'])) WITH CHECK(staff_access(restaurant_id, ARRAY['owner','manager','waiter']));
CREATE POLICY read_audit ON audit_logs FOR SELECT USING(staff_access(restaurant_id, ARRAY['owner','manager']));
CREATE POLICY manage_categories ON categories FOR ALL USING(staff_access(restaurant_id, ARRAY['owner','manager'])) WITH CHECK(staff_access(restaurant_id, ARRAY['owner','manager']));
CREATE POLICY manage_dishes ON dishes FOR ALL USING(EXISTS(SELECT 1 FROM categories c WHERE c.id=category_id AND staff_access(c.restaurant_id, ARRAY['owner','manager']))) WITH CHECK(EXISTS(SELECT 1 FROM categories c WHERE c.id=category_id AND staff_access(c.restaurant_id, ARRAY['owner','manager'])));

CREATE OR REPLACE FUNCTION join_table(p_restaurant uuid,p_table uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 PERFORM 1 FROM tables WHERE id=p_table AND restaurant_id=p_restaurant FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid restaurant/table'; END IF;
 SELECT id INTO s FROM table_sessions WHERE table_id=p_table AND closed_at IS NULL;
 IF s IS NULL THEN INSERT INTO table_sessions(restaurant_id,table_id) VALUES(p_restaurant,p_table) RETURNING id INTO s; END IF;
 INSERT INTO session_members VALUES(s,auth.uid()) ON CONFLICT DO NOTHING;
 RETURN s;
END $$;

CREATE OR REPLACE FUNCTION change_cart(p_session uuid,p_dish uuid,p_delta int,p_name text DEFAULT '') RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s table_sessions; d dishes; i table_cart_items;
BEGIN
 SELECT * INTO s FROM table_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR NOT session_access(p_session) OR s.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Session expired'; END IF;
 IF p_delta NOT IN (-1,1) THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
 SELECT dishes.* INTO d FROM dishes JOIN categories c ON c.id=dishes.category_id WHERE dishes.id=p_dish AND c.restaurant_id=s.restaurant_id;
 IF NOT FOUND OR (p_delta>0 AND NOT d.is_available) THEN RAISE EXCEPTION 'Dish unavailable'; END IF;
 SELECT * INTO i FROM table_cart_items WHERE session_id=p_session AND dish_id=p_dish FOR UPDATE;
 IF i.id IS NULL THEN
  IF p_delta=1 THEN INSERT INTO table_cart_items(restaurant_id,table_id,session_id,dish_id,quantity,added_by_name) VALUES(s.restaurant_id,s.table_id,s.id,p_dish,1,left(p_name,100)); END IF;
 ELSIF i.quantity+p_delta<=0 THEN DELETE FROM table_cart_items WHERE id=i.id;
 ELSIF i.quantity+p_delta>99 THEN RAISE EXCEPTION 'Maximum quantity is 99';
 ELSE UPDATE table_cart_items SET quantity=quantity+p_delta WHERE id=i.id;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION cart_notes(p_session uuid,p_item uuid,p_notes text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM 1 FROM table_sessions WHERE id=p_session AND closed_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT session_access(p_session) THEN RAISE EXCEPTION 'Session expired'; END IF;
 UPDATE table_cart_items SET notes=left(p_notes,500) WHERE id=p_item AND session_id=p_session;
 IF NOT FOUND THEN RAISE EXCEPTION 'Cart item no longer exists'; END IF;
END $$;
CREATE OR REPLACE FUNCTION checkout_table(p_session uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s table_sessions; oid uuid; total numeric;
BEGIN
 SELECT * INTO s FROM table_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR s.closed_at IS NOT NULL OR NOT session_access(p_session) THEN RAISE EXCEPTION 'Session expired'; END IF;
 IF EXISTS(SELECT 1 FROM table_cart_items i JOIN dishes d ON d.id=i.dish_id JOIN categories c ON c.id=d.category_id WHERE i.session_id=p_session AND (NOT d.is_available OR d.price<0 OR c.restaurant_id<>s.restaurant_id)) THEN RAISE EXCEPTION 'A cart item is unavailable. Please update your cart.'; END IF;
 SELECT sum(i.quantity*d.price) INTO total FROM table_cart_items i JOIN dishes d ON d.id=i.dish_id WHERE i.session_id=p_session;
 IF total IS NULL THEN RAISE EXCEPTION 'Cart is empty or has already been ordered'; END IF;
 INSERT INTO orders(restaurant_id,table_id,session_id,status,total_amount) VALUES(s.restaurant_id,s.table_id,s.id,'placed',total) RETURNING id INTO oid;
 INSERT INTO order_items(order_id,dish_id,quantity,price_at_time,notes) SELECT oid,i.dish_id,i.quantity,d.price,i.notes FROM table_cart_items i JOIN dishes d ON d.id=i.dish_id WHERE i.session_id=p_session;
 DELETE FROM table_cart_items WHERE session_id=p_session;
 RETURN oid;
END $$;
CREATE OR REPLACE FUNCTION request_service(p_session uuid,p_type text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s table_sessions;
BEGIN
 SELECT * INTO s FROM table_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR s.closed_at IS NOT NULL OR NOT session_access(p_session) THEN RAISE EXCEPTION 'Session expired'; END IF;
 IF p_type NOT IN ('call_waiter','request_bill','request_water') THEN RAISE EXCEPTION 'Invalid request'; END IF;
 IF NOT EXISTS(SELECT 1 FROM service_calls WHERE table_id=s.table_id AND request_type=p_type AND status='pending') THEN
 INSERT INTO service_calls(restaurant_id,table_id,request_type) VALUES(s.restaurant_id,s.table_id,p_type);
 END IF;
END $$;

CREATE OR REPLACE FUNCTION finish_session() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.status='closed' AND NEW.session_id IS NOT NULL THEN
  PERFORM 1 FROM table_sessions WHERE id=NEW.session_id FOR UPDATE;
  IF NOT EXISTS(SELECT 1 FROM orders WHERE session_id=NEW.session_id AND status<>'closed') AND NOT EXISTS(SELECT 1 FROM table_cart_items WHERE session_id=NEW.session_id) THEN
   UPDATE table_sessions SET closed_at=now() WHERE id=NEW.session_id;
   UPDATE service_calls SET status='resolved' WHERE table_id=NEW.table_id AND status='pending';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS close_paid_session ON orders;
CREATE TRIGGER close_paid_session AFTER UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION finish_session();
CREATE OR REPLACE FUNCTION change_order_status(p_order uuid,p_status text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o orders; allowed text[];
BEGIN
 SELECT * INTO o FROM orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
 allowed := CASE WHEN p_status IN ('billed','closed') THEN ARRAY['owner','manager','cashier'] WHEN p_status IN ('preparing','served') THEN ARRAY['owner','manager','waiter','kitchen'] ELSE ARRAY['owner','manager','waiter'] END;
 IF NOT staff_access(o.restaurant_id,allowed) THEN RAISE EXCEPTION 'Not authorized for this action'; END IF;
 IF NOT ((o.status='placed' AND p_status='accepted') OR (o.status='accepted' AND p_status='preparing') OR (o.status='preparing' AND p_status='served') OR (o.status='served' AND p_status='billed') OR (o.status='billed' AND p_status='closed')) THEN RAISE EXCEPTION 'Order changed; refresh and try again'; END IF;
 UPDATE orders SET status=p_status, paid_at=CASE WHEN p_status='closed' THEN now() ELSE paid_at END WHERE id=p_order;
 INSERT INTO audit_logs(restaurant_id,staff_id,action_type,description,metadata) VALUES(o.restaurant_id,auth.uid(),'order_status','Staff changed order status',jsonb_build_object('order_id',p_order,'from',o.status,'to',p_status));
END $$;

CREATE OR REPLACE FUNCTION import_menu(p_rows jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r uuid; row jsonb; cat uuid; count_categories int:=0; count_dishes int:=0;
BEGIN
 SELECT restaurant_id INTO r FROM staff_profiles WHERE id=auth.uid() AND role IN ('owner','manager');
 IF r IS NULL THEN RAISE EXCEPTION 'Only managers can import menus'; END IF;
 PERFORM 1 FROM restaurants WHERE id=r FOR UPDATE;
 IF jsonb_typeof(p_rows)<>'array' OR jsonb_array_length(p_rows) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid import size'; END IF;
 FOR row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
  IF coalesce(trim(row->>'name'),'')='' OR coalesce(trim(row->>'category'),'')='' OR (row->>'price')::numeric<0 THEN RAISE EXCEPTION 'Invalid dish'; END IF;
  SELECT id INTO cat FROM categories WHERE restaurant_id=r AND name=row->>'category' ORDER BY created_at LIMIT 1;
  IF cat IS NULL THEN INSERT INTO categories(restaurant_id,name) VALUES(r,row->>'category') RETURNING id INTO cat; count_categories:=count_categories+1; END IF;
  INSERT INTO dishes(category_id,name,price,description,is_veg,image_url) VALUES(cat,row->>'name',(row->>'price')::numeric,row->>'description',(row->>'is_veg')::boolean,nullif(row->>'image_url',''));
  count_dishes:=count_dishes+1;
 END LOOP;
 RETURN jsonb_build_object('dishesCount',count_dishes,'categoriesCount',(SELECT count(DISTINCT value->>'category') FROM jsonb_array_elements(p_rows)),'newCategoriesCount',count_categories);
END $$;

-- Explicit grants: customer/staff writes only use checked transaction functions.
REVOKE ALL ON table_sessions,session_members FROM anon,authenticated;
GRANT SELECT ON table_sessions,session_members TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON orders,order_items,table_cart_items,audit_logs,staff_profiles,service_calls FROM anon,authenticated;
GRANT SELECT ON orders,order_items,table_cart_items,audit_logs,staff_profiles,service_calls TO authenticated;
GRANT UPDATE(status) ON service_calls TO authenticated;
GRANT SELECT ON restaurants,tables,categories,dishes TO anon,authenticated;
REVOKE DELETE ON categories,dishes FROM authenticated,anon;
GRANT INSERT,UPDATE ON categories,dishes TO authenticated;
GRANT ALL ON table_sessions,session_members TO service_role;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('staff_access','session_access','join_table','change_cart','cart_notes','checkout_table','request_service','change_order_status','import_menu') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated,service_role',f.signature);
 END LOOP;
END $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['orders','order_items','table_cart_items','service_calls','dishes'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
   EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I',t);
  END IF;
 END LOOP;
END $$;
-- Images are public menu assets; writes are restricted to each restaurant folder.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('menu-images','menu-images',true,5242880,ARRAY['image/jpeg','image/png','image/webp']) ON CONFLICT(id) DO NOTHING;
CREATE POLICY menu_image_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='menu-images' AND EXISTS(SELECT 1 FROM staff_profiles s WHERE s.id=auth.uid() AND s.role IN ('owner','manager') AND (storage.foldername(name))[1]=s.restaurant_id::text));
CREATE POLICY menu_image_remove ON storage.objects FOR DELETE TO authenticated USING(bucket_id='menu-images' AND EXISTS(SELECT 1 FROM staff_profiles s WHERE s.id=auth.uid() AND s.role IN ('owner','manager') AND (storage.foldername(name))[1]=s.restaurant_id::text));
COMMIT;
