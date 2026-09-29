import { createClient } from '@supabase/supabase-js';
import { isDemo } from './config';

const supabaseUrl = isDemo ? 'https://placeholder.supabase.co' : process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = isDemo ? 'placeholder' : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
