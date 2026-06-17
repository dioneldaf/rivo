-- Rivo schema initialization

create extension if not exists "pgcrypto";

create table if not exists profiles (
	id uuid primary key references auth.users(id) on delete cascade,
	name text not null,
	username text not null,
	created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_unique on profiles (lower(username));

create table if not exists groups (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	created_by uuid not null references profiles(id),
	created_at timestamptz not null default now()
);

create table if not exists group_members (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references groups(id) on delete cascade,
	user_id uuid not null references profiles(id) on delete cascade,
	created_at timestamptz not null default now(),
	unique (group_id, user_id)
);

create or replace function public.handle_group_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into group_members (group_id, user_id)
	values (new.id, new.created_by)
	on conflict do nothing;
	return new;
end;
$$;

drop trigger if exists on_group_created on groups;
create trigger on_group_created
	after insert on groups
	for each row execute procedure public.handle_group_created();

create table if not exists group_invitations (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references groups(id) on delete cascade,
	invited_by uuid not null references profiles(id) on delete cascade,
	invitee_user_id uuid not null references profiles(id) on delete cascade,
	status text not null default 'pending',
	created_at timestamptz not null default now(),
	responded_at timestamptz,
	check (status in ('pending', 'accepted', 'declined', 'canceled'))
);

create unique index if not exists group_invites_pending_unique
	on group_invitations (group_id, invitee_user_id)
	where status = 'pending';

create table if not exists debts (
	id uuid primary key default gen_random_uuid(),
	group_id uuid not null references groups(id) on delete cascade,
	creditor_id uuid not null references profiles(id),
	debtor_id uuid not null references profiles(id),
	amount integer not null check (amount > 0),
	currency text not null,
	status text not null default 'pending',
	created_by uuid not null references profiles(id),
	is_active boolean not null default true,
	parent_debt_id uuid references debts(id),
	created_at timestamptz not null default now(),
	check (status in ('pending', 'accepted', 'rejected', 'settled')),
	check (creditor_id <> debtor_id)
);

create index if not exists debts_group_id_idx on debts(group_id);
create index if not exists debts_creditor_id_idx on debts(creditor_id);
create index if not exists debts_debtor_id_idx on debts(debtor_id);

create table if not exists debt_transactions (
	id uuid primary key default gen_random_uuid(),
	debt_id uuid not null references debts(id) on delete cascade,
	type text not null,
	amount integer not null,
	metadata jsonb not null default '{}'::jsonb,
	created_at timestamptz not null default now(),
	check (type in ('create', 'accept', 'reject', 'settle', 'transfer'))
);

create or replace function public.log_debt_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into debt_transactions (debt_id, type, amount, metadata)
	values (new.id, 'create', new.amount, jsonb_build_object('by', new.created_by));
	return new;
end;
$$;

drop trigger if exists on_debt_created on debts;
create trigger on_debt_created
	after insert on debts
	for each row execute procedure public.log_debt_created();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
	base_username text;
begin
	base_username := coalesce(
		nullif(trim(new.raw_user_meta_data->>'username'), ''),
		split_part(new.email, '@', 1)
	);

	base_username := lower(regexp_replace(base_username, '[^a-z0-9_]', '_', 'g'));
	base_username := substring(base_username from 1 for 24);

	insert into public.profiles (id, name, username)
	values (
		new.id,
		coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), base_username),
		base_username || '_' || substring(new.id::text from 1 for 6)
	);
	return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
	after insert on auth.users
	for each row execute procedure public.handle_new_user();

-- Membership check as SECURITY DEFINER so policies can ask "is this user a
-- member of this group?" without recursively triggering RLS on group_members
-- (a self-referential policy errors with "infinite recursion detected").
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
	select exists (
		select 1 from group_members
		where group_id = p_group_id and user_id = p_user_id
	);
$$;

grant execute on function public.is_group_member(uuid, uuid) to authenticated;

alter table profiles enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table group_invitations enable row level security;
alter table debts enable row level security;
alter table debt_transactions enable row level security;

-- Profiles: visible to authenticated users for lookup
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
	for select
	using (auth.role() = 'authenticated');

drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
	for update
	using (auth.uid() = id)
	with check (auth.uid() = id);

-- Groups: only members can read; creator can insert
drop policy if exists groups_select_members on groups;
create policy groups_select_members on groups
	for select
	using (public.is_group_member(id, auth.uid()));

drop policy if exists groups_insert_creator on groups;
create policy groups_insert_creator on groups
	for insert
	with check (auth.uid() = created_by);

-- Group members: members can read; inserts on accepted invite or by the creator
drop policy if exists group_members_select on group_members;
create policy group_members_select on group_members
	for select
	using (public.is_group_member(group_id, auth.uid()));

drop policy if exists group_members_insert_self on group_members;
create policy group_members_insert_self on group_members
	for insert
	with check (
		auth.uid() = user_id and exists (
			select 1 from group_invitations gi
			where gi.group_id = group_members.group_id
				and gi.invitee_user_id = auth.uid()
				and gi.status = 'pending'
		)
	);

drop policy if exists group_members_insert_creator on group_members;
create policy group_members_insert_creator on group_members
	for insert
	with check (
		auth.uid() = user_id and exists (
			select 1 from groups g
			where g.id = group_members.group_id and g.created_by = auth.uid()
		)
	);

-- Invitations: inviter, invitee or a group member can read; inviter can create
drop policy if exists group_invites_select on group_invitations;
create policy group_invites_select on group_invitations
	for select
	using (
		auth.uid() = invited_by
		or auth.uid() = invitee_user_id
		or public.is_group_member(group_id, auth.uid())
	);

drop policy if exists group_invites_insert on group_invitations;
create policy group_invites_insert on group_invitations
	for insert
	with check (
		auth.uid() = invited_by and public.is_group_member(group_id, auth.uid())
	);

drop policy if exists group_invites_update on group_invitations;
create policy group_invites_update on group_invitations
	for update
	using (auth.uid() = invitee_user_id or auth.uid() = invited_by)
	with check (auth.uid() = invitee_user_id or auth.uid() = invited_by);

-- Debts: only group members can read; the creator (a member) can insert
drop policy if exists debts_select_members on debts;
create policy debts_select_members on debts
	for select
	using (public.is_group_member(group_id, auth.uid()));

drop policy if exists debts_insert_creator on debts;
create policy debts_insert_creator on debts
	for insert
	with check (
		auth.uid() = created_by and public.is_group_member(group_id, auth.uid())
	);

-- Transactions: only group members can read
drop policy if exists debt_tx_select_members on debt_transactions;
create policy debt_tx_select_members on debt_transactions
	for select
	using (exists (
		select 1 from debts d
		where d.id = debt_transactions.debt_id
			and public.is_group_member(d.group_id, auth.uid())
	));

