-- Club logos in Supabase Storage + Owner Gamemaster registration.

alter table public.profiles
  add column if not exists kiosk_licenses_count int not null default 0;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'club-logos',
  'club-logos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "club_logos_public_read" on storage.objects;
create policy "club_logos_public_read"
  on storage.objects for select
  using (bucket_id = 'club-logos');

drop policy if exists "club_logos_insert_own" on storage.objects;
create policy "club_logos_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'club-logos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_owner()
    )
  );

drop policy if exists "club_logos_update_own" on storage.objects;
create policy "club_logos_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'club-logos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_owner()
    )
  )
  with check (
    bucket_id = 'club-logos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_owner()
    )
  );

drop policy if exists "club_logos_delete_own" on storage.objects;
create policy "club_logos_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'club-logos'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_owner()
    )
  );

create or replace function public.owner_register_gamemaster(
  p_user_id uuid,
  p_club_name text,
  p_club_logo_url text default null,
  p_kiosk_licenses int default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_club text := nullif(trim(p_club_name), '');
  v_logo text := nullif(trim(p_club_logo_url), '');
  v_licenses int := greatest(coalesce(p_kiosk_licenses, 1), 0);
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if p_user_id is null then
    return jsonb_build_object('success', false, 'error', 'user_required');
  end if;

  if v_club is null then
    return jsonb_build_object('success', false, 'error', 'club_name_required');
  end if;

  if v_logo is not null and v_logo !~* '^https?://' then
    return jsonb_build_object('success', false, 'error', 'invalid_logo_url');
  end if;

  select role into v_role from public.profiles where id = p_user_id;
  if not found then
    return jsonb_build_object('success', false, 'error', 'user_not_found');
  end if;

  if v_role = 'Owner' then
    return jsonb_build_object('success', false, 'error', 'cannot_convert_owner');
  end if;

  update public.profiles
  set
    lifetime_creator_tier = 'gamemaster',
    club_name = v_club,
    club_logo_url = v_logo,
    kiosk_licenses_count = greatest(coalesce(kiosk_licenses_count, 0), v_licenses),
    updated_at = now()
  where id = p_user_id;

  return jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'club_name', v_club,
    'club_logo_url', v_logo,
    'creator_tier', 'gamemaster'
  );
end;
$$;

revoke all on function public.owner_register_gamemaster(uuid, text, text, int) from public;
grant execute on function public.owner_register_gamemaster(uuid, text, text, int) to authenticated;

comment on function public.owner_register_gamemaster(uuid, text, text, int) is
  'Owner-only: promote a user to Gamemaster with club branding + kiosk licenses.';
