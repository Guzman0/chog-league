"use client";

import { useEffect, useState } from "react";
import { formatPrice, winPayout, type Trade } from "@/lib/game";
import { POWERS } from "@/lib/identity";
import ShareCard from "./ShareCard";

// A small tag when the Chog's power was used on a call.
function PowerTag({ t }: { t: Trade }) {
  if (!t.power) return null;
  const p = POWERS[t.power];
  return <span className="ml-1 rounded-md border-2 border-[var(--ink)] bg-[var(--sky)] px-1 text-[11px] font-black text-[var(--ink)]" title={p.long}>{p.emoji} {p.name}</span>;
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

function countdown(ms: number) {
  if (ms <= 0) return "settling…";
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Positions({ open, history, practice = false, chogName }: { open: Trade[]; history: Trade[]; practice?: boolean; chogName?: string }) {
  const now = useNow();
  if (open.length === 0 && history.length === 0) {
    return <p className="text-center text-sm text-[var(--muted)]">No calls yet. Pick Higher or Lower above and your first result shows up here.</p>;
  }

  return (
    <section className="panel">
      {open.length > 0 && (
        <>
          <h3 className="mb-1 text-xl">{practice ? "Live practice calls" : "Live calls"}</h3>
          <p className="mb-3 text-xs text-[var(--muted)]">
            🔒 Calls are locked until the 🏁 timer ends. No early exits: that keeps the odds fair for everyone, and it&apos;s why your Chog&apos;s level shows real skill.
          </p>
          <ul className="mb-5 space-y-2">
            {open.map((t) => (
              <li key={t.id} className="panel-flat flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <b className={t.direction === "up" ? "text-[var(--green)]" : "text-[var(--red)]"}>{t.direction === "up" ? "▲" : "▼"} {t.market}</b>{" "}
                  ${t.amount} at {t.multiplier}x, needs {t.direction === "up" ? "above" : "below"} ${formatPrice(t.targetPrice)}
                  <PowerTag t={t} />
                </span>
                <span className="num font-black" title="Locked until the timer ends">🔒 {countdown(t.expiresAt - now)} <span className="text-[var(--muted)]">for ${winPayout(t.amount, t.multiplier, t.power)}</span></span>
              </li>
            ))}
          </ul>
        </>
      )}
      {history.length > 0 && (
        <>
          <h3 className="mb-3 text-xl">{practice ? "Practice results" : "Results"}</h3>
          <ul className="space-y-2">
            {history.map((t) => (
              <li key={t.id} className="panel-flat flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  {t.direction === "up" ? "▲" : "▼"} {t.market} ${t.amount} at {t.multiplier}x: target ${formatPrice(t.targetPrice)}, closed ${formatPrice(t.settlePrice ?? 0)}
                  <PowerTag t={t} />
                </span>
                <span className="flex items-center gap-2">
                  <span className={`font-black ${t.status === "won" ? "text-[var(--green)]" : t.status === "lost" ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>
                    {t.status === "won" ? `Won +$${t.pnl}` : t.status === "lost" ? `Lost $${Math.abs(t.pnl ?? t.amount)}` : "Push, refunded"}
                  </span>
                  <ShareCard trade={t} chogName={chogName} label="📸" />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
