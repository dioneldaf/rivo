import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { ArrowUpRight, Crown, Receipt, Users } from "lucide-react";
import Avatar from "../ui/Avatar";
import Badge from "../ui/Badge";
import { springSnappy } from "../ui/motion";
import type { GroupSummary, PersonRef } from "../../lib/types";

export default function GroupDeckCard({ g, members }: { g: GroupSummary; members: PersonRef[] }) {
  const memberCount = g.group_members?.[0]?.count ?? members.length;
  const debtCount = g.debts?.[0]?.count ?? 0;

  return (
    <motion.div whileHover={{ y: -6 }} transition={springSnappy} className="h-full">
      <Link
        to={`/groups/${g.id}`}
        className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-soft transition-shadow duration-200 hover:shadow-glow dark:border-slate-800 dark:bg-slate-900"
      >
        <div className="bg-gradient-brand pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-15 blur-2xl transition-opacity duration-300 group-hover:opacity-30" />

        <div className="relative flex items-start justify-between">
          <div className="bg-gradient-brand flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-glow">
            {g.name.slice(0, 1).toUpperCase()}
          </div>
          {g.role === "admin" ? (
            <Badge tone="brand">
              <Crown className="h-3 w-3" /> Admin
            </Badge>
          ) : null}
        </div>

        <h3 className="mt-4 text-xl font-semibold leading-tight">{g.name}</h3>
        <div className="mt-1.5 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {memberCount}
          </span>
          <span className="flex items-center gap-1">
            <Receipt className="h-3.5 w-3.5" /> {debtCount} deudas
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between pt-6">
          <div className="flex -space-x-2">
            {members.slice(0, 4).map((m) => (
              <Avatar key={m.id} id={m.id} name={m.name} src={m.avatar_url} size="sm" />
            ))}
            {members.length > 4 ? (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600 ring-2 ring-white dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-900">
                +{members.length - 4}
              </span>
            ) : null}
          </div>
          <ArrowUpRight className="h-5 w-5 text-slate-300 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-600" />
        </div>
      </Link>
    </motion.div>
  );
}
