"use client";

import { useEffect, useState } from "react";
import { formatPrice, payoutIfWin, type Trade } from "@/lib/game";

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

export default function Positions({ open, history, practice = false }: { open: Trade[]; history: Trade[]; practice?: boolean }) {
  const now = useNow();
  if (open.length === 0 && history.length === 0) return null;

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      {open.length > 0 && (
        <>
          <h3 className="mb-3 text-lg font-bold">{practice ? "Open practice trades" : "Open"}</h3>
          <ul className="mb-6 space-y-2">
            {open.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-lg border border-[var(--line)] p-3 text-sm">
                <span>
                  <b className={t.direction === "up" ? "text-[var(--green)]" : "text-[var(--red)]"}>{t.direction === "up" ? "▲" : "▼"} {t.market}</b>{" "}
                  ${t.amount} @ {t.multiplier}x · {t.direction === "up" ? "above" : "below"} ${formatPrice(t.targetPrice)}
                </span>
                <span className="tabular-nums text-[var(--muted)]">{countdown(t.expiresAt - now)} · win ${payoutIfWin(t.amount, t.multiplier)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {history.length > 0 && (
        <>
          <h3 className="mb-3 text-lg font-bold">{practice ? "Practice history" : "History"}</h3>
          <ul className="space-y-2">
            {history.map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-lg border border-[var(--line)] p-3 text-sm">
                <span>
                  {t.direction === "up" ? "▲" : "▼"} {t.market} ${t.amount} @ {t.multiplier}x · target ${formatPrice(t.targetPrice)} · closed ${formatPrice(t.settlePrice ?? 0)}
                </span>
                <span className={`font-semibold ${t.status === "won" ? "text-[var(--green)]" : t.status === "lost" ? "text-[var(--red)]" : "text-[var(--muted)]"}`}>
                  {t.status === "won" ? `WON +$${t.pnl}` : t.status === "lost" ? `LOST -$${t.amount}` : "PUSH"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
