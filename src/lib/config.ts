const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const isDemo = !url || !key || /placeholder|your_supabase/i.test(`${url} ${key}`);
export const demoRestaurantId = '11111111-1111-1111-1111-111111111111';
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
