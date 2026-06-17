// Shared presentation helpers for notifications, used by both the in-app list
// and the browser (OS-level) notifications so the wording stays in sync.

import { formatCurrency } from "./format";
import type { Notification } from "./types";

// Stable identity for a notification across refreshes (kind + row id).
export function notificationKey(n: Notification): string {
  return `${n.kind}:${n.id}`;
}

export function notificationText(n: Notification): string {
  if (n.kind === "invitation") return `${n.from} te invitó a "${n.groupName}"`;
  if (n.kind === "debt_request")
    return `${n.from} registró que le debes ${formatCurrency(n.amount, n.currency)} en "${n.groupName}"`;
  if (n.kind === "settlement_request")
    return `${n.from} marcó como pagada ${formatCurrency(n.amount, n.currency)} en "${n.groupName}"`;
  if (n.kind === "payment_request")
    return `${n.from} abonó ${formatCurrency(n.amount, n.currency)} en "${n.groupName}"`;
  return `Transferencia: ${n.from} pasaría a deberte ${formatCurrency(n.amount, n.currency)} en "${n.groupName}"`;
}

export function notificationTitle(n: Notification): string {
  switch (n.kind) {
    case "invitation":
      return "Nueva invitación";
    case "debt_request":
      return "Nueva deuda por aceptar";
    case "settlement_request":
      return "Pago por confirmar";
    case "payment_request":
      return "Abono por confirmar";
    case "transfer_request":
      return "Transferencia por aceptar";
  }
}
