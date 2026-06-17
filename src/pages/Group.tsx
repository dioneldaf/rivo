import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRightLeft,
  Bell,
  Combine,
  Crown,
  LogOut,
  Plus,
  Receipt,
  Settings,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Card from "../components/ui/Card";
import Badge from "../components/ui/Badge";
import Avatar from "../components/ui/Avatar";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import Tabs from "../components/ui/Tabs";
import { type DebtActions } from "../components/DebtCard";
import CreateDebtModal from "../components/CreateDebtModal";
import TransferDebtModal from "../components/TransferDebtModal";
import PartialPaymentModal from "../components/PartialPaymentModal";
import InviteModal from "../components/InviteModal";
import Modal from "../components/ui/Modal";
import { AVAILABLE_CURRENCIES, currencyLabel } from "../lib/currencies";
import {
  acceptDebt,
  acceptTransfer,
  confirmDeleteDebt,
  confirmSettlement,
  deleteDebt,
  deleteGroup,
  getGroup,
  leaveGroup,
  listDebtPayments,
  listDebts,
  listMembers,
  mergeDebts,
  nudgeDebtor,
  rejectDebt,
  rejectDeleteDebt,
  rejectSettlement,
  rejectTransfer,
  removeMember,
  renameGroup,
  setGroupCurrencies,
  setMemberRole,
  settleDebt,
} from "../lib/api";
import { emitDataChanged, onDataChanged } from "../lib/events";
import { formatCurrency } from "../lib/format";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../providers/ToastProvider";
import { useConfirm } from "../providers/ConfirmProvider";
import { cn } from "../components/ui/cn";
import { Reveal } from "../components/ui/motion";
import MeshGradient from "../components/dashboard/MeshGradient";
import DebtLedger from "../components/DebtLedger";
import NotificationList from "../components/NotificationList";
import { useNotifications } from "../providers/NotificationsProvider";
import { useCelebrate } from "../providers/CelebrateProvider";
import type { DebtPayment, DebtWithUsers, Group, Member } from "../lib/types";

