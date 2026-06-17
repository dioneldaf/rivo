-- Rivo: frontend-direct-to-Supabase additions.
--
-- 1) Default `created_by` to the current user so the client can insert groups
--    and debts without passing it (the RLS WITH CHECK still verifies it).
-- 2) `invite_to_group`: resolve an email OR username to a user and create the
--    invitation entirely inside the database. This replaces the old Express
--    endpoint that needed the service_role key (which must never reach a
--    frontend). Runs as SECURITY DEFINER so it can read auth.users, but it
--    enforces every authorization check itself.

alter table groups alter column created_by set default auth.uid();
alter table debts alter column created_by set default auth.uid();

create or replace function public.invite_to_group(p_group_id uuid, p_identifier text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_identifier text := trim(p_identifier);
  v_invitee uuid;
  v_invite_id uuid;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  if v_identifier = '' then
    raise exception 'Identifier required';
  end if;

  -- Caller must be a member of the group they are inviting to.
  if not exists (
    select 1 from group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_caller
  ) then
    raise exception 'Only group members can invite';
  end if;

  -- Resolve invitee: anything with "@" is treated as an email (looked up in
  -- auth.users), otherwise as a username (looked up in profiles).
  if position('@' in v_identifier) > 0 then
    select id into v_invitee from auth.users where lower(email) = lower(v_identifier);
  else
    select id into v_invitee from profiles where lower(username) = lower(v_identifier);
  end if;

  if v_invitee is null then
    raise exception 'User not found';
  end if;

  if v_invitee = v_caller then
    raise exception 'Cannot invite yourself';
  end if;

  if exists (
    select 1 from group_members gm
    where gm.group_id = p_group_id and gm.user_id = v_invitee
  ) then
    raise exception 'User is already a member';
  end if;

  if exists (
    select 1 from group_invitations gi
    where gi.group_id = p_group_id
      and gi.invitee_user_id = v_invitee
      and gi.status = 'pending'
  ) then
    raise exception 'Invitation already pending';
  end if;

  insert into group_invitations (group_id, invited_by, invitee_user_id)
  values (p_group_id, v_caller, v_invitee)
  returning id into v_invite_id;

  return v_invite_id;
end;
$$;

grant execute on function public.invite_to_group(uuid, text) to authenticated;
