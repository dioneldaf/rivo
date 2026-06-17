import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";
import Spinner from "./Spinner";

type Variant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-brand text-white shadow-glow hover:shadow-glow-lg hover:brightness-[1.04] focus-visible:ring-brand-500/50",
  secondary:
    "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 focus-visible:ring-slate-400/40 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:bg-slate-800",
  ghost:
    "text-slate-600 hover:bg-slate-100 focus-visible:ring-slate-400/40 dark:text-slate-300 dark:hover:bg-slate-800/70",
  subtle:
    "bg-slate-100 text-slate-700 hover:bg-slate-200 focus-visible:ring-slate-400/40 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:bg-slate-700/70",
  danger:
    "bg-rose-600 text-white hover:bg-rose-500 shadow-sm shadow-rose-600/25 focus-visible:ring-rose-500/50",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-xl gap-1.5",
  md: "h-10 px-4 text-sm rounded-2xl gap-2",
  lg: "h-12 px-5 text-base rounded-2xl gap-2",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
};

const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = "primary", size = "md", loading = false, fullWidth = false, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : null}
      {children}
    </button>
  );
});

export default Button;
