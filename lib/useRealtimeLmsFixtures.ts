/**
 * Subscribe to Realtime Broadcast updates on topic `lms_fixtures`.
 * When a fixture we care about is updated (e.g. live score / finished from sync-lms-football),
 * calls onFixturesUpdated after a short debounce so the UI can refetch.
 *
 * Requires migration 085 (Broadcast triggers + realtime.messages RLS). No table Replication needed.
 */
import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const DEBOUNCE_MS = 1200;
const TOPIC = 'lms_fixtures';

type BroadcastUpdatePayload = {
  payload?: {
    record?: { id?: string };
  };
};

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

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const scheduleRefetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onFixturesUpdatedRef.current();
      }, DEBOUNCE_MS);
    };

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channel = supabase
        .channel(TOPIC, { config: { private: true } })
        .on('broadcast', { event: 'UPDATE' }, (msg: BroadcastUpdatePayload) => {
          const id = msg?.payload?.record?.id;
          if (id && fixtureIdsSetRef.current.has(id)) {
            scheduleRefetch();
          }
        })
        .subscribe();

      if (cancelled) {
        supabase.removeChannel(channel);
        channel = null;
      }
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [fixtureIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps -- only resub when id list changes
}
