// Data layer for Rivo.
//
// Rivo is a frontend-only app: Supabase IS the backend. Reads go through
// PostgREST (with Row Level Security) and every mutation that must be atomic or
// privileged goes through a Postgres function (RPC). There is no custom server.

import { supabase } from "./supabaseClient";
import type {
  DebtPayment,
  DebtWithUsers,
  Group,
  GroupSummary,
  Member,
  MemberRole,
  Notification,
  PendingInvitation,
  PersonRef,
} from "./types";

function rpcVoid(fn: string, args: Record<string, unknown>) {
  return supabase.rpc(fn, args).then(({ error }) => {
    if (error) throw new Error(error.message);
  });
}

async function requireUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) throw new Error("No hay sesion activa.");
  return uid;
}

// PostgREST infers to-one embeds as arrays; normalize to a single object.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

/* ---------------------------------- Profile ---------------------------------- */

// Raised by Postgres' unique index on lower(username) when a handle is taken.
export const USERNAME_TAKEN = "USERNAME_TAKEN";

export async function updateProfile(input: { name: string; username: string }): Promise<void> {
  const uid = await requireUserId();
  const { error } = await supabase
    .from("profiles")
    .update({ name: input.name.trim(), username: input.username.trim().toLowerCase() })
    .eq("id", uid);
  if (error) {
    if (error.code === "23505") throw new Error(USERNAME_TAKEN);
    throw new Error(error.message);
  }
}

// Upload a new avatar image to Storage and return its public URL.
export async function uploadAvatar(file: File): Promise<string> {
  const uid = await requireUserId();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${uid}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

// Set (or clear, with null) the current user's profile photo.
export async function updateAvatar(url: string | null): Promise<void> {
  const uid = await requireUserId();
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", uid);
  if (error) throw new Error(error.message);
}

// Save the creditor's reminder phrases (the "timbre" presets). Up to 5, each
// trimmed and capped at 80 chars; empties are dropped.
export async function updateNudgePhrases(phrases: string[]): Promise<void> {
  const uid = await requireUserId();
  const clean = phrases
    .map((p) => p.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, 5);
  const { error } = await supabase.from("profiles").update({ nudge_phrases: clean }).eq("id", uid);
  if (error) throw new Error(error.message);
}

/* ----------------------------------- Groups ---------------------------------- */

export async function listGroups(): Promise<GroupSummary[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("groups")
    .select("id,name,created_by,currencies,created_at, group_members(count), debts(count)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", uid);
  const roleByGroup = new Map<string, MemberRole>(
    (memberships ?? []).map((m: { group_id: string; role: MemberRole }) => [m.group_id, m.role])
  );

  // Only groups the user actually belongs to. (Groups they're merely invited to
  // are now also RLS-visible so the invitation can show the name, but they must
  // not appear in the dashboard list until accepted.)
  return ((data ?? []) as GroupSummary[])
    .filter((g) => roleByGroup.has(g.id))
    .map((g) => ({ ...g, role: roleByGroup.get(g.id) as MemberRole }));
}

// All members of the given groups, grouped by group_id (one query). Used for
// avatar stacks on the dashboard deck.
export async function listGroupMembersPreview(groupIds: string[]): Promise<Record<string, PersonRef[]>> {
  if (groupIds.length === 0) return {};
  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, profiles(id,name,username,avatar_url)")
    .in("group_id", groupIds);
  if (error) throw new Error(error.message);
  const map: Record<string, PersonRef[]> = {};
  for (const row of data ?? []) {
    const r = row as { group_id: string; profiles: PersonRef | PersonRef[] | null };
    const profile = one(r.profiles);
    if (!profile) continue;
    (map[r.group_id] ??= []).push(profile);
  }
  return map;
}

export async function getGroup(groupId: string): Promise<Group> {
  const { data, error } = await supabase
    .from("groups")
    .select("id,name,created_by,currencies,created_at")
    .eq("id", groupId)
    .single();
  if (error) throw new Error(error.message);
  return data as Group;
}

// id is generated client-side and we insert WITHOUT .select(): an insert+select
// in one statement evaluates the SELECT RLS policy before the membership row
// (created by the AFTER-INSERT trigger) is visible, which wrongly rejects it.
export async function createGroup(name: string): Promise<Group> {
  const created_by = await requireUserId();
  const trimmed = name.trim();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("groups").insert({ id, name: trimmed, created_by });
  if (error) throw new Error(error.message);
  return {
    id,
    name: trimmed,
    created_by,
    currencies: [],
    created_at: new Date().toISOString(),
  };
}

export async function listMembers(groupId: string): Promise<Member[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("role, profiles(id,name,username,avatar_url)")
    .eq("group_id", groupId);
  if (error) throw new Error(error.message);
  return (data ?? []).flatMap((row) => {
    const r = row as { role: MemberRole; profiles: Member | Member[] | null };
    const profile = one(r.profiles);
    return profile ? [{ ...profile, role: r.role }] : [];
  });
}

export async function renameGroup(groupId: string, name: string): Promise<void> {
  await rpcVoid("rename_group", { p_group_id: groupId, p_name: name });
}

export async function setGroupCurrencies(groupId: string, currencies: string[]): Promise<void> {
  await rpcVoid("set_group_currencies", { p_group_id: groupId, p_currencies: currencies });
}

export async function setMemberRole(groupId: string, userId: string, role: MemberRole): Promise<void> {
  await rpcVoid("set_member_role", { p_group_id: groupId, p_user_id: userId, p_role: role });
}

export async function removeMember(groupId: string, userId: string): Promise<void> {
  await rpcVoid("remove_member", { p_group_id: groupId, p_user_id: userId });
}

export async function leaveGroup(groupId: string): Promise<void> {
  await rpcVoid("leave_group", { p_group_id: groupId });
}

export async function deleteGroup(groupId: string): Promise<void> {
  await rpcVoid("delete_group", { p_group_id: groupId });
}

/* -------------------------------- Invitations -------------------------------- */

export async function listInvitations(): Promise<PendingInvitation[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("group_invitations")
    .select("id,group_id,created_at, group:group_id(id,name), inviter:invited_by(id,name,username,avatar_url)")
    .eq("invitee_user_id", uid)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      group_id: r.group_id as string,
      created_at: r.created_at as string,
      group: one(r.group as any),
      inviter: one(r.inviter as any),
    };
  });
}

