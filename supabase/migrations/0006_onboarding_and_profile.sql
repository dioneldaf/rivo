-- 0006_onboarding_and_profile.sql
--
-- Google OAuth users can't provide a username at sign-up (Google only gives us
-- name + email), so the handle_new_user trigger autogenerates one like
-- "juan_a1b2c3". We want first-time users to CHOOSE a clean @handle instead.
--
-- Add an `onboarded` flag: new rows default to false (the app routes them to the
-- onboarding screen to pick a username), and they flip it to true when done.
-- Every account that already exists is, by definition, already set up.

alter table public.profiles
  add column if not exists onboarded boolean not null default false;

-- Backfill: existing accounts already have a real username they chose.
update public.profiles set onboarded = true where onboarded = false;
