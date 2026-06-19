-- 0016_merge_debts.sql
--
-- Simplify (NETTING): merge a COMPLETE set of ACCEPTED, ACTIVE debts between the
-- SAME PAIR of people and SAME CURRENCY into a single debt — REGARDLESS of
-- direction. We sum the amounts each way and keep only the net difference.
--
--   * Every original debt becomes status 'merged' + inactive (out of balances)
--     and is linked (parent_debt_id) to the surviving net debt, so the UI can
--     show the breakdown (which debts increased / decreased the result).
--   * A brand-new debt is created in the NET direction for |net|. If the net is
--     exactly zero, everything cancels out and NO debt survives.
--   * Either involved party can merge; it applies immediately and the OTHER
--     party gets an informational push.
--
-- Status + type checks repeat the full final list so this and 0014 are
-- order-independent.

------------------------------------------------------------------------------
-- 1) Constraints (full cumulative lists, order-independent with 0014)
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

-- The surviving net debt is referenced by every component (parent_debt_id). If
-- the survivor is ever deleted, NULL the link instead of blocking the delete.
do $$
declare r record;
begin
  for r in
    select con.conname from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where rel.relname = 'debts' and ns.nspname = 'public'
      and con.contype = 'f' and pg_get_constraintdef(con.oid) ilike '%parent_debt_id%'
  loop execute format('alter table public.debts drop constraint %I', r.conname); end loop;
end $$;

alter table public.debts
  add constraint debts_parent_debt_id_fkey
  foreign key (parent_debt_id) references public.debts(id) on delete set null;

------------------------------------------------------------------------------
-- 2) merge_debts: net a full set between one pair + currency, any direction
------------------------------------------------------------------------------
create or replace function public.merge_debts(p_debt_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_n int := coalesce(array_length(p_debt_ids, 1), 0);
  v_group uuid;
  v_currency text;
  v_people uuid[];
  v_pa uuid;
  v_pb uuid;
  v_net bigint;     -- signed: > 0 => pa owes pb ; < 0 => pb owes pa
  v_abs int;
  v_survivor uuid;
  v_cred uuid;
  v_debtor uuid;
  v_other uuid;
  v_group_name text;
  v_actor_name text;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_n < 2 then raise exception 'Selecciona al menos dos deudas para fusionar'; end if;

  -- Lock the rows for the duration of the merge.
  perform 1 from debts where id = any(p_debt_ids) for update;

  if (select count(*) from debts where id = any(p_debt_ids)) <> v_n then
    raise exception 'Alguna deuda no existe';
  end if;

  -- Same group and same currency.
  if (select count(distinct group_id) from debts where id = any(p_debt_ids)) <> 1
     or (select count(distinct currency) from debts where id = any(p_debt_ids)) <> 1 then
    raise exception 'Las deudas deben ser del mismo grupo y la misma moneda';
  end if;

  -- Exactly two distinct people across BOTH roles (the same unordered pair).
  select array_agg(distinct p) into v_people
  from (
    select creditor_id as p from debts where id = any(p_debt_ids)
    union
    select debtor_id   as p from debts where id = any(p_debt_ids)
  ) s;
  if coalesce(array_length(v_people, 1), 0) <> 2 then
    raise exception 'Las deudas deben ser entre las mismas dos personas';
  end if;
  v_pa := v_people[1];
  v_pb := v_people[2];

  -- The caller must be one of the two involved people.
  if v_me <> v_pa and v_me <> v_pb then
    raise exception 'Solo las personas involucradas pueden fusionar estas deudas';
  end if;

  -- Every debt must be accepted and active.
  if (select count(*) from debts
        where id = any(p_debt_ids) and (status <> 'accepted' or not is_active)) > 0 then
    raise exception 'Todas las deudas deben estar aceptadas y activas';
  end if;

  -- No pending partial payments anywhere in the set.
  if (select count(*) from debt_payments
        where debt_id = any(p_debt_ids) and status = 'pending') > 0 then
    raise exception 'Resuelve los abonos pendientes antes de fusionar';
  end if;

  select group_id, currency into v_group, v_currency
  from debts where id = any(p_debt_ids) limit 1;

  -- Net signed amount: positive => pa owes pb.
  select coalesce(sum(case
            when debtor_id = v_pa and creditor_id = v_pb then  amount
            when debtor_id = v_pb and creditor_id = v_pa then -amount
            else 0 end), 0)
    into v_net
  from debts where id = any(p_debt_ids);

  -- Close every original debt.
  update debts set status = 'merged', is_active = false where id = any(p_debt_ids);

  if v_net = 0 then
    -- Everything cancels out: no surviving debt.
    insert into debt_transactions (debt_id, type, amount, metadata)
    select id, 'merged', amount, jsonb_build_object('by', v_me, 'net_zero', true)
    from debts where id = any(p_debt_ids);
    v_survivor := null;
  else
    v_abs := abs(v_net)::int;
    if v_net > 0 then
      v_debtor := v_pa; v_cred := v_pb;
    else
      v_debtor := v_pb; v_cred := v_pa;
    end if;

    -- Create the single net debt (auto-accepted; both parties already agreed to
    -- the components). An 'accepted' insert does not fire any push trigger.
    v_survivor := gen_random_uuid();
    insert into debts (id, group_id, creditor_id, debtor_id, amount, currency,
                       status, created_by, is_active)
    values (v_survivor, v_group, v_cred, v_debtor, v_abs, v_currency,
            'accepted', v_me, true);

    -- Link every component to the survivor so the UI can show the breakdown.
    update debts set parent_debt_id = v_survivor where id = any(p_debt_ids);

    insert into debt_transactions (debt_id, type, amount, metadata)
    values (v_survivor, 'merge', v_abs,
            jsonb_build_object('by', v_me, 'merged', to_jsonb(p_debt_ids)));

    insert into debt_transactions (debt_id, type, amount, metadata)
    select id, 'merged', amount, jsonb_build_object('into', v_survivor)
    from debts where id = any(p_debt_ids);
  end if;

  -- Inform the other party.
  v_other := case when v_me = v_pa then v_pb else v_pa end;
  select name into v_group_name from groups where id = v_group;
  select name into v_actor_name from profiles where id = v_me;
  perform public.queue_push(
    v_other,
    'Deudas fusionadas',
    coalesce(v_actor_name, 'Alguien') || ' fusionó ' || v_n || ' deudas en "'
      || coalesce(v_group_name, 'un grupo') || '"'
      || case when v_net = 0
              then ' (todo quedó saldado)'
              else ': queda ' || public.fmt_amount(v_abs, v_currency) end
  );

  return v_survivor;
end;
$$;
grant execute on function public.merge_debts(uuid[]) to authenticated;