export async function inviteToGroup(groupId: string, identifier: string): Promise<void> {
  await rpcVoid("invite_to_group", { p_group_id: groupId, p_identifier: identifier.trim() });
}

export async function acceptInvitation(inviteId: string): Promise<void> {
  await rpcVoid("accept_invitation", { p_invite_id: inviteId });
}

export async function declineInvitation(inviteId: string): Promise<void> {
  await rpcVoid("decline_invitation", { p_invite_id: inviteId });
}

/* ----------------------------------- Debts ----------------------------------- */

export async function listDebts(groupId: string): Promise<DebtWithUsers[]> {
  const { data, error } = await supabase
    .from("debts")
    .select("*, creditor:creditor_id(id,name,username,avatar_url), debtor:debtor_id(id,name,username,avatar_url)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      ...(r as object),
      creditor: one(r.creditor as any),
      debtor: one(r.debtor as any),
    } as DebtWithUsers;
  });
}

export type CreateDebtInput = {
  groupId: string;
  counterpartyId: string;
  amount: number; // in cents
  currency: string;
  iAmDebtor: boolean; // true: "I owe them" (auto-accepted); false: "they owe me" (needs acceptance)
  description?: string;
};

// The creator is always one of the two parties. If they are the debtor, the debt
// is accepted immediately; if they are the creditor, the debtor must accept.
export async function createDebt(input: CreateDebtInput): Promise<void> {
  await rpcVoid("create_debt", {
    p_group_id: input.groupId,
    p_counterparty_id: input.counterpartyId,
    p_amount: Math.round(input.amount),
    p_currency: input.currency.toUpperCase(),
    p_i_am_debtor: input.iAmDebtor,
    p_description: input.description?.trim() || null,
  });
}

// Delete a debt. The RPC enforces the rules: creditor deletes directly, debtor
// requests deletion (creditor confirms), pending debts are canceled by creator.
export async function deleteDebt(debtId: string): Promise<void> {
  await rpcVoid("delete_debt", { p_debt_id: debtId });
}

export async function confirmDeleteDebt(debtId: string): Promise<void> {
  await rpcVoid("confirm_delete_debt", { p_debt_id: debtId });
}

export async function rejectDeleteDebt(debtId: string): Promise<void> {
  await rpcVoid("reject_delete_debt", { p_debt_id: debtId });
}

