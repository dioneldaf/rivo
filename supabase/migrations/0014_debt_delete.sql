-- 0014_debt_delete.sql
--
-- Deleting debts (debts are hard-deleted — removed from the group):
--   * pending debt        -> its creator cancels it directly.
--   * accepted, creditor  -> creditor deletes directly (forgives the debt).
--   * accepted, debtor    -> debtor REQUESTS deletion (status 'delete_requested');
--                            the creditor then confirms (delete) or rejects.
--
-- The status + transaction-type checks below use the full final list so this
-- migration and 0016 (merge) can be applied in any order without clobbering.

------------------------------------------------------------------------------
-- 1) Status + transaction-type constraints (full cumulative lists)
------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where rel.relname = 'debts' and ns.nspname = 'public'
      and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%status%'
  loop execute format('alter table public.debts drop constraint %I', r.conname); end loop;
end $$;

alter table public.debts add constraint debts_status_check
  check (status in ('pending','accepted','rejected','settled','settle_requested',
                    'transfer_pending','delete_requested','merged'));

do $$
declare r record;
begin
  for r in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where rel.relname = 'debt_transactions' and ns.nspname = 'public'
      and con.contype = 'c' and pg_get_constraintdef(con.oid) ilike '%type%'
  loop execute format('alter table public.debt_transactions drop constraint %I', r.conname); end loop;
end $$;

alter table public.debt_transactions add constraint debt_transactions_type_check
  check (type in ('create','accept','reject','settle','transfer',
                  'settle_requested','confirm_settlement','reject_settlement',
                  'transfer_accepted','transfer_rejected',
                  'payment','payment_requested','confirm_payment','reject_payment',
                  'delete_requested','reject_delete','merge','merged'));

------------------------------------------------------------------------------
-- 2) RPCs (debt_transactions cascade on debt delete, so no manual cleanup)
------------------------------------------------------------------------------
create or replace function public.delete_debt(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_debt debts%rowtype;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  select * into v_debt from debts where id = p_debt_id for update;
  if not found then raise exception 'Debt not found'; end if;

  -- Pending: the creator cancels it.
  if v_debt.status = 'pending' then
    if v_me <> v_debt.created_by then raise exception 'Only the creator can cancel a pending debt'; end if;
    delete from debts where id = p_debt_id;
    return;
  end if;

  -- Accepted (active): creditor deletes directly; debtor must request.
  if v_debt.is_active and v_debt.status in ('accepted', 'delete_requested') then
    if v_me = v_debt.creditor_id then
      delete from debts where id = p_debt_id;
      return;
    elsif v_me = v_debt.debtor_id then
      if v_debt.status = 'delete_requested' then raise exception 'Deletion already awaiting confirmation'; end if;
      update debts set status = 'delete_requested' where id = p_debt_id;
      insert into debt_transactions (debt_id, type, amount, metadata)
      values (p_debt_id, 'delete_requested', v_debt.amount, jsonb_build_object('by', v_me));
      return;
    end if;
  end if;

  raise exception 'This debt cannot be deleted in its current state';
end;
$$;
grant execute on function public.delete_debt(uuid) to authenticated;

-- Creditor confirms a debtor's deletion request -> remove the debt.
create or replace function public.confirm_delete_debt(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_debt debts%rowtype;
begin
  select * into v_debt from debts where id = p_debt_id and status = 'delete_requested' for update;
  if not found then raise exception 'No deletion awaiting confirmation'; end if;
  if auth.uid() <> v_debt.creditor_id then raise exception 'Only the creditor can confirm the deletion'; end if;
  delete from debts where id = p_debt_id;
end;
$$;
grant execute on function public.confirm_delete_debt(uuid) to authenticated;

-- Creditor rejects a deletion request -> debt goes back to accepted.
create or replace function public.reject_delete_debt(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_debt debts%rowtype;
begin
  select * into v_debt from debts where id = p_debt_id and status = 'delete_requested' for update;
  if not found then raise exception 'No deletion awaiting confirmation'; end if;
  if auth.uid() <> v_debt.creditor_id then raise exception 'Only the creditor can reject the deletion'; end if;
  update debts set status = 'accepted' where id = p_debt_id;
  insert into debt_transactions (debt_id, type, amount, metadata)
  values (p_debt_id, 'reject_delete', v_debt.amount, jsonb_build_object('by', auth.uid()));
end;
$$;
grant execute on function public.reject_delete_debt(uuid) to authenticated;

------------------------------------------------------------------------------
-- 3) Push: notify the creditor when the debtor requests a deletion. Recreate
--    notify_debt_update to cover both settle_requested and delete_requested.
------------------------------------------------------------------------------
create or replace function public.notify_debt_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group text;
  v_from text;
  v_amt text;
begin
  if new.status = 'settle_requested' and old.status is distinct from 'settle_requested' then
    select name into v_group from groups where id = new.group_id;
    select name into v_from from profiles where id = new.debtor_id;
    v_amt := public.fmt_amount(new.amount, new.currency);
    perform public.queue_push(
      new.creditor_id,
      'Pago por confirmar',
      coalesce(v_from, 'Alguien') || ' marcó como pagada ' || v_amt || ' en "' || coalesce(v_group, 'un grupo') || '"'
    );
  elsif new.status = 'delete_requested' and old.status is distinct from 'delete_requested' then
    select name into v_group from groups where id = new.group_id;
    select name into v_from from profiles where id = new.debtor_id;
    v_amt := public.fmt_amount(new.amount, new.currency);
    perform public.queue_push(
      new.creditor_id,
      'Eliminación por confirmar',
      coalesce(v_from, 'Alguien') || ' quiere eliminar la deuda de ' || v_amt || ' en "' || coalesce(v_group, 'un grupo') || '"'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_debt_update_notify on public.debts;
create trigger on_debt_update_notify
  after update on public.debts
  for each row execute procedure public.notify_debt_update();
