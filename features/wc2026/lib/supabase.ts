import { supabase } from '@/lib/supabase';

/**
 * World Cup 2026 domain client.
 * Uses a dedicated schema so WC tables stay isolated from racing tables.
 */
export const wcSupabase = (supabase as any).schema('wc2026');