// Creditor-only "nudge": pushes a reminder (the chosen phrase) to the debtor.
export async function nudgeDebtor(debtId: string, message: string): Promise<void> {
  await rpcVoid("nudge_debtor", { p_debt_id: debtId, p_message: message });
}

// Merge 2+ same-party, same-currency accepted debts into one (either party may).
export async function mergeDebts(debtIds: string[]): Promise<void> {
  await rpcVoid("merge_debts", { p_debt_ids: debtIds });
}

export async function acceptDebt(debtId: string): Promise<void> {
  await rpcVoid("accept_debt", { p_debt_id: debtId });
}

export async function rejectDebt(debtId: string): Promise<void> {
  await rpcVoid("reject_debt", { p_debt_id: debtId });
}

// Creditor -> settles immediately. Debtor -> requests confirmation.
export async function settleDebt(debtId: string): Promise<void> {
  await rpcVoid("settle_debt", { p_debt_id: debtId });
}

export async function confirmSettlement(debtId: string): Promise<void> {
  await rpcVoid("confirm_settlement", { p_debt_id: debtId });
}

export async function rejectSettlement(debtId: string): Promise<void> {
  await rpcVoid("reject_settlement", { p_debt_id: debtId });
}

// Partial payments. Creditor -> applied now. Debtor -> awaits creditor confirmation.
export async function recordPartialPayment(debtId: string, amount: number): Promise<void> {
  await rpcVoid("record_partial_payment", { p_debt_id: debtId, p_amount: amount });
}

export async function confirmPartialPayment(paymentId: string): Promise<void> {
  await rpcVoid("confirm_partial_payment", { p_payment_id: paymentId });
}

export async function rejectPartialPayment(paymentId: string): Promise<void> {
  await rpcVoid("reject_partial_payment", { p_payment_id: paymentId });
}

// Payment history per debt (confirmed + pending), keyed by debt id. Rejected
// ones are omitted. Visible to any group member.
export async function listDebtPayments(debtIds: string[]): Promise<Record<string, DebtPayment[]>> {
  if (debtIds.length === 0) return {};
  const { data, error } = await supabase
    .from("debt_payments")
    .select("id,debt_id,amount,status,created_at, proposer:proposed_by(id,name,username,avatar_url)")
    .in("debt_id", debtIds)
    .neq("status", "rejected")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const map: Record<string, DebtPayment[]> = {};
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const did = r.debt_id as string;
    (map[did] ??= []).push({
      id: r.id as string,
      debt_id: did,
      amount: r.amount as number,
      status: r.status as DebtPayment["status"],
      created_at: r.created_at as string,
      proposer: one(r.proposer as any),
    });
  }
  return map;
}

// Proposes a transfer; the new creditor must accept it before it counts.
export async function transferDebt(fromDebtId: string, toDebtId: string): Promise<void> {
  await rpcVoid("transfer_debt", { p_from_debt_id: fromDebtId, p_to_debt_id: toDebtId });
}

export async function acceptTransfer(debtId: string): Promise<void> {
  await rpcVoid("accept_transfer", { p_debt_id: debtId });
}

export async function rejectTransfer(debtId: string): Promise<void> {
  await rpcVoid("reject_transfer", { p_debt_id: debtId });
}

/* ------------------------------- Notifications ------------------------------- */

