-- Football player position (GK / DEF / MID / FWD) from BBS roster or FPL bootstrap.

alter table public.football_players
  add column if not exists position text
    check (position is null or position in ('GK', 'DEF', 'MID', 'FWD'));

comment on column public.football_players.position is
  'Normalized outfield role: GK, DEF, MID, FWD.';

create index if not exists idx_football_players_position
  on public.football_players(position)
  where position is not null;

-- ---------------------------------------------------------------------------
-- RPCs: expose position on player payloads
-- ---------------------------------------------------------------------------

create or replace function public.f2t_list_selectable_players(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.f2t_is_competition_member(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  return jsonb_build_object(
    'success', true,
    'players', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', fp.id,
            'display_name', fp.display_name,
            'full_name', fp.full_name,
            'position', fp.position,
            'team_id', fp.team_id,
            'team_name', t.name,
            'team_short_name', t.short_name,
            'team_slug', t.slug,
            'picker_stats', fp.picker_stats,
            'owner_flagged', fp.owner_flagged,
            'already_scored_for_comp', public.f2t_player_scored_since_start(p_competition_id, fp.id)
          )
          order by t.name, fp.display_name
        )
        from public.football_players fp
        join public.lms_teams t on t.id = fp.team_id
        where fp.is_active = true
          and fp.owner_flagged = false
          and not public.f2t_player_scored_since_start(p_competition_id, fp.id)
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.owner_list_football_players(
  p_team_id uuid default null,
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  return jsonb_build_object(
    'success', true,
    'players', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', fp.id,
            'display_name', fp.display_name,
            'full_name', fp.full_name,
            'position', fp.position,
            'team_id', fp.team_id,
            'team_name', t.name,
            'team_short_name', t.short_name,
            'owner_flagged', fp.owner_flagged,
            'owner_flagged_at', fp.owner_flagged_at,
            'is_active', fp.is_active,
            'picker_stats', fp.picker_stats,
            'fpl_element_id', fp.fpl_element_id,
            'bbs_player_id', fp.bbs_player_id
          )
          order by t.name, fp.display_name
        )
        from public.football_players fp
        join public.lms_teams t on t.id = fp.team_id
        where (p_team_id is null or fp.team_id = p_team_id)
          and (
            p_search is null
            or trim(p_search) = ''
            or fp.display_name ilike '%' || trim(p_search) || '%'
            or fp.full_name ilike '%' || trim(p_search) || '%'
          )
      ),
      '[]'::jsonb
    )
  );
end;
$$;
