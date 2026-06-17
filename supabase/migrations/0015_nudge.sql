-- 0015_nudge.sql
--
-- "Timbre": the creditor sends the debtor a push reminder. The text comes from
-- phrases the creditor defines in their profile (up to 5). Anti-spam: at most
-- one nudge per debt every 2 minutes. No permanent in-app notification.

-- Up to 5 reminder phrases per profile. Per-phrase length is enforced client-side
-- and in the RPC; here we just cap the count.
alter table public.profiles add column if not exists nudge_phrases text[] not null default '{}'::text[];
alter table public.profiles drop constraint if exists profiles_nudge_phrases_len;
alter table public.profiles add constraint profiles_nudge_phrases_len
  check (array_length(nudge_phrases, 1) is null or array_length(nudge_phrases, 1) <= 5);

-- One row per nudge sent, used purely for the anti-spam cooldown.
create table if not exists public.debt_nudges (
  id uuid primary key default gen_random_uuid(),
  debt_id uuid not null references debts(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists debt_nudges_debt_idx on public.debt_nudges(debt_id, created_at);

-- RLS on with no policies: only the security-definer RPC below writes here.
alter table public.debt_nudges enable row level security;

create or replace function public.nudge_debtor(p_debt_id uuid, p_message text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_debt debts%rowtype;
  v_msg text := nullif(trim(coalesce(p_message, '')), '');
  v_from text;
  v_recent timestamptz;
begin
  if v_me is null then raise exception 'Not authenticated'; end if;
  if v_msg is null then raise exception 'El mensaje no puede estar vacío'; end if;
  if char_length(v_msg) > 120 then raise exception 'El mensaje es demasiado largo'; end if;

  select * into v_debt from debts where id = p_debt_id and is_active = true for update;
  if not found then raise exception 'Debt not found or inactive'; end if;
  if v_debt.status <> 'accepted' then raise exception 'Solo se puede recordar deudas aceptadas'; end if;
  if v_me <> v_debt.creditor_id then raise exception 'Solo el acreedor puede tocar el timbre'; end if;

  select max(created_at) into v_recent
  from debt_nudges where debt_id = p_debt_id and sender_id = v_me;
  if v_recent is not null and v_recent > now() - interval '2 minutes' then
    raise exception 'Espera un momento antes de volver a tocar el timbre';
  end if;

  insert into debt_nudges (debt_id, sender_id) values (p_debt_id, v_me);

  select name into v_from from profiles where id = v_me;
  perform public.queue_push(
    v_debt.debtor_id,
    coalesce(v_from, 'Alguien') || ' te dio un toque 🔔',
    v_msg
  );
end;
$$;
grant execute on function public.nudge_debtor(uuid, text) to authenticated;