create or replace function public.accept_debt(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	v_debt debts%rowtype;
begin
	select * into v_debt
	from debts
	where id = p_debt_id and status = 'pending' and is_active = true
	for update;

	if not found then
		raise exception 'Debt not pending';
	end if;

	if auth.uid() <> v_debt.debtor_id then
		raise exception 'Only debtor can accept';
	end if;

	update debts set status = 'accepted' where id = p_debt_id;

	insert into debt_transactions (debt_id, type, amount, metadata)
	values (p_debt_id, 'accept', v_debt.amount, jsonb_build_object('by', auth.uid()));
end;
$$;

create or replace function public.reject_debt(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	v_debt debts%rowtype;
begin
	select * into v_debt
	from debts
	where id = p_debt_id and status = 'pending' and is_active = true
	for update;

	if not found then
		raise exception 'Debt not pending';
	end if;

	if auth.uid() <> v_debt.debtor_id then
		raise exception 'Only debtor can reject';
	end if;

	update debts set status = 'rejected', is_active = false where id = p_debt_id;

	insert into debt_transactions (debt_id, type, amount, metadata)
	values (p_debt_id, 'reject', v_debt.amount, jsonb_build_object('by', auth.uid()));
end;
$$;

create or replace function public.settle_debt(p_debt_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	v_debt debts%rowtype;
begin
	select * into v_debt
	from debts
	where id = p_debt_id and status = 'accepted' and is_active = true
	for update;

	if not found then
		raise exception 'Debt not accepted';
	end if;

	if auth.uid() <> v_debt.debtor_id and auth.uid() <> v_debt.creditor_id then
		raise exception 'Only debtor or creditor can settle';
	end if;

	update debts set status = 'settled', is_active = false where id = p_debt_id;

	insert into debt_transactions (debt_id, type, amount, metadata)
	values (p_debt_id, 'settle', v_debt.amount, jsonb_build_object('by', auth.uid()));
end;
$$;

create or replace function public.transfer_debt(p_from_debt_id uuid, p_to_debt_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
	debt_from debts%rowtype;
	debt_to debts%rowtype;
	transfer_amount integer;
	new_debt_id uuid;
begin
	select * into debt_from
	from debts
	where id = p_from_debt_id and status = 'accepted' and is_active = true
	for update;

	select * into debt_to
	from debts
	where id = p_to_debt_id and status = 'accepted' and is_active = true
	for update;

	if not found or debt_from.id is null or debt_to.id is null then
		raise exception 'Both debts must be accepted';
	end if;

	if debt_from.creditor_id <> debt_to.debtor_id then
		raise exception 'Creditor of first debt must be debtor of second debt';
	end if;

	if auth.uid() <> debt_from.creditor_id or auth.uid() <> debt_to.debtor_id then
		raise exception 'Only the intermediary can transfer';
	end if;

	if debt_from.currency <> debt_to.currency then
		raise exception 'Currency mismatch';
	end if;

	transfer_amount := least(debt_from.amount, debt_to.amount);

	insert into debts (
		group_id, creditor_id, debtor_id, amount, currency, status,
		created_by, is_active, parent_debt_id
	) values (
		debt_from.group_id,
		debt_to.creditor_id,
		debt_from.debtor_id,
		transfer_amount,
		debt_from.currency,
		'accepted',
		auth.uid(),
		true,
		debt_from.id
	) returning id into new_debt_id;

	update debts
	set amount = amount - transfer_amount,
			status = case when amount - transfer_amount = 0 then 'settled' else status end,
			is_active = case when amount - transfer_amount = 0 then false else true end
	where id = debt_from.id;

	update debts
	set amount = amount - transfer_amount,
			status = case when amount - transfer_amount = 0 then 'settled' else status end,
			is_active = case when amount - transfer_amount = 0 then false else true end
	where id = debt_to.id;

	insert into debt_transactions (debt_id, type, amount, metadata)
	values
		(debt_from.id, 'transfer', transfer_amount, jsonb_build_object('to_debt', new_debt_id)),
		(debt_to.id, 'transfer', transfer_amount, jsonb_build_object('to_debt', new_debt_id)),
		(new_debt_id, 'transfer', transfer_amount, jsonb_build_object('from_debts', jsonb_build_array(debt_from.id, debt_to.id)));

	return new_debt_id;
end;
$$;

create or replace function public.accept_invitation(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	v_invite group_invitations%rowtype;
begin
	select * into v_invite
	from group_invitations
	where id = p_invite_id and status = 'pending'
	for update;

	if not found then
		raise exception 'Invitation not pending';
	end if;

	if auth.uid() <> v_invite.invitee_user_id then
		raise exception 'Only invitee can accept';
	end if;

	update group_invitations
	set status = 'accepted', responded_at = now()
	where id = p_invite_id;

	insert into group_members (group_id, user_id)
	values (v_invite.group_id, v_invite.invitee_user_id)
	on conflict do nothing;
end;
$$;

create or replace function public.decline_invitation(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
	v_invite group_invitations%rowtype;
begin
	select * into v_invite
	from group_invitations
	where id = p_invite_id and status = 'pending'
	for update;

	if not found then
		raise exception 'Invitation not pending';
	end if;

	if auth.uid() <> v_invite.invitee_user_id then
		raise exception 'Only invitee can decline';
	end if;

	update group_invitations
	set status = 'declined', responded_at = now()
	where id = p_invite_id;
end;
$$;
