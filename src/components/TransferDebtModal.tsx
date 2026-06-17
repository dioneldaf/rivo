import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { ArrowRightLeft } from "lucide-react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Select from "./ui/Select";
import Avatar from "./ui/Avatar";
import { transferDebt } from "../lib/api";
import { useToast } from "../providers/ToastProvider";
import { formatCurrency } from "../lib/format";
import type { DebtWithUsers } from "../lib/types";

function Flow() {
  return (
    <div className="relative mx-2 h-0.5 flex-1 rounded-full bg-slate-300 dark:bg-slate-700">
      <motion.span
        className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-brand-500 shadow-glow"
        animate={{ left: ["-2%", "100%"] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function Party({ id, name, label, src }: { id: string; name: string; label: string; src?: string | null }) {
  return (
    <div className="flex w-16 shrink-0 flex-col items-center gap-1 text-center">
      <Avatar id={id} name={name} src={src} size="md" />
      <span className="max-w-full truncate text-xs font-medium">{name}</span>
      <span className="text-[10px] uppercase tracking-wide text-slate-400">{label}</span>
    </div>
  );
}

export default function TransferDebtModal({
  open,
  onClose,
  debts,
  currentUserId,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  debts: DebtWithUsers[];
  currentUserId?: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [saving, setSaving] = useState(false);

  const accepted = useMemo(() => debts.filter((d) => d.status === "accepted" && d.is_active), [debts]);
  // "Someone owes me" (I'm the creditor) and "I owe someone" (I'm the debtor).
  const fromOptions = useMemo(() => accepted.filter((d) => d.creditor_id === currentUserId), [accepted, currentUserId]);
  const toOptions = useMemo(() => accepted.filter((d) => d.debtor_id === currentUserId), [accepted, currentUserId]);

  const fromDebt = fromOptions.find((d) => d.id === fromId);
  const toDebt = toOptions.find((d) => d.id === toId);
  const sameCurrency = fromDebt && toDebt && fromDebt.currency === toDebt.currency;

  const submit = async () => {
    if (!fromId || !toId) return;
    setSaving(true);
    try {
      await transferDebt(fromId, toId);
      toast.success("Transferencia propuesta. El nuevo acreedor debe aceptarla.");
      setFromId("");
      setToId("");
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
      title="Transferir deuda"
      description="Si alguien te debe y a la vez tú le debes a un tercero, traslada la deuda. El nuevo acreedor deberá aceptar el cambio de deudor."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} disabled={!fromId || !toId || fromId === toId || !sameCurrency} onClick={submit}>
            <ArrowRightLeft className="h-4 w-4" /> Transferir
          </Button>
        </>
      }
    >
      <div>
        <label className="field-label">Deuda donde te deben a ti</label>
        <Select value={fromId} onChange={(e) => setFromId(e.target.value)}>
          <option value="">Selecciona una deuda</option>
          {fromOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.debtor.name} te debe {formatCurrency(d.amount, d.currency)}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label className="field-label">Deuda donde tú debes</label>
        <Select value={toId} onChange={(e) => setToId(e.target.value)}>
          <option value="">Selecciona una deuda</option>
          {toOptions.map((d) => (
            <option key={d.id} value={d.id}>
              Le debes {formatCurrency(d.amount, d.currency)} a {d.creditor.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Animated flow diagram */}
      {fromDebt && toDebt ? (
        !sameCurrency ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            Ambas deudas deben usar la misma moneda ({fromDebt.currency} ≠ {toDebt.currency}).
          </p>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/50"
          >
            <div className="flex items-center">
              <Party id={fromDebt.debtor.id} name={fromDebt.debtor.name} src={fromDebt.debtor.avatar_url} label="Deudor" />
              <Flow />
              <Party id={currentUserId ?? "me"} name="Tú" label="Intermediario" />
              <Flow />
              <Party id={toDebt.creditor.id} name={toDebt.creditor.name} src={toDebt.creditor.avatar_url} label="Acreedor" />
            </div>
            <p className="mt-3 text-center text-sm text-slate-600 dark:text-slate-300">
              <strong>{fromDebt.debtor.name}</strong> pasará a deberle{" "}
              <strong className="tabular">
                {formatCurrency(Math.min(fromDebt.amount, toDebt.amount), fromDebt.currency)}
              </strong>{" "}
              a <strong>{toDebt.creditor.name}</strong>
            </p>
          </motion.div>
        )
      ) : null}

      {accepted.length === 0 ? (
        <p className="text-xs text-slate-400">Necesitas deudas aceptadas para poder transferir.</p>
      ) : null}
    </Modal>
  );
}
