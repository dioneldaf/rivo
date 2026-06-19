import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Archive, ChevronDown } from "lucide-react";
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
  delete_requested: "bg-rose-500 animate-pulse-dot",
  merged: "bg-slate-300 dark:bg-slate-600",
};

// Debts that are done with: settled, rejected, or netted away by a merge. They
// move to a dimmed, collapsible drawer at the bottom of the ledger.
const CLOSED: DebtStatus[] = ["settled", "rejected", "merged"];

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
  const [showClosed, setShowClosed] = useState(false);

  const { active, closed, mergeChildren } = useMemo(() => {
    const active: DebtWithUsers[] = [];
    const closed: DebtWithUsers[] = [];
    // Surviving net debt id -> the original debts that were folded into it.
    const mergeChildren = new Map<string, DebtWithUsers[]>();
    for (const d of debts) {
      if (CLOSED.includes(d.status)) closed.push(d);
      else active.push(d);
      if (d.status === "merged" && d.parent_debt_id) {
        const arr = mergeChildren.get(d.parent_debt_id) ?? [];
        arr.push(d);
        mergeChildren.set(d.parent_debt_id, arr);
      }
    }
    // Keep merge breakdowns in chronological order.
    for (const arr of mergeChildren.values()) {
      arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    }
    return { active, closed, mergeChildren };
  }, [debts]);

  return (
    <div className="space-y-5">
      {active.length > 0 ? (
        <div className="relative">
          <div className="absolute bottom-2 left-3 top-2 w-px bg-gradient-to-b from-brand-400/60 via-slate-200 to-transparent dark:via-slate-800" />
          <StaggerGroup className="space-y-4">
            {active.map((d) => (
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
                  mergeChildren={mergeChildren.get(d.id)}
                  currentUserId={currentUserId}
                  actions={actions}
                  busy={busyId === d.id}
                />
              </StaggerItem>
            ))}
          </StaggerGroup>
        </div>
      ) : null}

      {closed.length > 0 ? (
        <div className="rounded-3xl border border-slate-200/70 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            aria-expanded={showClosed}
            className="flex w-full items-center justify-between gap-2 px-1 text-sm font-semibold text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <span className="flex items-center gap-2">
              <Archive className="h-4 w-4" /> Cerradas ({closed.length})
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", showClosed && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {showClosed ? (
              <motion.div
                key="closed"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], opacity: { duration: 0.18 } }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-3">
                  {closed.map((d) => (
                    <DebtCard
                      key={d.id}
                      debt={d}
                      payments={payments?.[d.id]}
                      currentUserId={currentUserId}
                      actions={actions}
                      busy={busyId === d.id}
                      dimmed
                    />
                  ))}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </div>
  );
}
