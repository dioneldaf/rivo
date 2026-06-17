// Domain types for Rivo. The database (Supabase / PostgreSQL) is the source of
// truth; these mirror the rows and embedded relations we read.

export type DebtStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "settled"
  | "settle_requested"
  | "transfer_pending";

export type InvitationStatus = "pending" | "accepted" | "declined" | "canceled";

export type MemberRole = "admin" | "member";

export type CurrencyCode = string;

export type Profile = {
  id: string;
  name: string;
  username: string;
  avatar_url: string | null;
  onboarded: boolean;
  created_at: string;
};

export type Member = Pick<Profile, "id" | "name" | "username" | "avatar_url"> & {
  role: MemberRole;
};

export type Group = {
  id: string;
  name: string;
  created_by: string;
  currencies: CurrencyCode[];
  created_at: string;
};

// Group row plus the embedded aggregate counts used on the dashboard.
export type GroupSummary = Group & {
  group_members?: { count: number }[];
  debts?: { count: number }[];
  role?: MemberRole;
};

export type Debt = {
  id: string;
  group_id: string;
  creditor_id: string;
  debtor_id: string;
  amount: number; // stored in cents (integer)
  currency: CurrencyCode;
  status: DebtStatus;
  created_by: string;
  is_active: boolean;
  parent_debt_id?: string | null;
  created_at: string;
};

export type PersonRef = { id: string; name: string; username: string; avatar_url?: string | null };

export type DebtPaymentStatus = "pending" | "confirmed" | "rejected";

export type DebtPayment = {
  id: string;
  debt_id: string;
  amount: number;
  status: DebtPaymentStatus;
  created_at: string;
  proposer: PersonRef | null;
};

// Debt row with the creditor/debtor profiles embedded.
export type DebtWithUsers = Debt & {
  creditor: PersonRef;
  debtor: PersonRef;
};

export type PendingInvitation = {
  id: string;
  group_id: string;
  created_at: string;
  group: { id: string; name: string } | null;
  inviter: PersonRef | null;
};

// A pending action surfaced in the notifications center.
export type Notification =
  | {
      kind: "invitation";
      id: string;
      created_at: string;
      groupId: string;
      groupName: string;
      from: string;
    }
  | {
      kind: "debt_request";
      id: string;
      created_at: string;
      groupId: string;
      groupName: string;
      from: string; // creditor name
      amount: number;
      currency: string;
    }
  | {
      kind: "settlement_request";
      id: string;
      created_at: string;
      groupId: string;
      groupName: string;
      from: string; // debtor name
      amount: number;
      currency: string;
    }
  | {
      kind: "transfer_request";
      id: string;
      created_at: string;
      groupId: string;
      groupName: string;
      from: string; // proposed new debtor's name
      amount: number;
      currency: string;
    }
  | {
      kind: "payment_request";
      id: string; // debt_payments.id
      created_at: string;
      groupId: string;
      groupName: string;
      from: string; // debtor name (who reported the payment)
      amount: number;
      currency: string;
    };
