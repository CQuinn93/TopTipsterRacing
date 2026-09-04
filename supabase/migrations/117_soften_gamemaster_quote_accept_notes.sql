-- Soften gamemaster-visible accept note (no owner-process wording).
create or replace function public.gamemaster_respond_to_quote(
  p_quote_id uuid,
  p_action text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator public.creator_tier;
  v_quote public.gamemaster_quotes;
  v_action text := lower(trim(coalesce(p_action, '')));
  v_notes text := nullif(trim(coalesce(p_notes, '')), '');
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  v_creator := public.subscription_effective_creator_tier(v_uid);
  if v_creator is distinct from 'gamemaster' and not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'not_gamemaster');
  end if;

  if v_action not in ('accept', 'request_edit') then
    return jsonb_build_object('success', false, 'error', 'invalid_action');
  end if;

  select * into v_quote
  from public.gamemaster_quotes
  where id = p_quote_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'quote_not_found');
  end if;

  if v_quote.user_id is distinct from v_uid and not public.is_owner() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if v_quote.status is distinct from 'pending_payment' then
    return jsonb_build_object('success', false, 'error', 'quote_not_awaiting_response');
  end if;

  if v_action = 'accept' then
    update public.gamemaster_quotes
    set
      notes = 'Accepted — awaiting payment confirmation.',
      updated_at = now()
    where id = p_quote_id
    returning * into v_quote;
  else
    if v_notes is null then
      return jsonb_build_object('success', false, 'error', 'edit_notes_required');
    end if;

    update public.gamemaster_quotes
    set
      notes = 'Edit requested: ' || v_notes,
      updated_at = now()
    where id = p_quote_id
    returning * into v_quote;
  end if;

  return jsonb_build_object(
    'success', true,
    'action', v_action,
    'quote', public.gamemaster_quote_to_json(v_quote)
  );
end;
$$;

-- Soften any already-accepted notes that mentioned owner approval.
update public.gamemaster_quotes
set notes = 'Accepted — awaiting payment confirmation.'
where notes = 'Accepted by Gamemaster — awaiting payment / owner approval.';
