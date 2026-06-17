import type { ReactNode } from "react";
import { cn } from "./cn";

export type TabItem = { id: string; label: string; icon?: ReactNode; count?: number };

export default function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 rounded-2xl border border-slate-200/80 bg-white/60 p-1 dark:border-slate-800 dark:bg-slate-900/50">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition",
              isActive
                ? "bg-brand-600 text-white shadow-sm"
                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            )}
          >
            {t.icon}
            <span>{t.label}</span>
            {typeof t.count === "number" && t.count > 0 ? (
              <span className={cn("rounded-full px-1.5 text-xs font-semibold", isActive ? "bg-white/20" : "bg-slate-200 dark:bg-slate-700")}>
                {t.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
