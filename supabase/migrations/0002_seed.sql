-- Seed demo data (requires auth users to exist)

DO $$
DECLARE
  user_a uuid;
  user_b uuid;
  user_c uuid;
  group_id uuid;
BEGIN
  select id into user_a from auth.users where email = 'demo1@rivo.app';
  select id into user_b from auth.users where email = 'demo2@rivo.app';
  select id into user_c from auth.users where email = 'demo3@rivo.app';

  if user_a is null or user_b is null or user_c is null then
    raise notice 'Seed skipped. Create demo users in Supabase Auth first.';
    return;
  end if;

  insert into profiles (id, name, username)
  values
    (user_a, 'Andrea', 'andrea_demo'),
    (user_b, 'Bruno', 'bruno_demo'),
    (user_c, 'Camila', 'camila_demo')
  on conflict do nothing;

  insert into groups (id, name, created_by)
  values (gen_random_uuid(), 'Viaje Demo', user_a)
  returning id into group_id;

  insert into group_members (group_id, user_id)
  values
    (group_id, user_a),
    (group_id, user_b),
    (group_id, user_c)
  on conflict do nothing;

  insert into debts (group_id, creditor_id, debtor_id, amount, currency, status, created_by, is_active)
  values
    (group_id, user_a, user_b, 45000, 'MXN', 'accepted', user_a, true),
    (group_id, user_b, user_c, 20000, 'MXN', 'pending', user_b, true),
    (group_id, user_c, user_a, 12000, 'MXN', 'accepted', user_c, true);
END $$;
