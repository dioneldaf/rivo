import Badge, { type Tone } from "./ui/Badge";
import type { DebtStatus } from "../lib/types";

const map: Record<DebtStatus, { label: string; tone: Tone; pulse?: boolean }> = {
  pending: { label: "Pendiente", tone: "amber", pulse: true },
  accepted: { label: "Aceptada", tone: "sky" },
  rejected: { label: "Rechazada", tone: "rose" },
  settled: { label: "Pagada", tone: "emerald" },
  settle_requested: { label: "Pago por confirmar", tone: "brand", pulse: true },
  transfer_pending: { label: "Transferencia por aceptar", tone: "brand", pulse: true },
};

export default function StatusBadge({ status }: { status: DebtStatus }) {
  const { label, tone, pulse } = map[status];
  return (
    <Badge tone={tone}>
      {pulse ? <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse-dot" /> : null}
      {label}
    </Badge>
  );
}
