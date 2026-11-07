"use client";

import { motion, useReducedMotion } from "framer-motion";

export function ScoreRing({
  value,
  label,
  size = 168,
  tone = "ink",
}: {
  value: number | null;
  label: string;
  size?: number;
  tone?: "ink" | "paper";
}) {
  const reduce = useReducedMotion();
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / 100));
  const color = tone === "paper" ? "#f4f1ea" : "#161712";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" width={size} height={size} role="img" aria-label={label}>
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeOpacity="0.12" strokeWidth="1.5" />
        <motion.circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="2.25"
          strokeLinecap="round"
          transform="rotate(-90 60 60)"
          initial={false}
          animate={{ strokeDasharray: `${c * pct} ${c}` }}
          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 80, damping: 20 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="numeric text-[4.1rem]" style={{ color }}>
            {value == null ? "—" : value}
          </div>
        </div>
      </div>
    </div>
  );
}

export function TweenNumber({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.span
      key={reduce ? value : undefined}
      className={className}
      initial={reduce ? false : { opacity: 0.4, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 28 }}
    >
      {value}
    </motion.span>
  );
}
