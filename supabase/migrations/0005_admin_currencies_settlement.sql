-- Rivo: group administration, per-group currencies, stricter debt rules and a
-- two-step settlement flow. Safe to re-run (idempotent).

------------------------------------------------------------------------------
-- 1) Member roles (admin / member)
------------------------------------------------------------------------------
alter table group_members add column if not exists role text not null default 'member';

-- Existing group creators become admins.
update group_members gm
set role = 'admin'
from groups g
where g.id = gm.group_id and g.created_by = gm.user_id and gm.role <> 'admin';

alter table group_members drop constraint if exists group_members_role_check;
alter table group_members add constraint group_members_role_check check (role in ('admin', 'member'));

-- The creator of a group is its first admin.
create or replace function public.handle_group_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'admin')
  on conflict (group_id, user_id) do update set role = 'admin';
  return new;
end;
$$;

create or replace function public.is_group_admin(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from group_members
    where group_id = p_group_id and user_id = p_user_id and role = 'admin'
  );
$$;
grant execute on function public.is_group_admin(uuid, uuid) to authenticated;

------------------------------------------------------------------------------
-- 2) Per-group valid currencies. None are predefined: a group starts with an
--    empty list and its admin creates the currencies it accepts.
------------------------------------------------------------------------------
alter table groups add column if not exists currencies text[] not null default '{}'::text[];
alter table groups alter column currencies set default '{}'::text[];

------------------------------------------------------------------------------
-- 3) New debt status (settle_requested) and richer transaction types
------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where rel.relname = 'debts' and ns.nspname = 'public'
      and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.debts drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.debts add constraint debts_status_check
  check (status in ('pending', 'accepted', 'rejected', 'settled', 'settle_requested', 'transfer_pending'));

