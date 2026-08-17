-- Informational entry fee for LMS competitions. The app never takes payment;
-- organisers collect any money themselves.

alter table public.lms_competitions
  add column if not exists entry text;

comment on column public.lms_competitions.entry is
  'Optional display-only entry fee (e.g. £10). Not processed by the app.';

create or replace function public.lms_set_competition_entry(
  p_competition_id uuid,
  p_entry text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry text;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if not public.lms_can_manage_competition(p_competition_id) then
    return jsonb_build_object('success', false, 'error', 'unauthorized');
  end if;

  if not exists (
    select 1 from public.lms_competitions c where c.id = p_competition_id
  ) then
    return jsonb_build_object('success', false, 'error', 'invalid_competition');
  end if;

  v_entry := nullif(trim(coalesce(p_entry, '')), '');

  update public.lms_competitions
  set entry = v_entry,
      updated_at = now()
  where id = p_competition_id;

  return jsonb_build_object('success', true, 'entry', v_entry);
end;
$$;

revoke all on function public.lms_set_competition_entry(uuid, text) from public;
grant execute on function public.lms_set_competition_entry(uuid, text) to authenticated;
