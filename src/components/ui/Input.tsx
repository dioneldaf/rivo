import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn";

const base =
  "h-11 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-100";

const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={cn(base, className)} {...rest} />;
});

export default Input;
