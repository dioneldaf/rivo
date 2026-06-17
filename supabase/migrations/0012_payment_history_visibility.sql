-- 0012_payment_history_visibility.sql
--
-- Let any group member read a debt's payment history. Debts are already visible
-- to all members of the group, so their abonos should be too (the original
-- policy only allowed the two participants, which hid history for other members).

drop policy if exists debt_payments_select on public.debt_payments;
create policy debt_payments_select on public.debt_payments
  for select using (
    exists (
      select 1 from debts d
      where d.id = debt_id and public.is_group_member(d.group_id, auth.uid())
    )
  );
