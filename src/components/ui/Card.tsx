import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export default function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("card p-5 sm:p-6", className)} {...rest} />;
}
