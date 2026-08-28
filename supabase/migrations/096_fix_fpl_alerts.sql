-- Fix FPL injury alerts: include inactive/removed squad players and harden detection.

create or replace function public.football_player_has_fpl_alert(p_stats jsonb)
returns boolean
language sql
stable
as $$
  select
    p_stats is not null
    and p_stats <> '{}'::jsonb
    and (
      lower(trim(coalesce(p_stats->>'fpl_status', 'a'))) not in ('a', '')
      or trim(coalesce(p_stats->>'news', '')) <> ''
      or (
        coalesce(p_stats->>'chance_of_playing_next_round', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        and (p_stats->>'chance_of_playing_next_round')::numeric < 100
      )
      or (
        coalesce(p_stats->>'chance_of_playing_this_round', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
        and (p_stats->>'chance_of_playing_this_round')::numeric < 100
      )
    );
$$;

create or replace function public.owner_list_football_players_fpl_alerts()
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
            'team_name', coalesce(t.name, 'Unknown team'),
            'team_short_name', coalesce(t.short_name, '—'),
            'owner_flagged', fp.owner_flagged,
            'owner_flagged_at', fp.owner_flagged_at,
            'is_active', fp.is_active,
            'picker_stats', fp.picker_stats,
            'fpl_element_id', fp.fpl_element_id,
            'bbs_player_id', fp.bbs_player_id
          )
          order by
            case lower(trim(coalesce(fp.picker_stats->>'fpl_status', 'a')))
              when 'i' then 1
              when 'u' then 2
              when 's' then 3
              when 'n' then 4
              when 'd' then 5
              else 6
            end,
            coalesce(t.name, ''),
            fp.display_name
        )
        from public.football_players fp
        left join public.lms_teams t on t.id = fp.team_id
        where public.football_player_has_fpl_alert(fp.picker_stats)
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.owner_list_football_players_fpl_alerts() to authenticated;
