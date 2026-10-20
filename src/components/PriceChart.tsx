"use client";

import { useEffect, useState } from "react";
import { formatPrice, winPayout, type Trade } from "@/lib/game";
import type { Tick } from "./usePriceStream";

export type ChartLine = { price: number; label: string; color: string; dashed?: boolean };

function useNow(ms = 500) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export function clock(ms: number) {
  if (ms <= 0) return "0:00";
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function isWinning(t: Trade, price: number) {
  return t.direction === "up" ? price > t.targetPrice : price < t.targetPrice;
}

// The live price chart. The last 2 minutes of price on the left, and when you
// have a live call: a shaded win zone past your target, your entry, a finish
// flag counting down on the right, and your Chog riding the price line.
export default function PriceChart({
  ticks, lines = [], trades = [], avatar, height = 220,
}: {
  ticks: Tick[];
  lines?: ChartLine[];
  trades?: Trade[]; // live calls on this market
  avatar?: string | null; // the Chog's picture, shown on the live price
  height?: number;
}) {
  const now = useNow();
  const W = 600;
  const H = height;
  const padL = 8, padT = 30, padB = 22;
  const priceColW = 66; // room on the right for price labels

  if (ticks.length < 2) {
    return (
      <div className="panel-flat flex items-center justify-center text-sm text-[var(--muted)]" style={{ height }}>
        Connecting to live prices…
      </div>
    );
  }

  const last = ticks[ticks.length - 1];
  const tNow = last.t;
  const t0 = Math.min(tNow - 30_000, Math.max(tNow - 120_000, ticks[0].t));
  const shown = ticks.filter((t) => t.t >= t0);

  // With live calls, the right part of the chart is "the future": the finish flags.
  const hasCalls = trades.length > 0;
  const plotR = W - priceColW;
  const xNow = hasCalls ? padL + (plotR - padL) * 0.78 : plotR;
  const future = hasCalls ? Math.max(30_000, ...trades.map((t) => t.expiresAt - now)) * 1.08 : 1;

  const values = [...shown.map((t) => t.p), ...lines.map((l) => l.price), ...trades.flatMap((t) => [t.targetPrice, t.entryPrice])];
  let lo = Math.min(...values), hi = Math.max(...values);
  const span = hi - lo || hi * 0.0005;
  lo -= span * 0.18;
  hi += span * 0.18;

  const x = (t: number) => padL + ((t - t0) / (tNow - t0)) * (xNow - padL);
  const xFuture = (msLeft: number) => xNow + (Math.max(0, msLeft) / future) * (plotR - xNow);
  const y = (p: number) => padT + (1 - (p - lo) / (hi - lo)) * (H - padT - padB);
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  const pts = shown.map((t) => `${x(t.t).toFixed(1)},${y(t.p).toFixed(1)}`);
  const path = `M${pts.join(" L")}`;
  const area = `${path} L${xNow.toFixed(1)},${H - padB} L${x(shown[0].t).toFixed(1)},${H - padB} Z`;

  const winning = trades.filter((t) => isWinning(t, last.p)).length;
  const mood = !hasCalls ? null : winning === trades.length ? "win" : winning === 0 ? "lose" : "mixed";
  const ring = mood === "win" ? "var(--green)" : mood === "lose" ? "var(--red)" : "var(--banana)";
  const grid = [0.2, 0.4, 0.6, 0.8].map((f) => lo + (hi - lo) * f);
  const change = ((last.p - shown[0].p) / shown[0].p) * 100;

  return (
    <div className="panel-flat relative overflow-hidden !p-0 select-none" style={{ height }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" role="img" aria-label={`Live price chart, now ${formatPrice(last.p)}`}>
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8b74ff" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#8b74ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Price grid */}
        {grid.map((p, i) => (
          <line key={i} x1={0} x2={plotR} y1={y(p)} y2={y(p)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        {/* Win zones: everything past each call's target */}
        {trades.map((t) => {
          const yt = y(t.targetPrice);
          return t.direction === "up" ? (
            <rect key={`z${t.id}`} x={0} width={plotR} y={0} height={Math.max(0, yt)} fill="#4fe3a1" opacity={0.13} />
          ) : (
            <rect key={`z${t.id}`} x={0} width={plotR} y={yt} height={Math.max(0, H - yt)} fill="#ff5e7e" opacity={0.13} />
          );
        })}
        {/* The future */}
        {hasCalls && (
          <>
            <rect x={xNow} width={plotR - xNow} y={0} height={H} fill="rgba(255,255,255,0.035)" />
            <line x1={xNow} x2={xNow} y1={0} y2={H} stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} strokeDasharray="4 5" vectorEffect="non-scaling-stroke" />
          </>
        )}
        <path d={area} fill="url(#chart-fill)" />
        {/* Entry (dotted) and target (solid) for each live call */}
        {trades.map((t) => (
          <g key={`l${t.id}`}>
            <line x1={x(Math.max(t0, t.openedAt))} x2={plotR} y1={y(t.entryPrice)} y2={y(t.entryPrice)} stroke="rgba(255,245,232,0.55)" strokeWidth={1.5} strokeDasharray="2 5" vectorEffect="non-scaling-stroke" />
            <line x1={0} x2={plotR} y1={y(t.targetPrice)} y2={y(t.targetPrice)} stroke={t.direction === "up" ? "var(--green)" : "var(--red)"} strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
            <line x1={xFuture(t.expiresAt - now)} x2={xFuture(t.expiresAt - now)} y1={0} y2={H} stroke={t.direction === "up" ? "var(--green)" : "var(--red)"} strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {lines.map((l, i) => (
          <line key={i} x1={0} x2={plotR} y1={y(l.price)} y2={y(l.price)} stroke={l.color} strokeWidth={2.5} strokeDasharray={l.dashed ? "7 6" : undefined} vectorEffect="non-scaling-stroke" />
        ))}
        <path d={path} fill="none" stroke="#fff5e8" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {/* Line from the live price to the right edge, so you can compare it with the labels */}
        <line x1={xNow} x2={plotR} y1={y(last.p)} y2={y(last.p)} stroke="var(--banana)" strokeWidth={1.5} strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
      </svg>

      {/* Everything below is HTML so it doesn't stretch with the chart. */}
      {grid.map((p, i) => (
        <span key={i} className="num absolute right-1.5 -translate-y-1/2 text-[10px] font-bold text-[var(--muted)]" style={{ top: pct(y(p), H) }}>
          {formatPrice(p)}
        </span>
      ))}
      <span
        className="num absolute right-1 z-10 -translate-y-1/2 rounded-md border-2 border-[var(--ink)] bg-[var(--banana)] px-1 text-[10px] font-black text-[var(--ink)]"
        style={{ top: pct(y(last.p), H) }}
      >
        {formatPrice(last.p)}
      </span>

      {/* Top row: change and the data source */}
      <div className="absolute left-2 right-2 top-1.5 flex items-center justify-between gap-2 text-[11px] font-black">
        <span className={change >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(3)}% <span className="font-bold text-[var(--muted)]">last {Math.round((tNow - t0) / 60000) || 1} min</span>
        </span>
        <a
          href="https://www.coinbase.com/price"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 rounded-full border-2 border-[var(--ink)] bg-[var(--panel-2)] px-2 py-0.5 text-[10px] text-[var(--text)]"
          title="Real prices, live from Coinbase. Results use Coinbase's 1-minute closing price."
        >
          <span className="live-dot h-2 w-2 rounded-full bg-[var(--green)]" /> LIVE · Prices by Coinbase
        </a>
      </div>

      {lines.map((l, i) => (
        <span
          key={i}
          className="absolute left-2 -translate-y-1/2 rounded-md border-2 border-[var(--ink)] px-1.5 text-[11px] font-black text-[var(--ink)]"
          style={{ top: pct(y(l.price), H), background: l.color }}
        >
          {l.label} ${formatPrice(l.price)}
        </span>
      ))}
      {trades.map((t) => (
        <span
          key={`tl${t.id}`}
          className="absolute left-2 -translate-y-1/2 rounded-md border-2 border-[var(--ink)] px-1.5 text-[11px] font-black text-[var(--ink)]"
          style={{ top: pct(y(t.targetPrice), H), background: t.direction === "up" ? "var(--green)" : "var(--red)" }}
        >
          {t.direction === "up" ? "▲ win above" : "▼ win below"} ${formatPrice(t.targetPrice)}
        </span>
      ))}
      {/* Finish flags */}
      {trades.map((t) => (
        <span
          key={`f${t.id}`}
          className="num absolute bottom-1 -translate-x-1/2 whitespace-nowrap rounded-md border-2 border-[var(--ink)] bg-[var(--text)] px-1 text-[10px] font-black text-[var(--ink)]"
          style={{ left: pct(xFuture(t.expiresAt - now), W) }}
          title="When this call ends"
        >
          🏁 {clock(t.expiresAt - now)}
        </span>
      ))}

      {/* The Chog riding the price */}
      {avatar ? (
        <span
          className={`absolute z-10 h-8 w-8 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-[3px] bg-[var(--panel-2)] ${mood ? "chart-chog" : ""}`}
          style={{ left: pct(xNow, W), top: pct(y(last.p), H), borderColor: ring, boxShadow: mood ? `0 0 0 3px var(--ink), 0 0 14px ${ring}` : "0 0 0 3px var(--ink)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatar} alt="" className="h-full w-full object-cover" />
        </span>
      ) : (
        <span
          className="absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[var(--ink)] bg-[var(--banana)]"
          style={{ left: pct(xNow, W), top: pct(y(last.p), H) }}
        />
      )}
      {mood && (
        <span className="absolute z-10 -translate-y-[150%] text-lg" style={{ left: `calc(${pct(xNow, W)} + 12px)`, top: pct(y(last.p), H) }} aria-hidden="true">
          {mood === "win" ? "😎" : mood === "lose" ? "😬" : "🤞"}
        </span>
      )}
    </div>
  );
}

// Under the chart: one line per live call saying whether it's winning right now.
export function CallStatus({ trades, price }: { trades: Trade[]; price: number | null }) {
  const now = useNow();
  if (!trades.length || !price) return null;
  return (
    <ul className="mt-2 space-y-1.5">
      {trades.map((t) => {
        const ok = isWinning(t, price);
        const gap = Math.abs(t.targetPrice - price);
        return (
          <li
            key={t.id}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--ink)] px-3 py-1.5 text-sm font-extrabold ${ok ? "bg-[var(--green)] text-[var(--ink)]" : "bg-[var(--panel-2)]"}`}
          >
            <span>
              {t.direction === "up" ? "▲" : "▼"} {t.market} ${t.amount} at {t.multiplier}x:{" "}
              {ok ? (
                <b>winning! Stay {t.direction === "up" ? "above" : "below"} ${formatPrice(t.targetPrice)}</b>
              ) : (
                <span>
                  needs {t.direction === "up" ? "+" : "−"}${gap >= 1 ? gap.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : formatPrice(gap)} {t.direction === "up" ? "higher" : "lower"}
                </span>
              )}
            </span>
            <span className="num">
              🏁 {clock(t.expiresAt - now)} · {ok ? `+$${Math.round((winPayout(t.amount, t.multiplier, t.power) - t.amount) * 100) / 100}` : `$${t.amount} at stake`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
