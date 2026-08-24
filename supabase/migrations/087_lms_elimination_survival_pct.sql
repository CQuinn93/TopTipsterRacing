-- =============================================================================
-- LMS: elimination summary — survival rate per completed gameweek
-- =============================================================================

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
        'eliminated_count', coalesce(ec.cnt, 0),
        'entrants_count', coalesce(ent.cnt, 0),
        'survival_pct', case
          when coalesce(ent.cnt, 0) > 0 then round(
            ((ent.cnt - coalesce(ec.cnt, 0))::numeric * 100.0) / ent.cnt,
            0
          )
          else 100
        end
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
  left join lateral (
    select count(*)::int as cnt
    from public.lms_participants p
    join public.lms_competitions c on c.id = p.competition_id
    left join public.lms_gameweeks eg on eg.id = p.eliminated_gameweek_id
    where c.season = v_season
      and (p_competition_id is null or p.competition_id = c.id)
      and (
        p.status in ('active', 'winner')
        or eg.number >= gw.number
      )
      and (
        p_competition_id is not null
        or exists (
          select 1
          from public.lms_participants mine
          where mine.competition_id = c.id
            and mine.user_id = v_uid
        )
      )
  ) ent on true
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
