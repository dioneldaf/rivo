import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { label: string };

const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton(
  { className, label, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 dark:text-slate-300 dark:hover:bg-slate-800",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export default IconButton;
