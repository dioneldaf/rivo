import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

const CelebrateContext = createContext<() => void>(() => {});

export function useCelebrate() {
  return useContext(CelebrateContext);
}

const COLORS = ["#0052ff", "#4d7cff", "#22d3ee", "#10b981", "#f59e0b", "#f43f5e"];
const PIECES = Array.from({ length: 20 });

export default function CelebrateProvider({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  const [burst, setBurst] = useState<number | null>(null);
  const idRef = useRef(0);

  const celebrate = useCallback(() => {
    if (reduce) return;
    const id = ++idRef.current;
    setBurst(id);
    window.setTimeout(() => setBurst((cur) => (cur === id ? null : cur)), 1100);
  }, [reduce]);

  return (
    <CelebrateContext.Provider value={celebrate}>
      {children}
      <AnimatePresence>
        {burst !== null ? (
          <div key={burst} className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center">
            {PIECES.map((_, i) => {
              const angle = (i / PIECES.length) * Math.PI * 2;
              const dist = 130 + (i % 5) * 28;
              return (
                <motion.span
                  key={i}
                  className="absolute h-2.5 w-2.5 rounded-[2px]"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  initial={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
                  animate={{
                    opacity: 0,
                    x: Math.cos(angle) * dist,
                    y: Math.sin(angle) * dist + 50,
                    scale: 0.5,
                    rotate: (i % 2 ? 1 : -1) * 200,
                  }}
                  transition={{ duration: 0.95, ease: "easeOut" }}
                />
              );
            })}
          </div>
        ) : null}
      </AnimatePresence>
    </CelebrateContext.Provider>
  );
}