export default function GroupPage() {
  const { groupId } = useParams();
  const { user, profile } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const celebrate = useCelebrate();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [debts, setDebts] = useState<DebtWithUsers[]>([]);
  const [payments, setPayments] = useState<Record<string, DebtPayment[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("debts");

  const [createOpen, setCreateOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [payDebtId, setPayDebtId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [busyDebt, setBusyDebt] = useState<string | null>(null);
  const [nudgeDebtId, setNudgeDebtId] = useState<string | null>(null);
  const [busyMerge, setBusyMerge] = useState(false);

  const [nameDraft, setNameDraft] = useState("");
  const [currencyDraft, setCurrencyDraft] = useState<string[]>([]);
  const [currencyInput, setCurrencyInput] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const addCurrency = (raw: string) => {
    const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!code) return;
    setCurrencyDraft((prev) => (prev.includes(code) ? prev : [...prev, code]));
    setCurrencyInput("");
  };

  const load = useCallback(async () => {
    if (!groupId) return;
    try {
      const [g, m, d] = await Promise.all([getGroup(groupId), listMembers(groupId), listDebts(groupId)]);
      setGroup(g);
      setMembers(m);
      setDebts(d);
      setPayments(await listDebtPayments(d.map((x) => x.id)));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [groupId, toast]);

  useEffect(() => {
    load();
    return onDataChanged(load);
  }, [load]);

  useEffect(() => {
    if (group) {
      setNameDraft(group.name);
      setCurrencyDraft(group.currencies);
    }
  }, [group]);

  const myRole = useMemo(() => members.find((m) => m.id === user?.id)?.role, [members, user?.id]);
  const isAdmin = myRole === "admin";
  const pendingForMe = useMemo(
    () =>
      debts.filter(
        (d) =>
          (d.status === "pending" && d.debtor_id === user?.id) ||
          (d.status === "settle_requested" && d.creditor_id === user?.id) ||
          (d.status === "transfer_pending" && d.creditor_id === user?.id)
      ).length,
    [debts, user?.id]
  );

  // Pending actions that belong to THIS group (also shown on the dashboard).
  const { items: allNotifications } = useNotifications();
  const groupNotifications = useMemo(
    () => allNotifications.filter((n) => n.groupId === groupId),
    [allNotifications, groupId]
  );

  // The "timbre" reminder phrases the creditor defined in their profile.
  const DEFAULT_NUDGE = "Oye, ¿te acuerdas de la deuda? 🙂";
  const nudgePhrases = useMemo(() => (profile?.nudge_phrases ?? []).filter(Boolean), [profile?.nudge_phrases]);

  // Sets of 2+ accepted, active debts with the same parties + currency (and no
  // pending payment) that the current user is part of -> can be merged into one.
  const mergeable = useMemo(() => {
    const map = new Map<string, DebtWithUsers[]>();
    for (const d of debts) {
      if (d.status !== "accepted" || !d.is_active) continue;
      if (d.creditor_id !== user?.id && d.debtor_id !== user?.id) continue;
      const key = `${d.creditor_id}|${d.debtor_id}|${d.currency}`;
      const arr = map.get(key) ?? [];
      arr.push(d);
      map.set(key, arr);
    }
    return [...map.values()].filter(
      (set) => set.length >= 2 && set.every((d) => !payments[d.id]?.some((p) => p.status === "pending"))
    );
  }, [debts, payments, user?.id]);

  /* ----- debt actions ----- */
  const debtAct = async (id: string, fn: () => Promise<void>, ok: string, celebrateOnDone = false) => {
    setBusyDebt(id);
    try {
      await fn();
      toast.success(ok);
      if (celebrateOnDone) celebrate();
      emitDataChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyDebt(null);
    }
  };

  const sendNudge = async (debtId: string, message: string) => {
    setNudgeDebtId(null);
    try {
      await nudgeDebtor(debtId, message);
      toast.success("Toque enviado 🔔");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleNudge = (debtId: string) => {
    // 0 phrases -> a default; exactly 1 -> send it; 2+ -> let the user pick.
    if (nudgePhrases.length > 1) setNudgeDebtId(debtId);
    else sendNudge(debtId, nudgePhrases[0] ?? DEFAULT_NUDGE);
  };

  const handleMerge = async (set: DebtWithUsers[]) => {
    const total = set.reduce((s, d) => s + d.amount, 0);
    const ok = await confirm({
      title: "Fusionar deudas",
      description: `Se combinarán ${set.length} deudas en una sola de ${formatCurrency(total, set[0].currency)}. La otra persona será notificada.`,
      confirmLabel: "Fusionar",
    });
    if (!ok) return;
    setBusyMerge(true);
    try {
      await mergeDebts(set.map((d) => d.id));
      toast.success("Deudas fusionadas");
      emitDataChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyMerge(false);
    }
  };

  const actions: DebtActions = {
    onAccept: (id) => debtAct(id, () => acceptDebt(id), "Deuda aceptada"),
    onReject: async (id) => {
      if (await confirm({ title: "Rechazar deuda", description: "La deuda quedará descartada.", danger: true, confirmLabel: "Rechazar" })) {
        debtAct(id, () => rejectDebt(id), "Deuda rechazada");
      }
    },
    onSettle: async (id) => {
      if (await confirm({ title: "Marcar como pagada", description: "Si eres el acreedor se liquida; si eres el deudor, el acreedor deberá confirmarla." })) {
        // Settling as the creditor finalizes the debt -> celebrate.
        const debt = debts.find((x) => x.id === id);
        debtAct(id, () => settleDebt(id), "Hecho", debt?.creditor_id === user?.id);
      }
    },
    onPay: (id) => setPayDebtId(id),
    onConfirm: (id) => debtAct(id, () => confirmSettlement(id), "Pago confirmado", true),
    onRejectSettle: async (id) => {
      if (await confirm({ title: "Rechazar pago", description: "La deuda volverá a quedar como aceptada (no pagada).", danger: true, confirmLabel: "Rechazar" })) {
        debtAct(id, () => rejectSettlement(id), "Pago rechazado");
      }
    },
    onAcceptTransfer: async (id) => {
      if (await confirm({ title: "Aceptar transferencia", description: "Aceptas que esta persona pase a ser tu deudor. Las deudas originales se ajustarán." })) {
        debtAct(id, () => acceptTransfer(id), "Transferencia aceptada", true);
      }
    },
    onRejectTransfer: async (id) => {
      if (await confirm({ title: "Rechazar transferencia", description: "La propuesta se descarta y las deudas originales quedan intactas.", danger: true, confirmLabel: "Rechazar" })) {
        debtAct(id, () => rejectTransfer(id), "Transferencia rechazada");
      }
    },
    onDelete: async (id) => {
      const debt = debts.find((x) => x.id === id);
      if (!debt) return;
      const iAmCreditor = debt.creditor_id === user?.id;
      const isPending = debt.status === "pending";
      const description = isPending
        ? "Se cancelará esta deuda pendiente."
        : iAmCreditor
          ? "La deuda se eliminará por completo (la perdonas). Esta acción no se puede deshacer."
          : "El acreedor deberá confirmar la eliminación antes de que desaparezca.";
      if (
        await confirm({
          title: "Eliminar deuda",
          description,
          danger: true,
          confirmLabel: iAmCreditor || isPending ? "Eliminar" : "Solicitar eliminación",
        })
      ) {
        debtAct(id, () => deleteDebt(id), iAmCreditor || isPending ? "Deuda eliminada" : "Solicitud enviada");
      }
    },
    onConfirmDelete: async (id) => {
      if (await confirm({ title: "Eliminar deuda", description: "Se eliminará por completo. Esta acción no se puede deshacer.", danger: true, confirmLabel: "Eliminar" })) {
        debtAct(id, () => confirmDeleteDebt(id), "Deuda eliminada");
      }
    },
    onRejectDelete: (id) => debtAct(id, () => rejectDeleteDebt(id), "Eliminación rechazada"),
    onNudge: (id) => handleNudge(id),
  };

  /* ----- admin / member actions ----- */
  const runAdmin = async (fn: () => Promise<void>, ok: string) => {
    try {
      await fn();
      toast.success(ok);
      emitDataChanged();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleRename = async () => {
    if (!groupId || !nameDraft.trim()) return;
    setSavingSettings(true);
    await runAdmin(() => renameGroup(groupId, nameDraft), "Grupo renombrado");
    setSavingSettings(false);
  };

  const handleSaveCurrencies = async () => {
    if (!groupId || currencyDraft.length === 0) return;
    setSavingSettings(true);
    await runAdmin(() => setGroupCurrencies(groupId, currencyDraft), "Monedas actualizadas");
    setSavingSettings(false);
  };

  const handleDelete = async () => {
    if (!groupId) return;
    if (await confirm({ title: "Eliminar grupo", description: "Se borrarán todas sus deudas e historial. Esta acción no se puede deshacer.", danger: true, confirmLabel: "Eliminar grupo" })) {
      await runAdmin(() => deleteGroup(groupId), "Grupo eliminado");
      navigate("/");
    }
  };

  const handleLeave = async () => {
    if (!groupId) return;
    if (await confirm({ title: "Salir del grupo", description: "Dejarás de ver este grupo y sus deudas.", danger: true, confirmLabel: "Salir" })) {
      await runAdmin(() => leaveGroup(groupId), "Saliste del grupo");
      navigate("/");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-12 w-full" />
        <Card>
          <Skeleton className="h-20 w-full" />
        </Card>
      </div>
    );
  }

  if (!group) {
    return (
      <EmptyState title="Grupo no encontrado" description="Puede que ya no tengas acceso a este grupo." action={<Link to="/"><Button>Volver</Button></Link>} />
    );
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <div className="relative overflow-hidden rounded-4xl bg-slate-950 p-6 text-white shadow-glow-lg sm:p-8">
          <MeshGradient />
          <div className="grain pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay" />
          <div className="relative">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-white/70 transition hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Volver
            </Link>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="font-display text-3xl font-semibold sm:text-4xl">{group.name}</h1>
                  {isAdmin ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold backdrop-blur">
                      <Crown className="h-3 w-3" /> Admin
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-white/60">
                  {members.length} miembros · {group.currencies.length ? group.currencies.join(", ") : "sin monedas"}
                </p>
                {members.length ? (
                  <div className="mt-3 flex -space-x-2">
                    {members.slice(0, 6).map((m) => (
                      <Avatar key={m.id} id={m.id} name={m.name} src={m.avatar_url} size="sm" />
                    ))}
                    {members.length > 6 ? (
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-xs font-semibold ring-2 ring-slate-950">
                        +{members.length - 6}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setTransferOpen(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20 active:scale-[0.97]"
                >
                  <ArrowRightLeft className="h-4 w-4" /> Transferir
                </button>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" /> Registrar deuda
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Reveal>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "debts", label: "Deudas", icon: <Receipt className="h-4 w-4" />, count: pendingForMe },
          { id: "members", label: "Miembros", icon: <Users className="h-4 w-4" /> },
          ...(isAdmin ? [{ id: "settings", label: "Ajustes", icon: <Settings className="h-4 w-4" /> }] : []),
        ]}
      />

      {/* DEBTS TAB */}
      {tab === "debts" ? (
        <>
          {groupNotifications.length > 0 ? (
            <div className="mb-5 rounded-3xl border border-amber-200/70 bg-amber-50/60 p-4 dark:border-amber-500/20 dark:bg-amber-500/[0.06]">
              <div className="mb-1 flex items-center gap-2 px-1">
                <Bell className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <p className="text-sm font-semibold">Acciones requeridas en este grupo</p>
              </div>
              <NotificationList items={groupNotifications} />
            </div>
          ) : null}
          {mergeable.length > 0 ? (
            <div className="mb-5 rounded-3xl border border-brand-200/70 bg-brand-50/60 p-4 dark:border-brand-500/20 dark:bg-brand-500/[0.06]">
              <div className="mb-2 flex items-center gap-2 px-1">
                <Combine className="h-4 w-4 text-brand-600 dark:text-brand-300" />
                <p className="text-sm font-semibold">Puedes simplificar deudas</p>
              </div>
              <div className="space-y-2">
                {mergeable.map((set) => {
                  const iAmCreditor = set[0].creditor_id === user?.id;
                  const other = iAmCreditor ? set[0].debtor : set[0].creditor;
                  const total = set.reduce((s, d) => s + d.amount, 0);
                  return (
                    <div
                      key={set.map((d) => d.id).join("-")}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/70 px-3 py-2 dark:bg-slate-900/50"
                    >
                      <p className="min-w-0 text-sm">
                        <span className="font-medium">{set.length} deudas</span>{" "}
                        <span className="text-slate-500 dark:text-slate-400">
                          {iAmCreditor ? `de ${other.name}` : `con ${other.name}`} · {formatCurrency(total, set[0].currency)}
                        </span>
                      </p>
                      <Button size="sm" variant="secondary" disabled={busyMerge} onClick={() => handleMerge(set)}>
                        <Combine className="h-4 w-4" /> Fusionar
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {group.currencies.length === 0 ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              <span>
                {isAdmin
                  ? "Este grupo aún no tiene monedas. Agrégalas para poder registrar deudas."
                  : "El administrador aún no ha configurado monedas para registrar deudas."}
              </span>
              {isAdmin ? (
                <Button size="sm" variant="secondary" onClick={() => setTab("settings")}>
                  <Settings className="h-4 w-4" /> Ir a Ajustes
                </Button>
              ) : null}
            </div>
          ) : null}
          {debts.length ? (
          <DebtLedger debts={debts} payments={payments} currentUserId={user?.id} actions={actions} busyId={busyDebt} />
        ) : (
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title="Sin deudas todavía"
            description="Registra una deuda: tú eres el acreedor y la otra persona deberá aceptarla."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Registrar deuda
              </Button>
            }
          />
          )}
        </>
      ) : null}

      {/* MEMBERS TAB */}
      {tab === "members" ? (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> Invitar
            </Button>
          </div>
          <Card className="!p-2">
            {members.map((m) => {
              const isMe = m.id === user?.id;
              return (
                <div key={m.id} className="flex items-center justify-between gap-3 rounded-2xl p-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/60">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar id={m.id} name={m.name} src={m.avatar_url} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {m.name} {isMe ? <span className="text-slate-400">(tú)</span> : null}
                      </p>
                      <p className="truncate text-xs text-slate-400">@{m.username}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.role === "admin" ? (
                      <Badge tone="brand">
                        <Crown className="h-3 w-3" /> Admin
                      </Badge>
                    ) : (
                      <Badge tone="neutral">Miembro</Badge>
                    )}
                    {isAdmin && !isMe ? (
                      <>
                        {m.role === "admin" ? (
                          <Button size="sm" variant="ghost" onClick={() => runAdmin(() => setMemberRole(group.id, m.id, "member"), "Rol actualizado")}>
                            Quitar admin
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => runAdmin(() => setMemberRole(group.id, m.id, "admin"), "Ahora es admin")}>
                            <ShieldCheck className="h-4 w-4" /> Hacer admin
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-rose-600 dark:text-rose-400"
                          onClick={async () => {
                            if (await confirm({ title: `Quitar a ${m.name}`, description: "Dejará de pertenecer al grupo.", danger: true, confirmLabel: "Quitar" })) {
                              runAdmin(() => removeMember(group.id, m.id), "Miembro eliminado");
                            }
                          }}
                        >
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </Card>
          <div className="flex justify-center pt-2">
            <Button variant="ghost" className="text-rose-600 dark:text-rose-400" onClick={handleLeave}>
              <LogOut className="h-4 w-4" /> Salir del grupo
            </Button>
          </div>
        </div>
      ) : null}

      {/* SETTINGS TAB (admins only) */}
      {tab === "settings" && isAdmin ? (
        <div className="space-y-4">
          <Card>
            <h3 className="text-base font-semibold">Nombre del grupo</h3>
            <div className="mt-3 flex gap-2">
              <Input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} />
              <Button loading={savingSettings} disabled={!nameDraft.trim() || nameDraft === group.name} onClick={handleRename}>
                Guardar
              </Button>
            </div>
          </Card>

          <Card>
            <h3 className="text-base font-semibold">Monedas del grupo</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Tú creas las monedas que acepta el grupo. Las deudas solo podrán usar estas.
            </p>

            <div className="mt-4 flex min-h-[2.75rem] flex-wrap items-center gap-2 rounded-2xl border border-slate-200 p-2 dark:border-slate-700">
              {currencyDraft.length === 0 ? (
                <span className="px-2 text-sm text-slate-400">Sin monedas todavía</span>
              ) : (
                currencyDraft.map((code) => (
                  <span key={code} className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-sm font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                    {code}
                    <button
                      onClick={() => setCurrencyDraft((prev) => prev.filter((x) => x !== code))}
                      className="text-brand-500 transition hover:text-brand-700 dark:hover:text-brand-100"
                      aria-label={`Quitar ${code}`}
                    >
                      ×
                    </button>
                  </span>
                ))
              )}
            </div>

            <div className="mt-3 flex gap-2">
              <Input
                value={currencyInput}
                onChange={(e) => setCurrencyInput(e.target.value.toUpperCase())}
                placeholder="Código (ej. USD, MXN, BTC)"
                maxLength={8}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCurrency(currencyInput);
                  }
                }}
              />
              <Button variant="secondary" disabled={!currencyInput.trim()} onClick={() => addCurrency(currencyInput)}>
                Agregar
              </Button>
            </div>

            {AVAILABLE_CURRENCIES.some((c) => !currencyDraft.includes(c.code)) ? (
              <div className="mt-3">
                <p className="text-xs text-slate-400">Sugerencias</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {AVAILABLE_CURRENCIES.filter((c) => !currencyDraft.includes(c.code)).map((c) => (
                    <button
                      key={c.code}
                      title={currencyLabel(c.code)}
                      onClick={() => addCurrency(c.code)}
                      className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition hover:border-brand-400 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300"
                    >
                      + {c.code}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex justify-end">
              <Button loading={savingSettings} disabled={currencyDraft.length === 0} onClick={handleSaveCurrencies}>
                Guardar monedas
              </Button>
            </div>
          </Card>

          <Card className="border-rose-200 dark:border-rose-500/30">
            <h3 className="text-base font-semibold text-rose-600 dark:text-rose-400">Zona de peligro</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Eliminar el grupo borra todas sus deudas e historial.
            </p>
            <div className="mt-4">
              <Button variant="danger" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" /> Eliminar grupo
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      <CreateDebtModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        groupId={group.id}
        members={members}
        currentUserId={user?.id}
        currencies={group.currencies}
        onDone={emitDataChanged}
      />
      <TransferDebtModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        debts={debts}
        currentUserId={user?.id}
        onDone={emitDataChanged}
      />
      <PartialPaymentModal
        open={!!payDebtId}
        onClose={() => setPayDebtId(null)}
        debt={debts.find((d) => d.id === payDebtId) ?? null}
        currentUserId={user?.id}
        onDone={emitDataChanged}
      />
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} groupId={group.id} onDone={emitDataChanged} />

      <Modal
        open={!!nudgeDebtId}
        onClose={() => setNudgeDebtId(null)}
        title="¿Qué recordatorio envías?"
        description="Se enviará como notificación al deudor."
        size="sm"
      >
        <div className="space-y-2">
          {nudgePhrases.map((phrase, i) => (
            <button
              key={i}
              onClick={() => nudgeDebtId && sendNudge(nudgeDebtId, phrase)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-left text-sm transition hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:hover:border-brand-500 dark:hover:bg-brand-500/10"
            >
              {phrase}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}
