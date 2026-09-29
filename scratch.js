import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const envFile = fs.readFileSync('.env.local', 'utf8');
const urlMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_URL=(.+)/);
const keyMatch = envFile.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/);

if (!urlMatch || !keyMatch) {
  console.log("Missing keys in .env.local");
  process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const supabaseKey = keyMatch[1].trim();

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log("Testing read access to restaurants...");
  const { data, error } = await supabase
    .from('restaurants').select('id').limit(1);
    
  if (error) {
    console.error("SUPABASE ERROR:", JSON.stringify(error, null, 2));
  } else {
    console.log("SUCCESS:", data);
  }
}

testConnection();
