-- Auto-exclude FPL unavailable players (left club / out of PL pool).

update public.football_players
set
  owner_flagged = true,
  owner_flagged_at = coalesce(owner_flagged_at, now()),
  owner_flagged_by = null,
  updated_at = now()
where lower(trim(coalesce(picker_stats->>'fpl_status', ''))) = 'u'
  and owner_flagged = false;
