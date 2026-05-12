-- Leaderboard detail: all predictions for users in a mini-league (same access as wc_football_leaderboard).

create or replace function public.wc_football_competition_predictions(p_competition_id uuid)
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

  -- Order in a subquery, then aggregate (avoids jsonb_agg(… ORDER BY …) compatibility issues on some PG builds).
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
        from wc2026.football_competition_participants p
        join wc2026.predictions pr on pr.user_id = p.user_id
        where p.competition_id = p_competition_id
        order by pr.user_id, coalesce(pr.match_number, 9999), pr.prediction_type
      ) ordered_rows
    ),
    '[]'::jsonb
  );
end;
$$;

grant execute on function public.wc_football_competition_predictions(uuid) to authenticated;