// Actionable pending items across all the user's groups.
export async function listNotifications(): Promise<Notification[]> {
  const uid = await requireUserId();
  const [invites, inbound, settle, transfers, payments, deletes] = await Promise.all([
    listInvitations(),
    supabase
      .from("debts")
      .select("id,group_id,amount,currency,created_at, group:group_id(name), creditor:creditor_id(name)")
      .eq("debtor_id", uid)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("debts")
      .select("id,group_id,amount,currency,created_at, group:group_id(name), debtor:debtor_id(name)")
      .eq("creditor_id", uid)
      .eq("status", "settle_requested")
      .order("created_at", { ascending: false }),
    supabase
      .from("debts")
      .select("id,group_id,amount,currency,created_at, group:group_id(name), debtor:debtor_id(name)")
      .eq("creditor_id", uid)
      .eq("status", "transfer_pending")
      .order("created_at", { ascending: false }),
    // Partial payments the debtor reported, awaiting my (creditor's) confirmation.
    supabase
      .from("debt_payments")
      .select("id,amount,created_at, debt:debt_id!inner(group_id, currency, creditor_id, group:group_id(name), debtor:debtor_id(name))")
      .eq("status", "pending")
      .eq("debt.creditor_id", uid)
      .order("created_at", { ascending: false }),
    // Deletions the debtor requested, awaiting my (creditor's) confirmation.
    supabase
      .from("debts")
      .select("id,group_id,amount,currency,created_at, group:group_id(name), debtor:debtor_id(name)")
      .eq("creditor_id", uid)
      .eq("status", "delete_requested")
      .order("created_at", { ascending: false }),
  ]);

  const out: Notification[] = [];

  for (const inv of invites) {
    out.push({
      kind: "invitation",
      id: inv.id,
      created_at: inv.created_at,
      groupId: inv.group_id,
      groupName: inv.group?.name ?? "Grupo",
      from: inv.inviter?.name ?? "Alguien",
    });
  }

  for (const row of inbound.data ?? []) {
    const r = row as Record<string, unknown>;
    out.push({
      kind: "debt_request",
      id: r.id as string,
      created_at: r.created_at as string,
      groupId: r.group_id as string,
      groupName: (one(r.group as any) as { name?: string } | null)?.name ?? "Grupo",
      from: (one(r.creditor as any) as { name?: string } | null)?.name ?? "Alguien",
      amount: r.amount as number,
      currency: r.currency as string,
    });
  }

  for (const row of settle.data ?? []) {
    const r = row as Record<string, unknown>;
    out.push({
      kind: "settlement_request",
      id: r.id as string,
      created_at: r.created_at as string,
      groupId: r.group_id as string,
      groupName: (one(r.group as any) as { name?: string } | null)?.name ?? "Grupo",
      from: (one(r.debtor as any) as { name?: string } | null)?.name ?? "Alguien",
      amount: r.amount as number,
      currency: r.currency as string,
    });
  }

  for (const row of transfers.data ?? []) {
    const r = row as Record<string, unknown>;
    out.push({
      kind: "transfer_request",
      id: r.id as string,
      created_at: r.created_at as string,
      groupId: r.group_id as string,
      groupName: (one(r.group as any) as { name?: string } | null)?.name ?? "Grupo",
      from: (one(r.debtor as any) as { name?: string } | null)?.name ?? "Alguien",
      amount: r.amount as number,
      currency: r.currency as string,
    });
  }

  for (const row of payments.data ?? []) {
    const r = row as Record<string, unknown>;
    const debt = one(r.debt as any) as
      | { group_id?: string; currency?: string; group?: any; debtor?: any }
      | null;
    out.push({
      kind: "payment_request",
      id: r.id as string,
      created_at: r.created_at as string,
      groupId: debt?.group_id ?? "",
      groupName: (one(debt?.group) as { name?: string } | null)?.name ?? "Grupo",
      from: (one(debt?.debtor) as { name?: string } | null)?.name ?? "Alguien",
      amount: r.amount as number,
      currency: debt?.currency ?? "",
    });
  }

  for (const row of deletes.data ?? []) {
    const r = row as Record<string, unknown>;
    out.push({
      kind: "delete_request",
      id: r.id as string,
      created_at: r.created_at as string,
      groupId: r.group_id as string,
      groupName: (one(r.group as any) as { name?: string } | null)?.name ?? "Grupo",
      from: (one(r.debtor as any) as { name?: string } | null)?.name ?? "Alguien",
      amount: r.amount as number,
      currency: r.currency as string,
    });
  }

  out.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return out;
}

/* --------------------------------- Balances ---------------------------------- */

export type Balance = { currency: string; owedToMe: number; iOwe: number };

// Net of accepted, active debts the current user is part of, grouped by currency.
export async function getBalanceSummary(): Promise<Balance[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from("debts")
    .select("amount,currency,creditor_id,debtor_id")
    .eq("status", "accepted")
    .eq("is_active", true)
    .or(`creditor_id.eq.${uid},debtor_id.eq.${uid}`);
  if (error) throw new Error(error.message);

  const byCurrency = new Map<string, Balance>();
  for (const row of data ?? []) {
    const r = row as { amount: number; currency: string; creditor_id: string; debtor_id: string };
    const b = byCurrency.get(r.currency) ?? { currency: r.currency, owedToMe: 0, iOwe: 0 };
    if (r.creditor_id === uid) b.owedToMe += r.amount;
    else if (r.debtor_id === uid) b.iOwe += r.amount;
    byCurrency.set(r.currency, b);
  }
  return Array.from(byCurrency.values()).sort((a, b) => a.currency.localeCompare(b.currency));
}
