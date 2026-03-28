-- Single payload RPC for onboarding tutorial data.
-- Returns one active tutorial meeting (or the one matching p_slug) with races, runners, bots, and bot selections.

create or replace function public.tutorial_get_data(p_slug text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_meeting_id uuid;
  v_slug text;
  v_title text;
  v_subtitle text;
  v_races jsonb;
  v_bots jsonb;
  v_bot_selections jsonb;
begin
  if p_slug is not null and length(trim(p_slug)) > 0 then
    select tm.id, tm.slug, tm.title, tm.subtitle
      into v_meeting_id, v_slug, v_title, v_subtitle
    from public.tutorial_meetings tm
    where tm.is_active = true
      and tm.slug = trim(p_slug)
    limit 1;
  else
    select tm.id, tm.slug, tm.title, tm.subtitle
      into v_meeting_id, v_slug, v_title, v_subtitle
    from public.tutorial_meetings tm
    where tm.is_active = true
    order by tm.created_at asc
    limit 1;
  end if;

  if v_meeting_id is null then
    return jsonb_build_object('success', false, 'error', 'tutorial_not_found');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tr.id,
        'sortOrder', tr.sort_order,
        'raceName', tr.race_name,
        'startsAfterMinutes', tr.starts_after_minutes,
        'runners', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', thr.api_horse_id,
              'name', thr.horse_name,
              'number', thr.number,
              'jockey', thr.jockey,
              'oddsDecimal', thr.odds_decimal,
              'isFav', thr.is_fav,
              'position', thr.result_position,
              'resultCode', thr.result_code
            )
            order by thr.number nulls last, thr.horse_name
          )
          from public.tutorial_runners thr
          where thr.race_id = tr.id
        ), '[]'::jsonb)
      )
      order by tr.sort_order asc
    ),
    '[]'::jsonb
  )
  into v_races
  from public.tutorial_races tr
  where tr.meeting_id = v_meeting_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', tbu.id,
        'displayName', tbu.display_name,
        'avatarColor', tbu.avatar_color
      )
      order by tbu.display_name asc
    ),
    '[]'::jsonb
  )
  into v_bots
  from public.tutorial_bot_users tbu
  where tbu.meeting_id = v_meeting_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'botUserId', tbs.bot_user_id,
        'raceId', tbs.race_id,
        'runnerId', tbs.runner_horse_id,
        'runnerName', tbs.runner_name,
        'oddsDecimal', tbs.odds_decimal
      )
      order by tbs.bot_user_id, tbs.race_id
    ),
    '[]'::jsonb
  )
  into v_bot_selections
  from public.tutorial_bot_selections tbs
  where tbs.meeting_id = v_meeting_id;

  return jsonb_build_object(
    'success', true,
    'meeting', jsonb_build_object(
      'id', v_meeting_id,
      'slug', v_slug,
      'title', v_title,
      'subtitle', v_subtitle
    ),
    'races', v_races,
    'bots', v_bots,
    'botSelections', v_bot_selections
  );
end;
$$;
