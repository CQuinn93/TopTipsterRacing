import { supabase } from '@/lib/supabase';

const db = supabase as any;

export type FundraiserSport = 'lms' | 'f2t' | 'racing';

export type FundraiserBranding = {
  sport: FundraiserSport;
  competition_id: string;
  club_name: string;
  club_logo_url: string | null;
};

export function fundraiserKey(sport: FundraiserSport, competitionId: string): string {
  return `${sport}:${competitionId}`;
}

/** Batch-load fundraiser branding for Gamemaster-created competitions. */
export async function fetchCompetitionsFundraiserBranding(
  items: Array<{ sport: FundraiserSport; competition_id: string }>
): Promise<Record<string, FundraiserBranding>> {
  const unique = new Map<string, { sport: FundraiserSport; competition_id: string }>();
  for (const item of items) {
    const id = String(item.competition_id ?? '').trim();
    if (!id) continue;
    unique.set(fundraiserKey(item.sport, id), { sport: item.sport, competition_id: id });
  }
  if (unique.size === 0) return {};

  const { data, error } = await db.rpc('get_competitions_fundraiser_branding', {
    p_items: Array.from(unique.values()),
  });
  if (error) throw error;

  const out: Record<string, FundraiserBranding> = {};
  for (const row of Array.isArray(data) ? data : []) {
    const sport = String(row?.sport ?? '') as FundraiserSport;
    const competitionId = String(row?.competition_id ?? '');
    const clubName = String(row?.club_name ?? '').trim();
    if (!competitionId || !clubName || !['lms', 'f2t', 'racing'].includes(sport)) continue;
    out[fundraiserKey(sport, competitionId)] = {
      sport,
      competition_id: competitionId,
      club_name: clubName,
      club_logo_url: row?.club_logo_url ? String(row.club_logo_url) : null,
    };
  }
  return out;
}
