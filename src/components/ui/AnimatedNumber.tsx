import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { formatCurrency } from "../../lib/format";

// Animated count-up for money values, formatted per currency.
export default function AnimatedNumber({
  amount,
  currency,
  className,
}: {
  amount: number;
  currency: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  // Start at 0 so values count up on mount.
  const [display, setDisplay] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduce || fromRef.current === amount) {
      setDisplay(amount);
      fromRef.current = amount;
      return;
    }
    const from = fromRef.current;
    const to = amount;
    const duration = 650;
    let raf = 0;
    let start = 0;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amount, reduce]);

  return <span className={className}>{formatCurrency(display, currency)}</span>;
}
