import type { ReactNode } from "react";
import { cn } from "./cn";

export type Tone = "neutral" | "brand" | "amber" | "emerald" | "rose" | "slate" | "sky";

const tones: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  brand: "bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200",
  slate: "bg-slate-200 text-slate-700 dark:bg-slate-700/50 dark:text-slate-200",
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200",
};

export default function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)}>
      {children}
    </span>
  );
}
