/**
 * Subscribe to Supabase Realtime updates on `lms_fixtures`.
 * When a fixture we care about is updated (e.g. live score / finished from sync-lms-football),
 * calls onFixturesUpdated after a short debounce so the UI can refetch.
 *
 * Ensure Realtime is enabled for `lms_fixtures` in Supabase:
 * Database → Replication → enable for public.lms_fixtures.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const DEBOUNCE_MS = 1200;

export function useRealtimeLmsFixtures(
  /** Fixture row ids for the open competition gameweek. */
  fixtureIds: string[],
  /** Called when one of our fixtures was updated; refetch fixtures + standing here. */
  onFixturesUpdated: () => void
) {
  const onFixturesUpdatedRef = useRef(onFixturesUpdated);
  onFixturesUpdatedRef.current = onFixturesUpdated;

  const fixtureIdsSetRef = useRef<Set<string>>(new Set());
  fixtureIdsSetRef.current = new Set(fixtureIds);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (fixtureIds.length === 0) return;

    const channel = supabase
      .channel(`lms-fixtures-${fixtureIds.slice(0, 2).join('-')}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lms_fixtures',
        },
        (payload: { new?: { id?: string } }) => {
          const id = payload?.new?.id;
          if (id && fixtureIdsSetRef.current.has(id)) {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            debounceRef.current = setTimeout(() => {
              debounceRef.current = null;
              onFixturesUpdatedRef.current();
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
  }, [fixtureIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps -- only resub when id list changes
}
