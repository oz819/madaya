"use client";

import { useEffect, useState } from "react";

// Adapted from 21st.dev "Circular Progress Card" (kavikatiyar) — rewritten without
// Tailwind/shadcn/framer-motion: plain SVG + a CSS transition on stroke-dashoffset.
const R = 80;
const CIRC = 2 * Math.PI * R;

export default function ProgressRing({
  label,
  value,
  total,
  color = "var(--g)",
}: {
  label: string;
  value: number;
  total: number;
  color?: string;
}) {
  const pct = total > 0 ? Math.round(Math.min(Math.max((value / total) * 100, 0), 100)) : 0;
  // Start empty, then fill on the next frame so the transition animates in.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <div className="ring-card">
      <div className="ring">
        <svg viewBox="0 0 200 200" role="img" aria-label={`${label}: ${pct}%`}>
          <g transform="rotate(-90 100 100)">
            <circle cx="100" cy="100" r={R} fill="none" stroke="#e7eeea" strokeWidth="16" />
            <circle
              cx="100"
              cy="100"
              r={R}
              fill="none"
              stroke={color}
              strokeWidth="16"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC * (1 - shown / 100)}
              style={{ transition: "stroke-dashoffset 1.2s ease-out" }}
            />
          </g>
        </svg>
        <div className="ring-text">
          <b>{total > 0 ? `${pct}%` : "—"}</b>
          <span className="muted">
            {value} / {total}
          </span>
        </div>
      </div>
      <div className="ring-label">{label}</div>
    </div>
  );
}
