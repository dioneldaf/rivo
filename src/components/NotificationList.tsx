import { useState } from "react";
import { ArrowRightLeft, Check, Coins, HandCoins, Mail, Trash2 } from "lucide-react";
import Button from "./ui/Button";
import { useToast } from "../providers/ToastProvider";
import {
  acceptDebt,
  acceptInvitation,
  acceptTransfer,
  confirmDeleteDebt,
  confirmPartialPayment,
  confirmSettlement,
  declineInvitation,
  rejectDebt,
  rejectDeleteDebt,
  rejectPartialPayment,
  rejectSettlement,
  rejectTransfer,
} from "../lib/api";
import { emitDataChanged } from "../lib/events";
import { timeAgo } from "../lib/format";
import { notificationKey, notificationText } from "../lib/notifications";
import type { Notification } from "../lib/types";

const icons = {
  invitation: Mail,
  debt_request: HandCoins,
  settlement_request: Check,
  payment_request: Coins,
  transfer_request: ArrowRightLeft,
  delete_request: Trash2,
} as const;

export default function NotificationList({
  items,
  emptyText = "Sin pendientes. ¡Todo al día! 🎉",
}: {
  items: Notification[];
  emptyText?: string;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(ok);
      emitDataChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const actions = (n: Notification) => {
    const key = notificationKey(n);
    const disabled = busy === key;
    if (n.kind === "invitation") {
      return (
        <>
          <Button size="sm" variant="subtle" disabled={disabled} onClick={() => run(key, () => declineInvitation(n.id), "Invitación rechazada")}>
            Rechazar
          </Button>
          <Button size="sm" disabled={disabled} onClick={() => run(key, () => acceptInvitation(n.id), "Te uniste al grupo")}>
            Aceptar
          </Button>
        </>
      );
    }
    if (n.kind === "debt_request") {
      return (
        <>
          <Button size="sm" variant="subtle" disabled={disabled} onClick={() => run(key, () => rejectDebt(n.id), "Deuda rechazada")}>
            Rechazar
          </Button>
          <Button size="sm" disabled={disabled} onClick={() => run(key, () => acceptDebt(n.id), "Deuda aceptada")}>
            Aceptar
          </Button>
        </>
      );
    }
    if (n.kind === "transfer_request") {
      return (
        <>
          <Button size="sm" variant="subtle" disabled={disabled} onClick={() => run(key, () => rejectTransfer(n.id), "Transferencia rechazada")}>
            Rechazar
          </Button>
          <Button size="sm" disabled={disabled} onClick={() => run(key, () => acceptTransfer(n.id), "Transferencia aceptada")}>
            Aceptar
          </Button>
        </>
      );
    }
    if (n.kind === "payment_request") {
      return (
        <>
          <Button size="sm" variant="subtle" disabled={disabled} onClick={() => run(key, () => rejectPartialPayment(n.id), "Abono rechazado")}>
            Rechazar
          </Button>
          <Button size="sm" disabled={disabled} onClick={() => run(key, () => confirmPartialPayment(n.id), "Abono confirmado")}>
            Confirmar
          </Button>
        </>
      );
    }
    if (n.kind === "delete_request") {
      return (
        <>
          <Button size="sm" variant="subtle" disabled={disabled} onClick={() => run(key, () => rejectDeleteDebt(n.id), "Eliminación rechazada")}>
            Conservar
          </Button>
          <Button size="sm" variant="danger" disabled={disabled} onClick={() => run(key, () => confirmDeleteDebt(n.id), "Deuda eliminada")}>
            Eliminar
          </Button>
        </>
      );
    }
    return (
      <>
        <Button size="sm" variant="subtle" disabled={disabled} onClick={() => run(key, () => rejectSettlement(n.id), "Pago rechazado")}>
          Rechazar
        </Button>
        <Button size="sm" disabled={disabled} onClick={() => run(key, () => confirmSettlement(n.id), "Pago confirmado")}>
          Confirmar
        </Button>
      </>
    );
  };

  if (items.length === 0) {
    return <p className="px-3 py-10 text-center text-sm text-slate-400">{emptyText}</p>;
  }

  return (
    <div className="space-y-1">
      {items.map((n) => {
        const Icon = icons[n.kind];
        return (
          <div key={notificationKey(n)} className="rounded-2xl p-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-700 dark:text-slate-200">{notificationText(n)}</p>
                <p className="mt-0.5 text-xs text-slate-400">{timeAgo(n.created_at)}</p>
                <div className="mt-2 flex gap-2">{actions(n)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
