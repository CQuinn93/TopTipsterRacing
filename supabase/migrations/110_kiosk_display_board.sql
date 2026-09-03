-- Competition Hub: public display board for always-on kiosk tablets.
-- Readable without a signed-in session (venue screen after patrons sign out).

create or replace function public.kiosk_get_display_board(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_comp public.lms_competitions%rowtype;
  v_participants jsonb := '[]'::jsonb;
  v_pool jsonb := '[]'::jsonb;
  v_picks jsonb := '[]'::jsonb;
  v_elim jsonb;
  v_alive int := 0;
  v_total int := 0;
begin
  if p_competition_id is null then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  select * into v_comp from public.lms_competitions where id = p_competition_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'competition_id', p.competition_id,
        'user_id', p.user_id,
        'status', p.status,
        'eliminated_gameweek_id', p.eliminated_gameweek_id,
        'joined_at', p.joined_at,
        'rollover_count', coalesce(p.rollover_count, 0),
        'lives_remaining', p.lives_remaining,
        'username', pr.username
      )
      order by
        case p.status
          when 'winner' then 0
          when 'active' then 1
          else 2
        end,
        lower(coalesce(pr.username, p.user_id::text))
    ),
    '[]'::jsonb
  )
  into v_participants
  from public.lms_participants p
  left join public.profiles pr on pr.id = p.user_id
  where p.competition_id = p_competition_id;

  select count(*)::int into v_total
  from public.lms_participants
  where competition_id = p_competition_id;

  select count(*)::int into v_alive
  from public.lms_participants
  where competition_id = p_competition_id
    and status in ('active', 'winner');

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'short_name', t.short_name,
        'slug', t.slug
      )
      order by coalesce(t.short_name, t.name)
    ),
    '[]'::jsonb
  )
  into v_pool
  from public.lms_competition_teams ct
  join public.lms_teams t on t.id = ct.team_id
  where ct.competition_id = p_competition_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'user_id', pk.user_id,
        'gameweek_id', pk.gameweek_id,
        'gameweek_number', gw.number,
        'team_id', pk.team_id,
        'result', pk.result,
        'team', jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'short_name', t.short_name,
          'slug', t.slug
        )
      )
      order by gw.number asc, pk.user_id
    ),
    '[]'::jsonb
  )
  into v_picks
  from public.lms_picks pk
  join public.lms_gameweeks gw on gw.id = pk.gameweek_id
  join public.lms_teams t on t.id = pk.team_id
  where pk.competition_id = p_competition_id
    and gw.season = v_comp.season
    and gw.status = 'complete';

  -- Inline elimination summary for this competition (no auth gate).
  select jsonb_build_object(
    'success', true,
    'season', v_comp.season,
    'competition_id', p_competition_id,
    'still_standing', v_alive,
    'gameweeks', coalesce(
      (
        select jsonb_agg(
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
        )
        from public.lms_gameweeks gw
        left join lateral (
          select count(*)::int as cnt
          from public.lms_participants p
          where p.eliminated_gameweek_id = gw.id
            and p.competition_id = p_competition_id
        ) ec on true
        left join lateral (
          select count(*)::int as cnt
          from public.lms_participants p
          left join public.lms_gameweeks eg on eg.id = p.eliminated_gameweek_id
          where p.competition_id = p_competition_id
            and (
              p.status in ('active', 'winner')
              or eg.number >= gw.number
            )
        ) ent on true
        where gw.season = v_comp.season
          and gw.status = 'complete'
          and exists (
            select 1
            from public.lms_participants p2
            where p2.competition_id = p_competition_id
              and p2.eliminated_gameweek_id = gw.id
          )
      ),
      '[]'::jsonb
    )
  )
  into v_elim;

  return jsonb_build_object(
    'success', true,
    'competition_id', p_competition_id,
    'competition_name', v_comp.name,
    'season', v_comp.season,
    'status', v_comp.status,
    'alive_count', v_alive,
    'total_count', v_total,
    'participants', v_participants,
    'pool_teams', v_pool,
    'picks', v_picks,
    'elimination', v_elim
  );
end;
$$;

revoke all on function public.kiosk_get_display_board(uuid) from public;
grant execute on function public.kiosk_get_display_board(uuid) to anon, authenticated;

comment on function public.kiosk_get_display_board(uuid) is
  'Venue hub display: standings, pool, completed picks, survival stats (no session required).';
