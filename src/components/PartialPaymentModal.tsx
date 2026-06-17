import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Input from "./ui/Input";
import { recordPartialPayment } from "../lib/api";
import { useToast } from "../providers/ToastProvider";
import { formatCurrency } from "../lib/format";
import type { DebtWithUsers } from "../lib/types";

export default function PartialPaymentModal({
  open,
  onClose,
  debt,
  currentUserId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  debt: DebtWithUsers | null;
  currentUserId?: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setAmount("");
  }, [open, debt?.id]);

  if (!debt) return null;

  const isCreditor = currentUserId === debt.creditor_id;
  const remaining = debt.amount; // cents
  const value = Number(amount);
  const cents = Math.round(value * 100);
  const valid = Number.isFinite(value) && value > 0 && cents <= remaining;

  const submit = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await recordPartialPayment(debt.id, cents);
      toast.success(
        isCreditor ? "Abono registrado." : "Abono reportado. El acreedor debe confirmarlo."
      );
      onClose();
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Registrar un abono"
      description={
        isCreditor
          ? "Registras un pago parcial que recibiste. Se aplica al instante y reduce el saldo."
          : "Reportas un pago parcial que hiciste. El acreedor deberá confirmarlo antes de reducir el saldo."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} disabled={!valid} onClick={submit}>
            <Coins className="h-4 w-4" /> {isCreditor ? "Registrar abono" : "Reportar abono"}
          </Button>
        </>
      }
    >
      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm dark:bg-slate-800/60">
        <div className="flex items-center justify-between">
          <span className="text-slate-500 dark:text-slate-400">
            {debt.debtor.name} → {debt.creditor.name}
          </span>
          <span className="tabular font-semibold">{formatCurrency(remaining, debt.currency)}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">Saldo pendiente actual</p>
      </div>

      <div>
        <label className="field-label">Monto del abono ({debt.currency})</label>
        <Input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid) submit();
          }}
        />
        {amount && !valid ? (
          <p className="mt-1 text-xs text-rose-500">
            Ingresa un monto mayor a 0 y no superior al saldo ({formatCurrency(remaining, debt.currency)}).
          </p>
        ) : null}
        {valid && cents === remaining ? (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Este abono cubre el total: la deuda quedará liquidada.
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
