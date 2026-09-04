-- Fundraiser branding for competitions created by Gamemaster accounts.
-- Returns club logo + club name so clients can show "Fundraiser for {Club}".

create or replace function public.fundraiser_branding_for_creator(p_creator_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_club text;
  v_logo text;
begin
  if p_creator_id is null then
    return null;
  end if;

  if public.subscription_effective_creator_tier(p_creator_id) is distinct from 'gamemaster' then
    return null;
  end if;

  select nullif(trim(club_name), ''), nullif(trim(club_logo_url), '')
  into v_club, v_logo
  from public.profiles
  where id = p_creator_id;

  if v_club is null then
    return null;
  end if;

  return jsonb_build_object(
    'club_name', v_club,
    'club_logo_url', v_logo
  );
end;
$$;

revoke all on function public.fundraiser_branding_for_creator(uuid) from public;
grant execute on function public.fundraiser_branding_for_creator(uuid) to authenticated;

comment on function public.fundraiser_branding_for_creator(uuid) is
  'Club fundraiser branding when the creator is a Gamemaster; otherwise null.';

-- Batch lookup by sport + competition id (lms | f2t | racing).
create or replace function public.get_competitions_fundraiser_branding(p_items jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_sport text;
  v_comp_id uuid;
  v_creator uuid;
  v_brand jsonb;
  v_out jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    return '[]'::jsonb;
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return '[]'::jsonb;
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_sport := lower(trim(coalesce(v_item->>'sport', '')));
    begin
      v_comp_id := nullif(trim(coalesce(v_item->>'competition_id', '')), '')::uuid;
    exception when others then
      v_comp_id := null;
    end;

    if v_comp_id is null or v_sport not in ('lms', 'f2t', 'racing') then
      continue;
    end if;

    v_creator := null;
    if v_sport = 'lms' then
      select c.created_by_user_id into v_creator
      from public.lms_competitions c
      where c.id = v_comp_id;
    elsif v_sport = 'f2t' then
      select c.created_by_user_id into v_creator
      from public.f2t_competitions c
      where c.id = v_comp_id;
    else
      select c.created_by_user_id into v_creator
      from public.competitions c
      where c.id = v_comp_id;
    end if;

    v_brand := public.fundraiser_branding_for_creator(v_creator);
    if v_brand is null then
      continue;
    end if;

    v_out := v_out || jsonb_build_array(
      jsonb_build_object(
        'sport', v_sport,
        'competition_id', v_comp_id,
        'club_name', v_brand->>'club_name',
        'club_logo_url', v_brand->>'club_logo_url'
      )
    );
  end loop;

  return v_out;
end;
$$;

revoke all on function public.get_competitions_fundraiser_branding(jsonb) from public;
grant execute on function public.get_competitions_fundraiser_branding(jsonb) to authenticated;

comment on function public.get_competitions_fundraiser_branding(jsonb) is
  'Batch fundraiser branding for Gamemaster-created competitions (lms/f2t/racing).';
