-- 0016_merge_debts.sql
--
-- Simplify: merge 2+ ACCEPTED, ACTIVE debts that share the same creditor, the
-- same debtor and the same currency into a single debt for the combined amount.
-- Either party (creditor or debtor) can do it; it applies immediately and the
-- OTHER party gets an informational push naming how many debts were merged.
--
-- The oldest debt survives (keeps its id, description and payment history) with
-- amount = sum; the rest become status 'merged' + inactive (out of balances).
--
-- Status + type checks repeat the full final list so this and 0014 are
-- order-independent.

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

create or replace function public.merge_debts(p_debt_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_n int := coalesce(array_length(p_debt_ids, 1), 0);
  v_creditor uuid;
  v_debtor uuid;
  v_currency text;
  v_group uuid;
  v_total bigint;
  v_survivor uuid;
  v_group_name text;
  v_actor_name text;
  v_other uuid;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_n < 2 then raise exception 'Selecciona al menos dos deudas para fusionar'; end if;

  -- Lock the rows for the duration of the merge.
  perform 1 from debts where id = any(p_debt_ids) for update;

  if (select count(*) from debts where id = any(p_debt_ids)) <> v_n then
    raise exception 'Alguna deuda no existe';
  end if;

  -- All debts must share creditor, debtor, currency and group.
  if (select count(distinct creditor_id) from debts where id = any(p_debt_ids)) <> 1
     or (select count(distinct debtor_id) from debts where id = any(p_debt_ids)) <> 1
     or (select count(distinct currency) from debts where id = any(p_debt_ids)) <> 1
     or (select count(distinct group_id) from debts where id = any(p_debt_ids)) <> 1 then
    raise exception 'Las deudas deben tener la misma persona y moneda';
  end if;

  select creditor_id, debtor_id, currency, group_id
    into v_creditor, v_debtor, v_currency, v_group
  from debts where id = any(p_debt_ids) limit 1;

  if v_me <> v_creditor and v_me <> v_debtor then
    raise exception 'Solo el acreedor o el deudor pueden fusionar estas deudas';
  end if;

  if (select count(*) from debts where id = any(p_debt_ids) and (status <> 'accepted' or not is_active)) > 0 then
    raise exception 'Todas las deudas deben estar aceptadas y activas';
  end if;

  if (select count(*) from debt_payments where debt_id = any(p_debt_ids) and status = 'pending') > 0 then
    raise exception 'Resuelve los abonos pendientes antes de fusionar';
  end if;

  select sum(amount) into v_total from debts where id = any(p_debt_ids);

  -- Oldest debt survives, holding the combined amount.
  select id into v_survivor from debts where id = any(p_debt_ids) order by created_at asc limit 1;

  update debts set amount = v_total::int where id = v_survivor;
  update debts set status = 'merged', is_active = false
   where id = any(p_debt_ids) and id <> v_survivor;

  insert into debt_transactions (debt_id, type, amount, metadata)
  values (v_survivor, 'merge', v_total::int, jsonb_build_object('by', v_me, 'merged', to_jsonb(p_debt_ids)));

  insert into debt_transactions (debt_id, type, amount, metadata)
  select id, 'merged', amount, jsonb_build_object('into', v_survivor)
  from debts where id = any(p_debt_ids) and id <> v_survivor;

  -- Inform the other party.
  v_other := case when v_me = v_creditor then v_debtor else v_creditor end;
  select name into v_group_name from groups where id = v_group;
  select name into v_actor_name from profiles where id = v_me;
  perform public.queue_push(
    v_other,
    'Deudas fusionadas',
    coalesce(v_actor_name, 'Alguien') || ' fusionó ' || v_n || ' deudas en una de '
      || public.fmt_amount(v_total::int, v_currency) || ' en "' || coalesce(v_group_name, 'un grupo') || '"'
  );

  return v_survivor;
end;
$$;
grant execute on function public.merge_debts(uuid[]) to authenticated;
