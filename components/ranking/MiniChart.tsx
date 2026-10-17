"use client";

import { useState } from "react";

type Point = { label: string; value: number | null };

// One series, week by week, as a thin line with markers. Hovering or tapping a week shows its
// value. `invert` puts small numbers on top (for ranks, where 1 is best).
export default function MiniChart({
  title,
  points,
  unit = "",
  max,
  invert = false,
  color = "var(--g)",
}: {
  title: string;
  points: Point[];
  unit?: string;
  max?: number;
  invert?: boolean;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 150;
  const pad = { l: 34, r: 12, t: 14, b: 26 };
  const vals = points.map((p) => p.value).filter((v): v is number => v != null);
  const top = max ?? Math.max(1, ...vals);
  const bottom = invert ? 1 : 0;
  const span = Math.max(1, top - bottom);
  const x = (i: number) => (points.length < 2 ? (W + pad.l - pad.r) / 2 : pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1));
  const y = (v: number) => {
    const t = (v - bottom) / span;
    return invert ? pad.t + t * (H - pad.t - pad.b) : H - pad.b - t * (H - pad.t - pad.b);
  };
  const segs: string[] = [];
  let d = "";
  points.forEach((p, i) => {
    if (p.value == null) {
      if (d) segs.push(d);
      d = "";
      return;
    }
    d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
  });
  if (d) segs.push(d);
  const ticks = invert ? [1, top] : [0, top];
  const fmt = (v: number) => `${Math.round(v * 10) / 10}${unit}`;
  const shown = hover != null ? points[hover] : null;

  return (
    <figure className="mini-chart">
      <figcaption>
        <b>{title}</b>
        <span className="muted">{shown ? `${shown.label}: ${shown.value == null ? "—" : fmt(shown.value)}` : " "}</span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis-text">
              {fmt(t)}
            </text>
          </g>
        ))}
        {segs.map((p, i) => (
          <path key={i} d={p} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {points.map((p, i) =>
          p.value == null ? null : (
            <circle key={i} cx={x(i)} cy={y(p.value)} r={hover === i ? 5.5 : 4} fill={color} stroke="var(--card, #fff)" strokeWidth={2} />
          )
        )}
        {points.map((p, i) => (
          <text key={`l${i}`} x={x(i)} y={H - 8} textAnchor="middle" className="axis-text">
            {points.length <= 8 || i % Math.ceil(points.length / 8) === 0 ? p.label : ""}
          </text>
        ))}
        {/* Hit areas wider than the markers, one per week. */}
        {points.map((p, i) => (
          <rect
            key={`h${i}`}
            x={x(i) - (W - pad.l - pad.r) / Math.max(2, points.length) / 2}
            y={0}
            width={(W - pad.l - pad.r) / Math.max(2, points.length)}
            height={H}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
            onClick={() => setHover(i)}
          >
            <title>{`${p.label}: ${p.value == null ? "—" : fmt(p.value)}`}</title>
          </rect>
        ))}
      </svg>
    </figure>
  );
}
