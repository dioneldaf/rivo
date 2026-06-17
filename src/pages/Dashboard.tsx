import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Plus, Sparkles } from "lucide-react";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Input from "../components/ui/Input";
import Skeleton from "../components/ui/Skeleton";
import EmptyState from "../components/ui/EmptyState";
import AnimatedNumber from "../components/ui/AnimatedNumber";
import { Reveal, StaggerGroup, StaggerItem, spring } from "../components/ui/motion";
import MeshGradient from "../components/dashboard/MeshGradient";
import GroupDeckCard from "../components/dashboard/GroupDeckCard";
import NotificationList from "../components/NotificationList";
import {
  createGroup,
  getBalanceSummary,
  listGroupMembersPreview,
  listGroups,
  type Balance,
} from "../lib/api";
import { emitDataChanged, onDataChanged } from "../lib/events";
import { formatCurrency } from "../lib/format";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../providers/NotificationsProvider";
import { useToast } from "../providers/ToastProvider";
import type { GroupSummary, PersonRef } from "../lib/types";

export default function DashboardPage() {
  const { profile } = useAuth();
  const { items: notifications } = useNotifications();
  const toast = useToast();
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [members, setMembers] = useState<Record<string, PersonRef[]>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [groupList, balanceList] = await Promise.all([listGroups(), getBalanceSummary()]);
      setGroups(groupList);
      setBalances(balanceList);
      setMembers(await listGroupMembersPreview(groupList.map((g) => g.id)));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
    return onDataChanged(loadData);
  }, [loadData]);

  const handleCreate = async () => {
    if (!groupName.trim()) return;
    setSaving(true);
    try {
      await createGroup(groupName);
      toast.success("Grupo creado.");
      setGroupName("");
      setCreateOpen(false);
      emitDataChanged();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const sorted = [...balances].sort(
    (a, b) => Math.abs(b.owedToMe - b.iOwe) - Math.abs(a.owedToMe - a.iOwe)
  );
  const hero = sorted[0];
  const others = sorted.slice(1);
  const heroNet = hero ? hero.owedToMe - hero.iOwe : 0;
  const total = hero ? hero.owedToMe + hero.iOwe : 0;
  const owedPct = total > 0 ? (hero!.owedToMe / total) * 100 : 0;
  const owePct = total > 0 ? (hero!.iOwe / total) * 100 : 0;

  return (
    <div className="space-y-8">
      <Reveal>
        <p className="text-sm text-slate-500 dark:text-slate-400">Hola, {profile?.name} 👋</p>
      </Reveal>

      {/* HERO SPOTLIGHT */}
      {loading ? (
        <Skeleton className="h-52 w-full rounded-4xl" />
      ) : (
        <Reveal>
          <div className="relative overflow-hidden rounded-4xl bg-slate-950 p-6 text-white shadow-glow-lg sm:p-9">
            <MeshGradient />
            <div className="grain pointer-events-none absolute inset-0 opacity-[0.18] mix-blend-overlay" />
            <div className="relative">
              {hero ? (
                <>
                  <p className="text-sm font-medium text-white/60">
                    Tu balance · {hero.currency}
                  </p>
                  <AnimatedNumber
                    amount={heroNet}
                    currency={hero.currency}
                    className="tabular mt-1 block text-[2.75rem] font-bold leading-none tracking-tight sm:text-6xl"
                  />
                  <p className="mt-2 text-sm text-white/70">
                    {heroNet > 0 ? "A tu favor en total" : heroNet < 0 ? "En contra en total" : "Estás a mano"}
                  </p>

                  {/* Meter */}
                  <div className="mt-7 max-w-xl">
                    <div className="flex h-3 w-full overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="bg-emerald-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${owedPct}%` }}
                        transition={{ ...spring, delay: 0.15 }}
                      />
                      <motion.div
                        className="bg-rose-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${owePct}%` }}
                        transition={{ ...spring, delay: 0.2 }}
                      />
                    </div>
                    <div className="mt-2.5 flex justify-between text-xs">
                      <span className="tabular text-emerald-300">↑ {formatCurrency(hero.owedToMe, hero.currency)} te deben</span>
                      <span className="tabular text-rose-300">debes {formatCurrency(hero.iOwe, hero.currency)} ↓</span>
                    </div>
                  </div>

                  {others.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {others.map((b) => {
                        const net = b.owedToMe - b.iOwe;
                        return (
                          <span
                            key={b.currency}
                            className="tabular rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs"
                          >
                            <span className="text-white/60">{b.currency}</span>{" "}
                            <span className={net >= 0 ? "text-emerald-300" : "text-rose-300"}>
                              {formatCurrency(net, b.currency)}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="flex flex-col items-start gap-2 py-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                    <Sparkles className="h-6 w-6" />
                  </span>
                  <h2 className="font-display text-3xl font-semibold">Todo en orden</h2>
                  <p className="text-sm text-white/70">No tienes deudas activas. Cuando registres una, tu balance vivirá aquí.</p>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      )}

      {/* ACTION REQUIRED */}
      {notifications.length > 0 ? (
        <Reveal>
          <div className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">
              <span className="h-2 w-2 animate-pulse-dot rounded-full bg-brand-500" />
              <p className="text-sm font-semibold">Acción requerida</p>
              <span className="ml-auto rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">
                {notifications.length}
              </span>
            </div>
            <div className="p-2">
              <NotificationList items={notifications} />
            </div>
          </div>
        </Reveal>
      ) : null}

      {/* GROUPS DECK */}
      <div>
        <Reveal className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Tus grupos</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Crear
          </Button>
        </Reveal>

        {loading ? (
          <div className="flex gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 w-72 shrink-0 rounded-3xl" />
            ))}
          </div>
        ) : groups.length ? (
          <div className="deck-fade -mx-4 px-4 sm:mx-0 sm:px-0">
            <StaggerGroup className="no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
              {groups.map((g) => (
                <StaggerItem key={g.id} className="w-[78vw] shrink-0 snap-start sm:w-72">
                  <GroupDeckCard g={g} members={members[g.id] ?? []} />
                </StaggerItem>
              ))}
            </StaggerGroup>
          </div>
        ) : (
          <EmptyState
            icon={<Plus className="h-6 w-6" />}
            title="Aún no tienes grupos"
            description="Crea un grupo para empezar a registrar deudas con tus amigos."
            action={
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Crear mi primer grupo
              </Button>
            }
          />
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Crear grupo"
        description="Dale un nombre. Serás su administrador."
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button loading={saving} disabled={!groupName.trim()} onClick={handleCreate}>
              Crear grupo
            </Button>
          </>
        }
      >
        <div>
          <label className="field-label">Nombre del grupo</label>
          <Input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Viaje a la playa"
            onKeyDown={(e) => {
              if (e.key === "Enter" && groupName.trim()) handleCreate();
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
