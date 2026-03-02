/**
 * Subscribe to Supabase Realtime updates on the `races` table.
 * When a race we care about is updated (e.g. is_finished set by update-race-results script),
 * calls onRaceUpdated after a short debounce so the UI can refetch.
 *
 * Ensure Realtime is enabled for `races` in Supabase: Database → Replication → enable for public.races.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const DEBOUNCE_MS = 1200;

export function useRealtimeRaces(
  /** api_race_id values for races we care about (e.g. current competition or results view). */
  raceApiIds: string[],
  /** Called when one of our races was updated; refetch data here. */
  onRaceUpdated: () => void
) {
  const onRaceUpdatedRef = useRef(onRaceUpdated);
  onRaceUpdatedRef.current = onRaceUpdated;

  const raceIdsSetRef = useRef<Set<string>>(new Set());
  raceIdsSetRef.current = new Set(raceApiIds);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (raceApiIds.length === 0) return;

    const channel = supabase
      .channel(`races-updates-${raceApiIds.slice(0, 2).join('-')}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'races',
        },
        (payload: { new?: { api_race_id?: string } }) => {
          const apiId = payload?.new?.api_race_id;
          if (apiId && raceIdsSetRef.current.has(apiId)) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
              debounceRef.current = null;
              onRaceUpdatedRef.current();
            }, DEBOUNCE_MS);
          }
        }
      )
      .subscribe();

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      supabase.removeChannel(channel);
    };
  }, [raceApiIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps -- only resub when id list changes
}
