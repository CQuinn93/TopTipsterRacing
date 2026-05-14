-- Allow fractional WC prediction points (e.g. 1.5 for close ante-post scores).
-- Keeps combined mini-league totals consistent with per-pick scoring.

alter table wc2026.predictions
  alter column points_awarded type numeric(10, 2)
  using case when points_awarded is null then null else points_awarded::numeric end;

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
          'total_points', s.total_points
        ))
      from (
        select
          p.user_id,
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
