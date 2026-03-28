import { supabase } from '@/lib/supabase';
import type { TutorialGetDataPayload } from '@/lib/tutorialTypes';
import { TUTORIAL_SLUG_DEFAULT } from '@/lib/tutorialRaceBuilders';

export async function fetchTutorialData(slug = TUTORIAL_SLUG_DEFAULT): Promise<TutorialGetDataPayload | null> {
  try {
    // @ts-expect-error tutorial_get_data RPC not in generated Database types
    const { data } = await supabase.rpc('tutorial_get_data', { p_slug: slug });
    const payload = data as TutorialGetDataPayload | null;
    if (payload?.success) return payload;
    return null;
  } catch {
    return null;
  }
}
