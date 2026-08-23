-- =============================================================================
-- LMS: gameweek pick stats — optional competition filter
-- =============================================================================
-- Extends lms_get_gameweek_pick_stats with p_competition_id (null = all leagues).
-- Competition-scoped stats require the caller to be a participant (or manager).
-- =============================================================================

drop function if exists public.lms_get_gameweek_pick_stats(uuid);

create or replace function public.lms_get_gameweek_pick_stats(
  p_gameweek_id uuid,
  p_competition_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_gw public.lms_gameweeks%rowtype;
  v_revealed boolean := false;
  v_total int := 0;
  v_teams jsonb := '[]'::jsonb;
  v_allowed boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select * into v_gw from public.lms_gameweeks where id = p_gameweek_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_gameweek');
  end if;

  if p_competition_id is not null then
    select exists (
      select 1
      from public.lms_participants p
      where p.competition_id = p_competition_id
        and p.user_id = v_uid
    )
    or exists (
      select 1
      from public.lms_competition_managers m
      where m.competition_id = p_competition_id
        and m.user_id = v_uid
    )
    or exists (
      select 1
      from public.lms_competitions c
      where c.id = p_competition_id
        and c.created_by_user_id = v_uid
    )
    into v_allowed;

    if not coalesce(v_allowed, false) then
      return jsonb_build_object('success', false, 'error', 'forbidden');
    end if;
  end if;

  select exists (
    select 1
    from public.lms_fixtures f
    where f.gameweek_id = p_gameweek_id
      and coalesce(f.excluded_from_lms, false) = false
      and f.kickoff_at <= now()
  ) into v_revealed;

  if not v_revealed then
    return jsonb_build_object(
      'success', true,
      'revealed', false,
      'gameweek_id', v_gw.id,
      'gameweek_number', v_gw.number,
      'competition_id', p_competition_id,
      'total_picks', 0,
      'teams', '[]'::jsonb
    );
  end if;

  select count(*)::int into v_total
  from public.lms_picks pk
  where pk.gameweek_id = p_gameweek_id
    and (p_competition_id is null or pk.competition_id = p_competition_id);

  select coalesce(
    jsonb_agg(row_json order by (row_json->>'pick_count')::int desc, row_json->>'short_name' asc),
    '[]'::jsonb
  )
  into v_teams
  from (
    select jsonb_build_object(
      'team_id', t.id,
      'name', t.name,
      'short_name', t.short_name,
      'slug', t.slug,
      'pick_count', coalesce(pc.cnt, 0),
      'pick_pct', case
        when v_total > 0 then round((coalesce(pc.cnt, 0)::numeric * 100.0) / v_total, 1)
        else 0
      end,
      'outcome', case
        when fx.id is null then 'no_fixture'
        when coalesce(fx.excluded_from_lms, false) then 'excluded'
        when fx.status <> 'finished' then 'pending'
        when fx.home_goals is not null
          and fx.away_goals is not null
          and fx.home_goals = fx.away_goals then 'draw'
        when public.lms_team_won_fixture(fx, t.id) then 'won'
        else 'lost'
      end
    ) as row_json
    from public.lms_teams t
    left join (
      select pk.team_id, count(*)::int as cnt
      from public.lms_picks pk
      where pk.gameweek_id = p_gameweek_id
        and (p_competition_id is null or pk.competition_id = p_competition_id)
      group by pk.team_id
    ) pc on pc.team_id = t.id
    left join lateral (
      select f.*
      from public.lms_fixtures f
      where f.gameweek_id = p_gameweek_id
        and (f.home_team_id = t.id or f.away_team_id = t.id)
      order by coalesce(f.excluded_from_lms, false) asc, f.kickoff_at asc
      limit 1
    ) fx on true
  ) q;

  return jsonb_build_object(
    'success', true,
    'revealed', true,
    'gameweek_id', v_gw.id,
    'gameweek_number', v_gw.number,
    'competition_id', p_competition_id,
    'total_picks', v_total,
    'teams', v_teams
  );
end;
$$;

revoke all on function public.lms_get_gameweek_pick_stats(uuid, uuid) from public;
grant execute on function public.lms_get_gameweek_pick_stats(uuid, uuid) to authenticated;

comment on function public.lms_get_gameweek_pick_stats(uuid, uuid) is
  'GW pick share by team. p_competition_id null = all leagues; else one competition the caller belongs to.';
