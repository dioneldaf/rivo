-- 0011_partial_payments.sql
--
-- Partial payments ("abonos"): pay PART of an accepted debt, reducing its
-- outstanding balance. Same two-step rule as full settlement:
--   * Creditor records a payment received -> applied immediately.
--   * Debtor reports a payment made        -> pending; creditor confirms/rejects.
--
-- The debt's `amount` always reflects the CURRENT outstanding balance: confirmed
-- payments shrink it, and reaching 0 settles the debt (status 'settled', inactive).

-- 1) New debt_transactions types for the payment lifecycle (drop+readd the check).
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
                  'transfer_accepted', 'transfer_rejected',
                  'payment', 'payment_requested', 'confirm_payment', 'reject_payment'));

-- 2) debt_payments: one row per partial payment proposal/record.
create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id) on delete cascade,
  amount integer not null check (amount > 0),
  proposed_by uuid not null references profiles(id),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists debt_payments_debt_idx on public.debt_payments(debt_id);

-- At most one pending payment per debt at a time.
create unique index if not exists debt_payments_one_pending
  on public.debt_payments(debt_id) where status = 'pending';

alter table public.debt_payments enable row level security;

-- Participants of the debt can read its payments. Writes go only through the
-- security-definer RPCs below (no direct insert/update/delete policy).
drop policy if exists debt_payments_select on public.debt_payments;
create policy debt_payments_select on public.debt_payments
  for select using (
    exists (
      select 1 from debts d
      where d.id = debt_id and (d.creditor_id = auth.uid() or d.debtor_id = auth.uid())
    )
  );

-- 3) RPCs ------------------------------------------------------------------

-- Creditor -> applied now. Debtor -> pending creditor confirmation.
create or replace function public.record_partial_payment(p_debt_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_debt debts;
  v_new integer;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  select * into v_debt from debts where id = p_debt_id and is_active = true for update;
  if not found then raise exception 'Debt not found or inactive'; end if;
  if v_debt.status <> 'accepted' then raise exception 'Only accepted debts can receive payments'; end if;
  if v_me <> v_debt.creditor_id and v_me <> v_debt.debtor_id then
    raise exception 'Only the debtor or creditor can register a payment';
  end if;
  if p_amount > v_debt.amount then raise exception 'Payment exceeds the outstanding amount'; end if;

  if v_me = v_debt.creditor_id then
    insert into debt_payments (debt_id, amount, proposed_by, status, responded_at)
    values (p_debt_id, p_amount, v_me, 'confirmed', now());

    v_new := v_debt.amount - p_amount;
    if v_new = 0 then
      update debts set amount = 0, status = 'settled', is_active = false where id = p_debt_id;
    else
      update debts set amount = v_new where id = p_debt_id;
    end if;

    insert into debt_transactions (debt_id, type, amount, metadata)
    values (p_debt_id, 'payment', p_amount, jsonb_build_object('by', v_me, 'role', 'creditor'));
  else
    if exists (select 1 from debt_payments where debt_id = p_debt_id and status = 'pending') then
      raise exception 'There is already a payment awaiting confirmation';
    end if;
    insert into debt_payments (debt_id, amount, proposed_by, status)
    values (p_debt_id, p_amount, v_me, 'pending');

    insert into debt_transactions (debt_id, type, amount, metadata)
    values (p_debt_id, 'payment_requested', p_amount, jsonb_build_object('by', v_me));
  end if;
end;
$$;
grant execute on function public.record_partial_payment(uuid, integer) to authenticated;

-- Creditor confirms a pending payment -> apply it.
create or replace function public.confirm_partial_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay debt_payments;
  v_debt debts;
  v_applied integer;
  v_new integer;
begin
  select * into v_pay from debt_payments where id = p_payment_id and status = 'pending' for update;
  if not found then raise exception 'No payment awaiting confirmation'; end if;

  select * into v_debt from debts where id = v_pay.debt_id and is_active = true for update;
  if not found then raise exception 'Debt not found or inactive'; end if;
  if auth.uid() <> v_debt.creditor_id then raise exception 'Only the creditor can confirm the payment'; end if;

  v_applied := least(v_pay.amount, v_debt.amount);
  v_new := v_debt.amount - v_applied;

  update debt_payments set status = 'confirmed', responded_at = now() where id = p_payment_id;

  if v_new = 0 then
    update debts set amount = 0, status = 'settled', is_active = false where id = v_pay.debt_id;
  else
    update debts set amount = v_new where id = v_pay.debt_id;
  end if;

  insert into debt_transactions (debt_id, type, amount, metadata)
  values (v_pay.debt_id, 'confirm_payment', v_applied, jsonb_build_object('by', auth.uid()));
end;
$$;
grant execute on function public.confirm_partial_payment(uuid) to authenticated;

-- Creditor rejects a pending payment -> discard it (debt unchanged).
create or replace function public.reject_partial_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay debt_payments;
  v_debt debts;
begin
  select * into v_pay from debt_payments where id = p_payment_id and status = 'pending' for update;
  if not found then raise exception 'No payment awaiting confirmation'; end if;

  select * into v_debt from debts where id = v_pay.debt_id for update;
  if auth.uid() <> v_debt.creditor_id then raise exception 'Only the creditor can reject the payment'; end if;

  update debt_payments set status = 'rejected', responded_at = now() where id = p_payment_id;

  insert into debt_transactions (debt_id, type, amount, metadata)
  values (v_pay.debt_id, 'reject_payment', v_pay.amount, jsonb_build_object('by', auth.uid()));
end;
$$;
grant execute on function public.reject_partial_payment(uuid) to authenticated;

-- 4) Push: notify the creditor when a debtor reports a partial payment.
create or replace function public.notify_payment_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_debt debts;
  v_group text;
  v_from text;
  v_amt text;
begin
  if new.status <> 'pending' then return new; end if;
  select * into v_debt from debts where id = new.debt_id;
  if not found then return new; end if;
  select name into v_group from groups where id = v_debt.group_id;
  select name into v_from from profiles where id = v_debt.debtor_id;
  v_amt := public.fmt_amount(new.amount, v_debt.currency);
  perform public.queue_push(
    v_debt.creditor_id,
    'Abono por confirmar',
    coalesce(v_from, 'Alguien') || ' abonó ' || v_amt || ' en "' || coalesce(v_group, 'un grupo') || '"'
  );
  return new;
end;
$$;

drop trigger if exists on_payment_request_notify on public.debt_payments;
create trigger on_payment_request_notify
  after insert on public.debt_payments
  for each row execute procedure public.notify_payment_request();
