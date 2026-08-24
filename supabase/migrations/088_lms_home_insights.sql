-- =============================================================================
-- LMS: home insights — one RPC for survival + all user pools
-- =============================================================================
-- Replaces the home-screen waterfall (elimination summary + 5–6 pool queries)
-- with a single authenticated call.
-- =============================================================================

create or replace function public.lms_get_home_insights(
  p_season text default '2026/27'
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
  v_comp_ids uuid[];
  v_comp_id uuid;
  v_overall jsonb;
  v_by_competition jsonb := '{}'::jsonb;
  v_pools jsonb := '{}'::jsonb;
  v_one jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  select coalesce(array_agg(c.id order by p.joined_at desc), '{}'::uuid[])
  into v_comp_ids
  from public.lms_participants p
  join public.lms_competitions c on c.id = p.competition_id
  where p.user_id = v_uid
    and c.season = v_season;

  v_overall := public.lms_get_elimination_summary(v_season, null);

  foreach v_comp_id in array v_comp_ids loop
    v_one := public.lms_get_elimination_summary(v_season, v_comp_id);
    v_by_competition := v_by_competition || jsonb_build_object(v_comp_id::text, v_one);
  end loop;

  select coalesce(
    jsonb_object_agg(q.competition_id::text, q.teams),
    '{}'::jsonb
  )
  into v_pools
  from (
    select
      ct.competition_id,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'team_id', t.id,
            'name', t.name,
            'short_name', t.short_name,
            'slug', t.slug,
            'used', used.gw_number is not null,
            'gameweek_number', used.gw_number
          )
          order by coalesce(t.short_name, t.name)
        ),
        '[]'::jsonb
      ) as teams
    from public.lms_competition_teams ct
    join public.lms_teams t on t.id = ct.team_id
    join unnest(v_comp_ids) as cid(id) on cid.id = ct.competition_id
    left join lateral (
      select gw.number as gw_number
      from public.lms_picks pk
      join public.lms_gameweeks gw on gw.id = pk.gameweek_id
      where pk.competition_id = ct.competition_id
        and pk.user_id = v_uid
        and pk.team_id = t.id
      order by gw.number desc
      limit 1
    ) used on true
    group by ct.competition_id
  ) q;

  return jsonb_build_object(
    'success', true,
    'season', v_season,
    'eliminations', jsonb_build_object(
      'overall', v_overall,
      'by_competition', v_by_competition
    ),
    'pools', v_pools
  );
end;
$$;

revoke all on function public.lms_get_home_insights(text) from public;
grant execute on function public.lms_get_home_insights(text) to authenticated;

comment on function public.lms_get_home_insights(text) is
  'Single home payload: overall + per-league elimination summaries and used/available pools for every competition the caller is in.';
