-- ==========================================
-- Database Schema Additions for Phase 2
-- ==========================================

-- 1. Staff Profiles (Links to auth.users in Supabase)
CREATE TABLE staff_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'waiter', 'kitchen')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Service Calls (Customer requests from table)
CREATE TABLE service_calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    table_id UUID REFERENCES tables(id) ON DELETE CASCADE,
    request_type TEXT NOT NULL CHECK (request_type IN ('call_waiter', 'request_bill', 'request_water')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Audit Logs (Tracking sensitive actions)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ==========================================
-- Supabase Realtime Setup for Phase 2
-- ==========================================
-- Enable replication for service_calls so the staff portal gets notified instantly
BEGIN;
  -- Assuming supabase_realtime publication already exists from Phase 1
  ALTER PUBLICATION supabase_realtime ADD TABLE service_calls;
COMMIT;
