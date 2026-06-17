-- 0013_debt_description.sql
--
-- Optional free-text description on debts (max 140 chars). Existing debts keep
-- a NULL description. create_debt gains an optional p_description argument.

alter table public.debts add column if not exists description text;

alter table public.debts drop constraint if exists debts_description_len;
alter table public.debts add constraint debts_description_len
  check (description is null or char_length(description) <= 140);

-- Recreate create_debt with the new optional description parameter.
drop function if exists public.create_debt(uuid, uuid, integer, text, boolean);

create or replace function public.create_debt(
  p_group_id uuid,
  p_counterparty_id uuid,
  p_amount integer,
  p_currency text,
  p_i_am_debtor boolean default false,
  p_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_currency text := upper(trim(p_currency));
  v_creditor uuid;
  v_debtor uuid;
  v_status text;
  v_id uuid;
  v_desc text := nullif(trim(coalesce(p_description, '')), '');
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_counterparty_id = v_me then raise exception 'You cannot create a debt with yourself'; end if;
  if not is_group_member(p_group_id, v_me) then raise exception 'You are not a member of this group'; end if;
  if not is_group_member(p_group_id, p_counterparty_id) then raise exception 'The other person is not a member of this group'; end if;
  if not exists (select 1 from groups g where g.id = p_group_id and v_currency = any(g.currencies)) then
    raise exception 'Currency % is not enabled for this group', v_currency;
  end if;
  if v_desc is not null and char_length(v_desc) > 140 then raise exception 'Description is too long'; end if;

  if p_i_am_debtor then
    v_debtor := v_me;
    v_creditor := p_counterparty_id;
    v_status := 'accepted';
  else
    v_creditor := v_me;
    v_debtor := p_counterparty_id;
    v_status := 'pending';
  end if;

  insert into debts (group_id, creditor_id, debtor_id, amount, currency, status, created_by, is_active, description)
  values (p_group_id, v_creditor, v_debtor, p_amount, v_currency, v_status, v_me, true, v_desc)
  returning id into v_id;

  if v_status = 'accepted' then
    insert into debt_transactions (debt_id, type, amount, metadata)
    values (v_id, 'accept', p_amount, jsonb_build_object('by', v_me, 'auto', true));
  end if;

  return v_id;
end;
$$;
grant execute on function public.create_debt(uuid, uuid, integer, text, boolean, text) to authenticated;
