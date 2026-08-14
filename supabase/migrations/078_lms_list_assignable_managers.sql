-- List competition players for the manager-assign UI.
-- Security definer so Owners/creators see everyone even if they are not a participant.
-- Players who joined before managers existed are included (they live in lms_participants).

create or replace function public.lms_list_assignable_managers(p_competition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_created_by uuid;
begin
  if auth.uid() is null then
    return '[]'::jsonb;
  end if;

  if not public.lms_can_manage_competition(p_competition_id) then
    return '[]'::jsonb;
  end if;

  select c.created_by_user_id into v_created_by
  from public.lms_competitions c
  where c.id = p_competition_id;

  if not found then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'user_id', part.user_id,
          'username', p.username,
          'status', part.status,
          'is_creator', (v_created_by is not null and part.user_id = v_created_by),
          'is_manager', exists (
            select 1
            from public.lms_competition_managers m
            where m.competition_id = part.competition_id
              and m.user_id = part.user_id
          )
        )
        order by
          (v_created_by is not null and part.user_id = v_created_by) desc,
          p.username nulls last,
          part.joined_at asc
      ),
      '[]'::jsonb
    )
    from public.lms_participants part
    left join public.profiles p on p.id = part.user_id
    where part.competition_id = p_competition_id
  );
end;
$$;

revoke all on function public.lms_list_assignable_managers(uuid) from public;
grant execute on function public.lms_list_assignable_managers(uuid) to authenticated;
