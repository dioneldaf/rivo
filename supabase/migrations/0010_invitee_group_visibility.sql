-- 0010_invitee_group_visibility.sql
--
-- Bug: in the in-app notifications, a group invitation showed the fallback name
-- "Grupo" instead of the real one. Reason: the groups SELECT policy only lets
-- MEMBERS read a group, but an invitee isn't a member yet, so the embedded
-- group:group_id(name) resolved to null under RLS. (The browser push got it
-- right because its trigger runs as SECURITY DEFINER and bypasses RLS.)
--
-- Fix: let a user also read a group they have a PENDING invitation to. We use a
-- SECURITY DEFINER helper to avoid RLS recursion (same pattern as is_group_member),
-- and add it as a second permissive SELECT policy (permissive policies are OR'd).

create or replace function public.has_pending_invitation(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from group_invitations
    where group_id = p_group_id
      and invitee_user_id = p_user_id
      and status = 'pending'
  );
$$;

drop policy if exists groups_select_invited on groups;
create policy groups_select_invited on groups
  for select
  using (public.has_pending_invitation(id, auth.uid()));
