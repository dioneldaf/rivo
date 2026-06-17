import { useMemo, useState } from "react";
import Modal from "./ui/Modal";
import Button from "./ui/Button";
import Input from "./ui/Input";
import Select from "./ui/Select";
import { cn } from "./ui/cn";
import { createDebt } from "../lib/api";
import { useToast } from "../providers/ToastProvider";
import type { Member } from "../lib/types";

export default function CreateDebtModal({
  open,
  onClose,
  groupId,
  members,
  currentUserId,
  currencies,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  members: Member[];
  currentUserId?: string;
  currencies: string[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [iAmDebtor, setIAmDebtor] = useState(false);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(currencies[0] ?? "");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const others = useMemo(() => members.filter((m) => m.id !== currentUserId), [members, currentUserId]);
  const noCurrencies = currencies.length === 0;

  const reset = () => {
    setIAmDebtor(false);
    setCounterpartyId("");
    setAmount("");
    setCurrency(currencies[0] ?? "");
    setDescription("");
  };

  const submit = async () => {
    const value = Number(amount);
    const cur = currency || currencies[0];
    if (!counterpartyId || !cur || !Number.isFinite(value) || value <= 0) return;
    setSaving(true);
    try {
      await createDebt({ groupId, counterpartyId, amount: Math.round(value * 100), currency: cur, iAmDebtor, description });
      toast.success(iAmDebtor ? "Deuda registrada." : "Deuda creada. La otra persona debe aceptarla.");
      reset();
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
      title="Registrar una deuda"
      description={
        iAmDebtor
          ? "Declaras que tú le debes a alguien. Se registra al instante, sin confirmación."
          : "Registras lo que alguien te debe. Esa persona deberá aceptarla."
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={saving} disabled={noCurrencies || !counterpartyId || !amount} onClick={submit}>
            {iAmDebtor ? "Registrar deuda" : "Enviar deuda"}
          </Button>
        </>
      }
    >
      {noCurrencies ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          Este grupo aún no tiene monedas. Un administrador debe crear al menos una en <strong>Ajustes</strong> antes de registrar deudas.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-slate-200/80 bg-slate-100/60 p-1 dark:border-slate-800 dark:bg-slate-900/50">
        {[
          { v: false, label: "Alguien me debe" },
          { v: true, label: "Yo debo" },
        ].map((opt) => (
          <button
            key={String(opt.v)}
            onClick={() => setIAmDebtor(opt.v)}
            className={cn(
              "rounded-xl py-2 text-sm font-medium transition",
              iAmDebtor === opt.v ? "bg-white shadow-sm dark:bg-slate-800" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div>
        <label className="field-label">{iAmDebtor ? "¿A quién le debes?" : "¿Quién te debe?"}</label>
        <Select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)} disabled={noCurrencies}>
          <option value="">Selecciona a la persona</option>
          {others.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} (@{m.username})
            </option>
          ))}
        </Select>
        {others.length === 0 ? (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Invita a más personas al grupo para registrar deudas.</p>
        ) : null}
      </div>

      <div className="grid grid-cols-[1fr_130px] gap-3">
        <div>
          <label className="field-label">Monto</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            disabled={noCurrencies}
          />
        </div>
        <div>
          <label className="field-label">Moneda</label>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={noCurrencies}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <label className="field-label">
          Descripción <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value.slice(0, 140))}
          placeholder="¿De qué es esta deuda? Ej. cena, taxi, entradas…"
          maxLength={140}
          disabled={noCurrencies}
        />
        <p className="mt-1 text-right text-xs text-slate-400">{description.length}/140</p>
      </div>
    </Modal>
  );
}