-- Allow amount = 0: a debt fully consumed by a transfer is reduced to 0 and
-- marked settled. Creation paths still require amount > 0 (enforced in
-- create_debt), so empty debts can't be created.
do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where rel.relname = 'debts' and ns.nspname = 'public'
      and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%amount%'
  loop
    execute format('alter table public.debts drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.debts add constraint debts_amount_check check (amount >= 0);

do $$
declare r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where rel.relname = 'debt_transactions' and ns.nspname = 'public'
      and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%type%'
  loop
    execute format('alter table public.debt_transactions drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.debt_transactions add constraint debt_transactions_type_check
  check (type in ('create', 'accept', 'reject', 'settle', 'transfer',
                  'settle_requested', 'confirm_settlement', 'reject_settlement',
                  'transfer_accepted', 'transfer_rejected'));

------------------------------------------------------------------------------
-- 4) Debt creation. The creator must be one of the two parties (never a
--    third-party debt, not even by an admin):
--      * "someone owes me" (creator = creditor)  -> pending, debtor must accept.
--      * "I owe someone"   (creator = debtor)     -> accepted immediately, no
--        verification needed (you are admitting your own debt).
------------------------------------------------------------------------------
drop function if exists public.create_debt(uuid, uuid, integer, text);

create or replace function public.create_debt(
  p_group_id uuid,
  p_counterparty_id uuid,
  p_amount integer,
  p_currency text,
  p_i_am_debtor boolean default false
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
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;
  if p_counterparty_id = v_me then raise exception 'You cannot create a debt with yourself'; end if;
  if not is_group_member(p_group_id, v_me) then raise exception 'You are not a member of this group'; end if;
  if not is_group_member(p_group_id, p_counterparty_id) then raise exception 'The other person is not a member of this group'; end if;
  if not exists (select 1 from groups g where g.id = p_group_id and v_currency = any(g.currencies)) then
    raise exception 'Currency % is not enabled for this group', v_currency;
  end if;

  if p_i_am_debtor then
    v_debtor := v_me;
    v_creditor := p_counterparty_id;
    v_status := 'accepted';
  else
    v_creditor := v_me;
    v_debtor := p_counterparty_id;
    v_status := 'pending';
  end if;

  insert into debts (group_id, creditor_id, debtor_id, amount, currency, status, created_by, is_active)
  values (p_group_id, v_creditor, v_debtor, p_amount, v_currency, v_status, v_me, true)
  returning id into v_id;

  if v_status = 'accepted' then
    insert into debt_transactions (debt_id, type, amount, metadata)
    values (v_id, 'accept', p_amount, jsonb_build_object('by', v_me, 'auto', true));
  end if;

  return v_id;
end;
$$;
grant execute on function public.create_debt(uuid, uuid, integer, text, boolean) to authenticated;

-- Defense-in-depth: a debt can only be inserted by one of its two parties,
-- never on behalf of third parties.
drop policy if exists debts_insert_creator on debts;
create policy debts_insert_creator on debts
  for insert
  with check (
    auth.uid() = created_by
    and (auth.uid() = creditor_id or auth.uid() = debtor_id)
    and public.is_group_member(group_id, auth.uid())
  );

------------------------------------------------------------------------------
-- 5) Two-step settlement.
--    Creditor marks paid  -> settled immediately.
--    Debtor marks paid    -> settle_requested (creditor must confirm).
------------------------------------------------------------------------------
create or replace function public.settle_debt(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_debt debts%rowtype;
begin
  select * into v_debt from debts where id = p_debt_id and is_active = true for update;
  if not found then raise exception 'Debt not found or inactive'; end if;
  if v_debt.status not in ('accepted', 'settle_requested') then
    raise exception 'Only accepted debts can be settled';
  end if;

  if auth.uid() = v_debt.creditor_id then
    update debts set status = 'settled', is_active = false where id = p_debt_id;
    insert into debt_transactions (debt_id, type, amount, metadata)
    values (p_debt_id, 'settle', v_debt.amount, jsonb_build_object('by', auth.uid(), 'role', 'creditor'));
  elsif auth.uid() = v_debt.debtor_id then
    if v_debt.status = 'settle_requested' then raise exception 'Settlement already awaiting confirmation'; end if;
    update debts set status = 'settle_requested' where id = p_debt_id;
    insert into debt_transactions (debt_id, type, amount, metadata)
    values (p_debt_id, 'settle_requested', v_debt.amount, jsonb_build_object('by', auth.uid()));
  else
    raise exception 'Only the debtor or creditor can settle this debt';
  end if;
end;
$$;

create or replace function public.confirm_settlement(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_debt debts%rowtype;
begin
  select * into v_debt from debts where id = p_debt_id and status = 'settle_requested' and is_active = true for update;
  if not found then raise exception 'No settlement awaiting confirmation'; end if;
  if auth.uid() <> v_debt.creditor_id then raise exception 'Only the creditor can confirm the payment'; end if;

  update debts set status = 'settled', is_active = false where id = p_debt_id;
  insert into debt_transactions (debt_id, type, amount, metadata)
  values (p_debt_id, 'confirm_settlement', v_debt.amount, jsonb_build_object('by', auth.uid()));
end;
$$;
grant execute on function public.confirm_settlement(uuid) to authenticated;

create or replace function public.reject_settlement(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_debt debts%rowtype;
begin
  select * into v_debt from debts where id = p_debt_id and status = 'settle_requested' and is_active = true for update;
  if not found then raise exception 'No settlement awaiting confirmation'; end if;
  if auth.uid() <> v_debt.creditor_id then raise exception 'Only the creditor can reject the payment'; end if;

  update debts set status = 'accepted' where id = p_debt_id;
  insert into debt_transactions (debt_id, type, amount, metadata)
  values (p_debt_id, 'reject_settlement', v_debt.amount, jsonb_build_object('by', auth.uid()));
end;
$$;
grant execute on function public.reject_settlement(uuid) to authenticated;

------------------------------------------------------------------------------
-- 6) Group administration (admins only). All run as SECURITY DEFINER and
--    enforce the admin check themselves.
------------------------------------------------------------------------------
create or replace function public.rename_group(p_group_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_group_admin(p_group_id, auth.uid()) then raise exception 'Only admins can rename the group'; end if;
  if trim(coalesce(p_name, '')) = '' then raise exception 'Name is required'; end if;
  update groups set name = trim(p_name) where id = p_group_id;
end;
$$;
grant execute on function public.rename_group(uuid, text) to authenticated;

create or replace function public.set_group_currencies(p_group_id uuid, p_currencies text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_norm text[];
begin
  if not is_group_admin(p_group_id, auth.uid()) then raise exception 'Only admins can manage currencies'; end if;
  select array_agg(distinct upper(trim(c))) into v_norm
  from unnest(p_currencies) c where trim(coalesce(c, '')) <> '';
  if v_norm is null or array_length(v_norm, 1) = 0 then raise exception 'At least one currency is required'; end if;
  update groups set currencies = v_norm where id = p_group_id;
end;
$$;
grant execute on function public.set_group_currencies(uuid, text[]) to authenticated;

create or replace function public.set_member_role(p_group_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_group_admin(p_group_id, auth.uid()) then raise exception 'Only admins can change roles'; end if;
  if p_role not in ('admin', 'member') then raise exception 'Invalid role'; end if;
  if p_role = 'member'
     and (select count(*) from group_members where group_id = p_group_id and role = 'admin') <= 1
     and exists (select 1 from group_members where group_id = p_group_id and user_id = p_user_id and role = 'admin') then
    raise exception 'Cannot demote the last admin';
  end if;
  update group_members set role = p_role where group_id = p_group_id and user_id = p_user_id;
end;
$$;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

create or replace function public.remove_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_group_admin(p_group_id, auth.uid()) then raise exception 'Only admins can remove members'; end if;
  if exists (
    select 1 from debts
    where group_id = p_group_id and is_active = true
      and (creditor_id = p_user_id or debtor_id = p_user_id)
  ) then
    raise exception 'This member still has active debts. Settle them first.';
  end if;
  if (select count(*) from group_members where group_id = p_group_id) <= 1 then
    raise exception 'Cannot remove the last member; delete the group instead';
  end if;
  delete from group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

create or replace function public.leave_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if exists (
    select 1 from debts
    where group_id = p_group_id and is_active = true
      and (creditor_id = v_uid or debtor_id = v_uid)
  ) then
    raise exception 'You still have active debts in this group';
  end if;
  if is_group_admin(p_group_id, v_uid)
     and (select count(*) from group_members where group_id = p_group_id and role = 'admin') <= 1
     and (select count(*) from group_members where group_id = p_group_id) > 1 then
    raise exception 'Promote another admin before leaving';
  end if;
  delete from group_members where group_id = p_group_id and user_id = v_uid;
end;
$$;
grant execute on function public.leave_group(uuid) to authenticated;

create or replace function public.delete_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_group_admin(p_group_id, auth.uid()) then raise exception 'Only admins can delete the group'; end if;
  delete from groups where id = p_group_id;
end;
$$;
grant execute on function public.delete_group(uuid) to authenticated;

------------------------------------------------------------------------------
-- 7) Debt transfer WITH the new creditor's approval.
--    Scenario: B owes A (from) and A owes C (to). The intermediary A proposes
--    that B owes C instead. The new creditor C must accept the change of debtor
--    before anything is moved; only on acceptance are both originals reduced.
--    Both debts must be ACCEPTED, ACTIVE, in the same group and same currency.
------------------------------------------------------------------------------
create or replace function public.transfer_debt(p_from_debt_id uuid, p_to_debt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from debts%rowtype;
  v_to debts%rowtype;
  v_amount integer;
  v_new uuid;
begin
  select * into v_from from debts where id = p_from_debt_id for update;
  if not found then raise exception 'Source debt not found'; end if;
  select * into v_to from debts where id = p_to_debt_id for update;
  if not found then raise exception 'Target debt not found'; end if;

  if v_from.status <> 'accepted' or not v_from.is_active
     or v_to.status <> 'accepted' or not v_to.is_active then
    raise exception 'Both debts must be accepted and active';
  end if;
  if v_from.group_id <> v_to.group_id then raise exception 'Both debts must belong to the same group'; end if;
  if v_from.currency <> v_to.currency then raise exception 'Both debts must use the same currency'; end if;

  -- The runner is the intermediary: they are owed (creditor of from) and they
  -- owe (debtor of to).
  if auth.uid() <> v_from.creditor_id or auth.uid() <> v_to.debtor_id then
    raise exception 'Only the intermediary (who is owed and also owes) can transfer';
  end if;

  v_amount := least(v_from.amount, v_to.amount);
  if v_amount <= 0 then raise exception 'There is nothing to transfer'; end if;

  -- Propose the new debt B -> C, pending C's approval. Originals stay untouched.
  insert into debts (group_id, creditor_id, debtor_id, amount, currency, status, created_by, is_active, parent_debt_id)
  values (v_from.group_id, v_to.creditor_id, v_from.debtor_id, v_amount, v_from.currency,
          'transfer_pending', auth.uid(), true, v_from.id)
  returning id into v_new;

  insert into debt_transactions (debt_id, type, amount, metadata)
  values (v_new, 'transfer', v_amount,
          jsonb_build_object('by', auth.uid(), 'from_debt', v_from.id, 'to_debt', v_to.id, 'state', 'proposed'));

  return v_new;
end;
$$;
grant execute on function public.transfer_debt(uuid, uuid) to authenticated;

create or replace function public.accept_transfer(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new debts%rowtype;
  v_from_id uuid;
  v_to_id uuid;
  v_from debts%rowtype;
  v_to debts%rowtype;
  v_amount integer;
begin
  select * into v_new from debts where id = p_debt_id and status = 'transfer_pending' and is_active = true for update;
  if not found then raise exception 'No transfer awaiting approval'; end if;
  if auth.uid() <> v_new.creditor_id then raise exception 'Only the new creditor can accept the transfer'; end if;

  select (metadata->>'from_debt')::uuid, (metadata->>'to_debt')::uuid
    into v_from_id, v_to_id
  from debt_transactions
  where debt_id = p_debt_id and type = 'transfer' and metadata->>'state' = 'proposed'
  order by created_at desc
  limit 1;

  if v_from_id is null or v_to_id is null then raise exception 'Transfer link is missing'; end if;

  select * into v_from from debts where id = v_from_id for update;
  select * into v_to from debts where id = v_to_id for update;

  -- If an original changed since the proposal, the transfer is stale: cancel it.
  if v_from.id is null or v_to.id is null
     or v_from.status <> 'accepted' or not v_from.is_active
     or v_to.status <> 'accepted' or not v_to.is_active then
    update debts set status = 'rejected', is_active = false where id = p_debt_id;
    raise exception 'The original debts changed; the transfer was cancelled';
  end if;

  v_amount := least(v_from.amount, v_to.amount, v_new.amount);
  if v_amount <= 0 then
    update debts set status = 'rejected', is_active = false where id = p_debt_id;
    raise exception 'There is nothing left to transfer; the transfer was cancelled';
  end if;

  update debts set amount = v_amount, status = 'accepted' where id = p_debt_id;

  update debts
  set amount = amount - v_amount,
      status = case when amount - v_amount = 0 then 'settled' else status end,
      is_active = case when amount - v_amount = 0 then false else true end
  where id = v_from_id;

  update debts
  set amount = amount - v_amount,
      status = case when amount - v_amount = 0 then 'settled' else status end,
      is_active = case when amount - v_amount = 0 then false else true end
  where id = v_to_id;

  insert into debt_transactions (debt_id, type, amount, metadata)
  values
    (p_debt_id, 'transfer_accepted', v_amount, jsonb_build_object('by', auth.uid())),
    (v_from_id, 'transfer', v_amount, jsonb_build_object('to_debt', p_debt_id)),
    (v_to_id, 'transfer', v_amount, jsonb_build_object('to_debt', p_debt_id));
end;
$$;
grant execute on function public.accept_transfer(uuid) to authenticated;

create or replace function public.reject_transfer(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_new debts%rowtype;
begin
  select * into v_new from debts where id = p_debt_id and status = 'transfer_pending' and is_active = true for update;
  if not found then raise exception 'No transfer awaiting approval'; end if;
  if auth.uid() <> v_new.creditor_id then raise exception 'Only the new creditor can reject the transfer'; end if;

  update debts set status = 'rejected', is_active = false where id = p_debt_id;
  insert into debt_transactions (debt_id, type, amount, metadata)
  values (p_debt_id, 'transfer_rejected', v_new.amount, jsonb_build_object('by', auth.uid()));
end;
$$;
grant execute on function public.reject_transfer(uuid) to authenticated;
