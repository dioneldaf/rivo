import { motion, useReducedMotion } from "motion/react";

// Living gradient mesh — slow-drifting electric/cyan/mint blobs behind the hero.
const blobs = [
  { c: "rgba(0,82,255,0.55)", pos: "left-0 top-0", size: "h-72 w-72", x: ["-12%", "10%", "-12%"], y: ["-10%", "8%", "-10%"] },
  { c: "rgba(77,124,255,0.5)", pos: "right-0 top-0", size: "h-80 w-80", x: ["12%", "-8%", "12%"], y: ["8%", "-10%", "8%"] },
  { c: "rgba(34,211,238,0.42)", pos: "left-1/3 bottom-0", size: "h-72 w-72", x: ["-8%", "12%", "-8%"], y: ["10%", "-8%", "10%"] },
  { c: "rgba(16,185,129,0.32)", pos: "right-1/4 bottom-0", size: "h-64 w-64", x: ["8%", "-12%", "8%"], y: ["-8%", "10%", "-8%"] },
];

export default function MeshGradient() {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute ${b.pos} ${b.size} rounded-full blur-3xl`}
          style={{ backgroundColor: b.c }}
          animate={reduce ? undefined : { x: b.x, y: b.y }}
          transition={{ duration: 13 + i * 2, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
