import DebtCard, { type DebtActions } from "./DebtCard";
import { StaggerGroup, StaggerItem } from "./ui/motion";
import { cn } from "./ui/cn";
import type { DebtPayment, DebtStatus, DebtWithUsers } from "../lib/types";

const dotClass: Record<DebtStatus, string> = {
  pending: "bg-amber-400 animate-pulse-dot",
  accepted: "bg-sky-400",
  settled: "bg-emerald-400",
  rejected: "bg-rose-400",
  settle_requested: "bg-brand-500 animate-pulse-dot",
  transfer_pending: "bg-brand-500 animate-pulse-dot",
};

// Debts rendered as a connected ledger: a vertical rail with status nodes.
export default function DebtLedger({
  debts,
  payments,
  currentUserId,
  actions,
  busyId,
}: {
  debts: DebtWithUsers[];
  payments?: Record<string, DebtPayment[]>;
  currentUserId?: string;
  actions: DebtActions;
  busyId?: string | null;
}) {
  return (
    <div className="relative">
      <div className="absolute bottom-2 left-3 top-2 w-px bg-gradient-to-b from-brand-400/60 via-slate-200 to-transparent dark:via-slate-800" />
      <StaggerGroup className="space-y-4">
        {debts.map((d) => (
          <StaggerItem key={d.id} className="relative pl-9">
            <span
              className={cn(
                "absolute left-[6px] top-7 z-10 h-3.5 w-3.5 rounded-full ring-4 ring-white dark:ring-slate-950",
                dotClass[d.status]
              )}
            />
            <DebtCard
              debt={d}
              payments={payments?.[d.id]}
              currentUserId={currentUserId}
              actions={actions}
              busy={busyId === d.id}
            />
          </StaggerItem>
        ))}
      </StaggerGroup>
    </div>
  );
}
