-- Rivo fix-ups (safe to re-run).
--
-- 1) Allow a user to create their OWN profile row from the client.
--    `profiles` previously had only SELECT and UPDATE policies, so the only way
--    a profile could ever be created was the handle_new_user trigger. Any user
--    created before that trigger existed (or whose insert was skipped) had no
--    profile and got stuck forever on the onboarding screen, because an UPDATE
--    of a non-existent row silently changes nothing. With this INSERT policy the
--    onboarding screen can upsert the profile.
--
-- 2) Re-assert the created_by defaults in case migration 0003 was not applied.
--    (The frontend now also sends created_by explicitly, so this is just a
--    belt-and-suspenders safety net.)

drop policy if exists profiles_insert_own on profiles;
create policy profiles_insert_own on profiles
  for insert
  with check (auth.uid() = id);

alter table groups alter column created_by set default auth.uid();
alter table debts alter column created_by set default auth.uid();
