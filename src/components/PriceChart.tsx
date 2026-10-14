"use client";

import { formatPrice } from "@/lib/game";
import type { Tick } from "./usePriceStream";

export type ChartLine = { price: number; label: string; color: string; dashed?: boolean };

// A 2-minute live price line with horizontal lines for entry prices and targets,
// so you can watch whether a call is winning.
export default function PriceChart({ ticks, lines = [], height = 220 }: { ticks: Tick[]; lines?: ChartLine[]; height?: number }) {
  const W = 600;
  const H = height;
  const padR = 10, padL = 8, padT = 26, padB = 18;

  if (ticks.length < 2) {
    return (
      <div className="panel-flat flex items-center justify-center text-sm text-[var(--muted)]" style={{ height }}>
        Connecting to live prices…
      </div>
    );
  }

  const now = ticks[ticks.length - 1].t;
  // Show up to 2 minutes, but at least 30s, so a fresh chart fills the width.
  const t0 = Math.min(now - 30_000, Math.max(now - 120_000, ticks[0].t));
  const values = [...ticks.filter((t) => t.t >= t0).map((t) => t.p), ...lines.map((l) => l.price)];
  let lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || hi * 0.0005;
  lo -= span * 0.15;
  hi += span * 0.15;

  const x = (t: number) => padL + ((t - t0) / (now - t0)) * (W - padL - padR);
  const y = (p: number) => padT + (1 - (p - lo) / (hi - lo)) * (H - padT - padB);
  const pts = ticks.filter((t) => t.t >= t0).map((t) => `${x(t.t).toFixed(1)},${y(t.p).toFixed(1)}`);
  const last = ticks[ticks.length - 1];
  const path = `M${pts.join(" L")}`;
  const area = `${path} L${x(last.t).toFixed(1)},${H - padB} L${x(Math.max(t0, ticks[0].t)).toFixed(1)},${H - padB} Z`;

  return (
    <div className="panel-flat relative overflow-hidden" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={`Live price chart, now ${formatPrice(last.p)}`}>
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8b74ff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#8b74ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#chart-fill)" />
        {lines.map((l, i) => (
          <line key={i} x1={0} x2={W} y1={y(l.price)} y2={y(l.price)} stroke={l.color} strokeWidth={2.5} strokeDasharray={l.dashed ? "7 6" : undefined} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={path} fill="none" stroke="#fff5e8" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {/* Labels and the live dot are HTML so they don't stretch with the chart. */}
      {lines.map((l, i) => (
        <span
          key={i}
          className="absolute left-2 -translate-y-1/2 rounded-md border-2 border-[var(--ink)] px-1.5 text-[11px] font-black text-[var(--ink)]"
          style={{ top: `${(y(l.price) / H) * 100}%`, background: l.color }}
        >
          {l.label} ${formatPrice(l.price)}
        </span>
      ))}
      <span
        className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[var(--ink)] bg-[var(--banana)]"
        style={{ left: `${(x(last.t) / W) * 100}%`, top: `${(y(last.p) / H) * 100}%` }}
      />
    </div>
  );
}
