/**
 * Subscribe to Realtime Broadcast updates on topic `races`.
 * When a race we care about is updated (e.g. is_finished set by update-race-results script),
 * calls onRaceUpdated after a short debounce so the UI can refetch.
 *
 * Requires migration 085 (Broadcast triggers + realtime.messages RLS). No table Replication needed.
 */
import { useEffect, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

const DEBOUNCE_MS = 1200;
const TOPIC = 'races';

type BroadcastUpdatePayload = {
  payload?: {
    record?: { api_race_id?: string };
  };
};

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

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    const scheduleRefetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        onRaceUpdatedRef.current();
      }, DEBOUNCE_MS);
    };

    (async () => {
      await supabase.realtime.setAuth();
      if (cancelled) return;

      channel = supabase
        .channel(TOPIC, { config: { private: true } })
        .on('broadcast', { event: 'UPDATE' }, (msg: BroadcastUpdatePayload) => {
          const apiId = msg?.payload?.record?.api_race_id;
          if (apiId && raceIdsSetRef.current.has(apiId)) {
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
  }, [raceApiIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps -- only resub when id list changes
}
