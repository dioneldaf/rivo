import { useState } from "react";
import { cn } from "./cn";
import { initials } from "../../lib/format";

// Per-user gradient fills for distinctive, depth-y avatars.
const palette = [
  "bg-gradient-to-br from-rose-500 to-pink-500",
  "bg-gradient-to-br from-amber-500 to-orange-500",
  "bg-gradient-to-br from-emerald-500 to-teal-500",
  "bg-gradient-to-br from-sky-500 to-blue-500",
  "bg-gradient-to-br from-brand-600 to-electric",
  "bg-gradient-to-br from-violet-500 to-fuchsia-500",
  "bg-gradient-to-br from-teal-500 to-cyan-500",
  "bg-gradient-to-br from-indigo-500 to-blue-500",
];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

const sizes = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-20 w-20 text-2xl",
};

export default function Avatar({
  name,
  id,
  size = "md",
  src,
  className,
}: {
  name: string;
  id: string;
  size?: "sm" | "md" | "lg" | "xl";
  src?: string | null;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  const showImage = Boolean(src) && !broken;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-sm ring-2 ring-white/70 dark:ring-slate-900/70",
        showImage ? "bg-slate-200 dark:bg-slate-700" : colorFor(id || name),
        sizes[size],
        className
      )}
    >
      {showImage ? (
        <img
          src={src as string}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
