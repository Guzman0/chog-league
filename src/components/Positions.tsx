"use client";

import { useEffect, useState } from "react";
import { CASHOUT_CUTOFF_MS, formatPrice, winPayout, type Trade } from "@/lib/game";
import { play } from "@/lib/sound";
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

export default function Positions({ open, history, practice = false, chogName, onChanged }: { open: Trade[]; history: Trade[]; practice?: boolean; chogName?: string; onChanged?: () => void }) {
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
            💸 Want out? Cash out any time until the last 10 seconds for what the call is worth right now (its chance of winning × what it pays, minus a 2% exit fee). A cash-out counts as neither a win nor a loss for your level.
          </p>
          <ul className="mb-5 space-y-2">
            {open.map((t) => (
              <li key={t.id} className="panel-flat flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  <b className={t.direction === "up" ? "text-[var(--green)]" : "text-[var(--red)]"}>{t.direction === "up" ? "▲" : "▼"} {t.market}</b>{" "}
                  ${t.amount} at {t.multiplier}x, needs {t.direction === "up" ? "above" : "below"} ${formatPrice(t.targetPrice)}
                  <PowerTag t={t} />
                </span>
                <span className="flex items-center gap-2">
                  <span className="num font-black">{countdown(t.expiresAt - now)} <span className="text-[var(--muted)]">for ${winPayout(t.amount, t.multiplier, t.power)}</span></span>
                  <CashOut t={t} now={now} onDone={onChanged} />
                </span>
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
                    {t.status === "won" ? `Won +$${t.pnl}` : t.status === "lost" ? `Lost $${Math.abs(t.pnl ?? t.amount)}` : t.status === "cashed" ? `Cashed out ${(t.pnl ?? 0) >= 0 ? "+" : "-"}$${Math.abs(t.pnl ?? 0)}` : "Push, refunded"}
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

// "💸 Cash out" on a live call: asks the server what the call is worth now,
// shows it, and closes the call if you say yes.
export function CashOut({ t, now, onDone }: { t: Trade; now: number; onDone?: () => void }) {
  const [quote, setQuote] = useState<{ value: number; pnl: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tooLate = t.expiresAt - now < CASHOUT_CUTOFF_MS;

  // A quote is only good for a few seconds: prices move.
  useEffect(() => {
    if (!quote) return;
    const id = setTimeout(() => setQuote(null), 8000);
    return () => clearTimeout(id);
  }, [quote]);

  async function ask() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/trade/cashout?id=${t.id}`, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setQuote(d);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't get a price");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/trade/cashout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: t.id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      play(d.pnl >= 0 ? "win" : "place");
      setQuote(null);
      onDone?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't cash out");
      setQuote(null);
    } finally {
      setBusy(false);
    }
  }

  if (tooLate) return <span className="text-xs font-extrabold text-[var(--muted)]" title="The result is seconds away">🔒</span>;
  if (quote) {
    return (
      <span className="flex flex-wrap items-center gap-1.5 rounded-xl border-2 border-[var(--ink)] bg-[var(--banana)] px-2 py-1 text-xs font-black text-[var(--ink)]">
        Take ${quote.value} now? ({quote.pnl >= 0 ? "+" : "-"}${Math.abs(quote.pnl)})
        <button type="button" onClick={confirm} disabled={busy} className="rounded-lg border-2 border-[var(--ink)] bg-[var(--green)] px-2 py-0.5">{busy ? "…" : "Cash out"}</button>
        <button type="button" onClick={() => setQuote(null)} disabled={busy} className="rounded-lg border-2 border-[var(--ink)] bg-[var(--text)] px-2 py-0.5">Keep it</button>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      {err && <span className="text-xs font-extrabold text-[var(--red)]">{err}</span>}
      <button type="button" onClick={ask} disabled={busy} className="btn btn-ghost px-2.5 py-1 text-xs" title="Close this call now for what it's worth">
        {busy ? "…" : "💸 Cash out"}
      </button>
    </span>
  );
}
