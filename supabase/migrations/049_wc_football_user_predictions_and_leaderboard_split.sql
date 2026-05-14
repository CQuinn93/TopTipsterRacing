-- Per-user competition predictions (lazy-load for leaderboards) + ante/live totals on leaderboard RPC.

create or replace function public.wc_football_leaderboard(p_competition_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  if not exists (
    select 1 from wc2026.football_competition_participants me
    where me.competition_id = p_competition_id and me.user_id = v_uid
  )
  and not exists (select 1 from public.profiles where id = v_uid and role = 'Admin') then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(jsonb_build_object(
          'user_id', s.user_id,
          'ante_points', s.ante_points,
          'live_points', s.live_points,
          'total_points', s.total_points
        ))
      from (
        select
          p.user_id,
          coalesce(sum(pr.points_awarded) filter (where pr.prediction_type = 'ante_post'), 0)::numeric(12, 2) as ante_points,
          coalesce(sum(pr.points_awarded) filter (where pr.prediction_type = 'live'), 0)::numeric(12, 2) as live_points,
          coalesce(sum(pr.points_awarded), 0)::numeric(12, 2) as total_points
        from wc2026.football_competition_participants p
        left join wc2026.predictions pr on pr.user_id = p.user_id
        where p.competition_id = p_competition_id
        group by p.user_id
      ) s
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.wc_football_user_competition_predictions(p_competition_id uuid, p_target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, wc2026
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;
  if not exists (
    select 1 from wc2026.football_competition_participants me
    where me.competition_id = p_competition_id and me.user_id = v_uid
  )
  and not exists (select 1 from public.profiles where id = v_uid and role = 'Admin') then
    return '[]'::jsonb;
  end if;

  if not exists (
    select 1 from wc2026.football_competition_participants p
    where p.competition_id = p_competition_id and p.user_id = p_target_user_id
  ) then
    return '[]'::jsonb;
  end if;

  return coalesce(
    (
      select jsonb_agg(elem)
      from (
        select
          jsonb_build_object(
            'id', pr.id,
            'user_id', pr.user_id,
            'match_id', pr.match_id,
            'match_number', pr.match_number,
            'prediction_type', pr.prediction_type,
            'home_score', pr.home_score,
            'away_score', pr.away_score,
            'predicted_winner_id', pr.predicted_winner_id,
            'live_outcome', pr.live_outcome,
            'live_total_goals', pr.live_total_goals,
            'live_btts', pr.live_btts,
            'points_awarded', pr.points_awarded,
            'is_correct', pr.is_correct,
            'created_at', pr.created_at,
            'updated_at', pr.updated_at
          ) as elem
        from wc2026.predictions pr
        where pr.user_id = p_target_user_id
        order by coalesce(pr.match_number, 9999), pr.prediction_type
      ) ordered_rows
    ),
    '[]'::jsonb
  );
end;
$$;

grant execute on function public.wc_football_user_competition_predictions(uuid, uuid) to authenticated;
