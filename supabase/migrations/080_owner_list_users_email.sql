-- Owner console: include auth email for each account in owner_list_users.

create or replace function public.owner_list_users()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_owner() then
    return '[]'::jsonb;
  end if;

  return (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'username', p.username,
          'email', u.email,
          'role', p.role,
          'created_at', p.created_at,
          'updated_at', p.updated_at,
          'banned_at', p.banned_at,
          'banned_by', p.banned_by
        )
        order by
          case when p.banned_at is not null then 0 else 1 end,
          case p.role when 'Owner' then 0 when 'Admin' then 1 else 2 end,
          coalesce(p.username, ''),
          p.created_at desc
      ),
      '[]'::jsonb
    )
    from public.profiles p
    left join auth.users u on u.id = p.id
  );
end;
$$;
