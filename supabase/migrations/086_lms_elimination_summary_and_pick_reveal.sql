-- =============================================================================
-- LMS: elimination summary + pick stats reveal at deadline (not kick-off)
-- =============================================================================
-- Pick stats: revealed only after the gameweek deadline (picks locked).
-- Elimination summary: per completed gameweek, how many went out (scoped leagues).
-- =============================================================================

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

  -- Reveal after deadline while the gameweek is still in play (not complete).
  v_revealed := v_gw.deadline_at <= now() and v_gw.status <> 'complete';

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

create or replace function public.lms_get_elimination_summary(
  p_season text default '2026/27',
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
  v_season text := coalesce(nullif(trim(p_season), ''), '2026/27');
  v_allowed boolean := false;
  v_gameweeks jsonb := '[]'::jsonb;
  v_still_standing int := 0;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_competition_id is not null then
    select exists (
      select 1 from public.lms_participants p
      where p.competition_id = p_competition_id and p.user_id = v_uid
    )
    or exists (
      select 1 from public.lms_competition_managers m
      where m.competition_id = p_competition_id and m.user_id = v_uid
    )
    or exists (
      select 1 from public.lms_competitions c
      where c.id = p_competition_id and c.created_by_user_id = v_uid
    )
    into v_allowed;

    if not coalesce(v_allowed, false) then
      return jsonb_build_object('success', false, 'error', 'forbidden');
    end if;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'gameweek_id', gw.id,
        'gameweek_number', gw.number,
        'eliminated_count', coalesce(ec.cnt, 0)
      )
      order by gw.number asc
    ),
    '[]'::jsonb
  )
  into v_gameweeks
  from public.lms_gameweeks gw
  left join lateral (
    select count(*)::int as cnt
    from public.lms_participants p
    join public.lms_competitions c on c.id = p.competition_id
    where p.eliminated_gameweek_id = gw.id
      and c.season = v_season
      and (p_competition_id is null or p.competition_id = c.id)
      and (
        p_competition_id is not null
        or exists (
          select 1
          from public.lms_participants mine
          where mine.competition_id = c.id
            and mine.user_id = v_uid
        )
      )
  ) ec on true
  where gw.season = v_season
    and gw.status = 'complete'
    and (
      p_competition_id is not null
      or exists (
        select 1
        from public.lms_participants p
        join public.lms_competitions c on c.id = p.competition_id
        where p.user_id = v_uid
          and c.season = v_season
      )
    );

  select coalesce(sum(x.cnt), 0)::int into v_still_standing
  from (
    select count(*)::int as cnt
    from public.lms_participants p
    join public.lms_competitions c on c.id = p.competition_id
    where c.season = v_season
      and p.status in ('active', 'winner')
      and (p_competition_id is null or p.competition_id = c.id)
      and (
        p_competition_id is not null
        or exists (
          select 1
          from public.lms_participants mine
          where mine.competition_id = c.id
            and mine.user_id = v_uid
        )
      )
    group by p.competition_id
  ) x;

  return jsonb_build_object(
    'success', true,
    'season', v_season,
    'competition_id', p_competition_id,
    'still_standing', v_still_standing,
    'gameweeks', v_gameweeks
  );
end;
$$;

revoke all on function public.lms_get_elimination_summary(text, uuid) from public;
grant execute on function public.lms_get_elimination_summary(text, uuid) to authenticated;

comment on function public.lms_get_elimination_summary(text, uuid) is
  'Eliminations per completed gameweek. p_competition_id null = aggregate across caller''s leagues.';
