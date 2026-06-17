import { useState } from "react";
import { ArrowRight, Bell, Check, ChevronDown, Clock, Trash2 } from "lucide-react";
import Avatar from "./ui/Avatar";
import Button from "./ui/Button";
import StatusBadge from "./StatusBadge";
import AnimatedNumber from "./ui/AnimatedNumber";
import { cn } from "./ui/cn";
import { formatCurrency, timeAgo } from "../lib/format";
import type { DebtPayment, DebtWithUsers } from "../lib/types";

export type DebtActions = {
  onAccept: (id: string) => void;
  onReject: (id: string) => void;
  onSettle: (id: string) => void;
  onPay: (id: string) => void;
  onConfirm: (id: string) => void;
  onRejectSettle: (id: string) => void;
  onAcceptTransfer: (id: string) => void;
  onRejectTransfer: (id: string) => void;
  onDelete: (id: string) => void;
  onConfirmDelete: (id: string) => void;
  onRejectDelete: (id: string) => void;
  onNudge: (id: string) => void;
};

export default function DebtCard({
  debt,
  payments,
  currentUserId,
  actions,
  busy,
}: {
  debt: DebtWithUsers;
  payments?: DebtPayment[];
  currentUserId?: string;
  actions: DebtActions;
  busy?: boolean;
}) {
  const isDebtor = currentUserId === debt.debtor_id;
  const isCreditor = currentUserId === debt.creditor_id;

  const [showPayments, setShowPayments] = useState(false);
  const canNudge = isCreditor && debt.status === "accepted" && debt.is_active;
  const canDelete =
    (debt.status === "pending" && debt.created_by === currentUserId) ||
    (debt.is_active && debt.status === "accepted" && (isCreditor || isDebtor));

  const direction = isCreditor
    ? { label: "Te deben", tone: "text-emerald-600 dark:text-emerald-400" }
    : isDebtor
      ? { label: "Debes", tone: "text-rose-600 dark:text-rose-400" }
      : { label: "Deuda", tone: "text-slate-500 dark:text-slate-400" };

  return (
    <div className="card p-5 transition duration-200 hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Avatar id={debt.debtor.id} name={debt.debtor.name} src={debt.debtor.avatar_url} size="sm" />
          <ArrowRight className="h-4 w-4 text-slate-400" />
          <Avatar id={debt.creditor.id} name={debt.creditor.name} src={debt.creditor.avatar_url} size="sm" />
          <div className="ml-1.5">
            <p className={`text-[11px] font-semibold uppercase tracking-wide ${direction.tone}`}>{direction.label}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {debt.debtor.name} → {debt.creditor.name}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge status={debt.status} />
          {canNudge || canDelete ? (
            <div className="flex items-center gap-1">
              {canNudge ? (
                <button
                  type="button"
                  onClick={() => actions.onNudge(debt.id)}
                  disabled={busy}
                  title="Tocar el timbre al deudor"
                  aria-label="Tocar el timbre al deudor"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 disabled:opacity-50 dark:hover:bg-brand-500/15 dark:hover:text-brand-300"
                >
                  <Bell className="h-4 w-4" />
                </button>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  onClick={() => actions.onDelete(debt.id)}
                  disabled={busy}
                  title="Eliminar deuda"
                  aria-label="Eliminar deuda"
                  className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-500/15 dark:hover:text-rose-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {debt.description ? (
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{debt.description}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <AnimatedNumber
          amount={debt.amount}
          currency={debt.currency}
          className={cn(
            "tabular text-2xl font-semibold",
            isCreditor
              ? "text-emerald-600 dark:text-emerald-400"
              : isDebtor
                ? "text-rose-600 dark:text-rose-400"
                : "text-slate-900 dark:text-slate-100"
          )}
        />
        <div className="flex flex-wrap items-center gap-2">
          {debt.status === "pending" && isDebtor ? (
            <>
              <Button size="sm" variant="subtle" disabled={busy} onClick={() => actions.onReject(debt.id)}>
                Rechazar
              </Button>
              <Button size="sm" disabled={busy} onClick={() => actions.onAccept(debt.id)}>
                Aceptar
              </Button>
            </>
          ) : null}

          {debt.status === "pending" && isCreditor ? (
            <span className="text-xs text-slate-400">Esperando que {debt.debtor.name} acepte</span>
          ) : null}

          {debt.status === "accepted" && (isDebtor || isCreditor) ? (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => actions.onPay(debt.id)}>
                Abonar
              </Button>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => actions.onSettle(debt.id)}>
                Marcar pagada
              </Button>
            </>
          ) : null}

          {debt.status === "settle_requested" && isCreditor ? (
            <>
              <Button size="sm" variant="subtle" disabled={busy} onClick={() => actions.onRejectSettle(debt.id)}>
                Rechazar
              </Button>
              <Button size="sm" disabled={busy} onClick={() => actions.onConfirm(debt.id)}>
                Confirmar pago
              </Button>
            </>
          ) : null}

          {debt.status === "settle_requested" && isDebtor ? (
            <span className="text-xs text-slate-400">Esperando confirmación de {debt.creditor.name}</span>
          ) : null}

          {debt.status === "transfer_pending" && isCreditor ? (
            <>
              <Button size="sm" variant="subtle" disabled={busy} onClick={() => actions.onRejectTransfer(debt.id)}>
                Rechazar
              </Button>
              <Button size="sm" disabled={busy} onClick={() => actions.onAcceptTransfer(debt.id)}>
                Aceptar transferencia
              </Button>
            </>
          ) : null}

          {debt.status === "transfer_pending" && !isCreditor ? (
            <span className="text-xs text-slate-400">
              Transferencia propuesta · espera que {debt.creditor.name} la acepte
            </span>
          ) : null}

          {debt.status === "delete_requested" && isCreditor ? (
            <>
              <Button size="sm" variant="subtle" disabled={busy} onClick={() => actions.onRejectDelete(debt.id)}>
                Conservar
              </Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={() => actions.onConfirmDelete(debt.id)}>
                Eliminar
              </Button>
            </>
          ) : null}

          {debt.status === "delete_requested" && isDebtor ? (
            <span className="text-xs text-slate-400">
              Esperando que {debt.creditor.name} confirme la eliminación
            </span>
          ) : null}
        </div>
      </div>

      {payments && payments.length > 0 ? (
        <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowPayments((v) => !v)}
            aria-expanded={showPayments}
            className="flex w-full items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
          >
            <span>Abonos ({payments.length})</span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", showPayments && "rotate-180")} />
          </button>
          {showPayments ? (
          <ul className="mt-2 space-y-1.5">
            {payments.map((p) => {
              const pending = p.status === "pending";
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    {pending ? (
                      <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    ) : (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    )}
                    <span className="truncate">
                      {p.proposer?.name ?? "Alguien"} · {timeAgo(p.created_at)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular font-medium text-slate-700 dark:text-slate-200">
                      {formatCurrency(p.amount, debt.currency)}
                    </span>
                    {pending ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                        Por aprobar
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
