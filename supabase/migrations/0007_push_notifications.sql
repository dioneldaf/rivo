-- 0007_push_notifications.sql
--
-- Real browser push notifications (Web Push), 100% inside the Supabase stack.
--
--   1. push_subscriptions   -> one row per device/browser the user enabled.
--   2. notification_outbox   -> triggers write (recipient, title, body) here.
--   3. AFTER triggers on the existing tables decide WHO to notify and WITH WHAT
--      text (business logic stays in SQL, like the rest of the app).
--
-- A Database Webhook on notification_outbox INSERT calls the `send-push` Edge
-- Function, which reads push_subscriptions (service role) and delivers the push.

/* --------------------------- 1. push_subscriptions -------------------------- */

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subs_select_own on public.push_subscriptions;
create policy push_subs_select_own on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists push_subs_insert_own on public.push_subscriptions;
create policy push_subs_insert_own on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists push_subs_update_own on public.push_subscriptions;
create policy push_subs_update_own on public.push_subscriptions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists push_subs_delete_own on public.push_subscriptions;
create policy push_subs_delete_own on public.push_subscriptions
  for delete using (auth.uid() = user_id);

/* --------------------------- 2. notification_outbox ------------------------- */

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  url text not null default '/',
  created_at timestamptz not null default now()
);

-- RLS on with no policies: only the service_role (Edge Function) and the
-- security-definer triggers below can read/write it. Clients can't touch it.
alter table public.notification_outbox enable row level security;

create or replace function public.queue_push(
  p_recipient uuid,
  p_title text,
  p_body text,
  p_url text default '/'
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notification_outbox (recipient_id, title, body, url)
  values (p_recipient, p_title, p_body, p_url);
$$;

-- Format an integer amount of cents as a plain "1234.56 USD" string.
create or replace function public.fmt_amount(p_cents integer, p_currency text)
returns text
language sql
immutable
as $$
  select trim(to_char(p_cents / 100.0, 'FM999999999990.00')) || ' ' || p_currency;
$$;

/* ------------------------------ 3. triggers --------------------------------- */

-- New group invitation -> notify the invitee.
create or replace function public.notify_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group text;
  v_from text;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  select name into v_group from groups where id = new.group_id;
  select name into v_from from profiles where id = new.invited_by;
  perform public.queue_push(
    new.invitee_user_id,
    'Nueva invitación',
    coalesce(v_from, 'Alguien') || ' te invitó a "' || coalesce(v_group, 'un grupo') || '"'
  );
  return new;
end;
$$;

drop trigger if exists on_invitation_notify on public.group_invitations;
create trigger on_invitation_notify
  after insert on public.group_invitations
  for each row execute procedure public.notify_invitation();

-- New debt -> notify the debtor (pending) or the new creditor (transfer_pending).
create or replace function public.notify_debt_insert()
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
  select name into v_group from groups where id = new.group_id;
  v_amt := public.fmt_amount(new.amount, new.currency);

  if new.status = 'pending' then
    select name into v_from from profiles where id = new.creditor_id;
    perform public.queue_push(
      new.debtor_id,
      'Nueva deuda por aceptar',
      coalesce(v_from, 'Alguien') || ' registró que le debes ' || v_amt || ' en "' || coalesce(v_group, 'un grupo') || '"'
    );
  elsif new.status = 'transfer_pending' then
    select name into v_from from profiles where id = new.debtor_id;
    perform public.queue_push(
      new.creditor_id,
      'Transferencia por aceptar',
      'Transferencia: ' || coalesce(v_from, 'Alguien') || ' pasaría a deberte ' || v_amt || ' en "' || coalesce(v_group, 'un grupo') || '"'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists on_debt_insert_notify on public.debts;
create trigger on_debt_insert_notify
  after insert on public.debts
  for each row execute procedure public.notify_debt_insert();

-- Debtor marks a debt as paid (status -> settle_requested) -> notify the creditor.
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
  end if;
  return new;
end;
$$;

drop trigger if exists on_debt_update_notify on public.debts;
create trigger on_debt_update_notify
  after update on public.debts
  for each row execute procedure public.notify_debt_update();
