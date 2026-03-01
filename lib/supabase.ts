import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { SUPABASE_URL as FALLBACK_URL, SUPABASE_ANON_KEY as FALLBACK_KEY } from '@/lib/supabaseConfig';

// App uses only the anon (public) key. Service key is for scripts/admin backends only.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? FALLBACK_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? FALLBACK_KEY;

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('YOUR_PROJECT') || supabaseKey.includes('YOUR_ANON')) {
  throw new Error(
    'Missing Supabase config. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in .env or EAS Secrets, or replace placeholders in lib/supabaseConfig.ts with your Supabase URL and anon key.'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/** Base URL for Supabase project (for Edge Functions). */
export function getSupabaseUrl(): string {
  return process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? FALLBACK_URL;
}
