import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { isDemo } from './config';
export class HttpError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function apiError(error: unknown) {
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('API request failed', error);
  return NextResponse.json({ error: 'The request could not be completed. Please try again.' }, { status: 500 });
}
export async function authenticatedClient(request: Request) {
  if (isDemo) throw new HttpError('Configure Supabase to use this feature.', 503);
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new HttpError('Please sign in.', 401);
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new HttpError('Your session has expired. Please sign in.', 401);
  return { client, user: data.user };
}
export function adminClient() {
  if (isDemo || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new HttpError('Server payment configuration is incomplete.', 503);
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}
