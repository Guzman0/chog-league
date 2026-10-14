"use client";

import { useEffect, useState } from "react";
import {
  AMOUNTS, DURATIONS_MIN, LEVELS, MARKETS, MULTIPLIERS,
  formatPrice, payoutIfWin, targetPrices, type ChogSummary, type Direction, type Market,
} from "@/lib/game";

type Quote = { price: number; sigma: number };

export default function TradePanel({ tokenId, summary, onTraded, practice = false }: { tokenId: string; summary?: ChogSummary; onTraded: () => void; practice?: boolean }) {
  const [market, setMarket] = useState<Market>("BTC");
  const [minutes, setMinutes] = useState(1);
  const [amount, setAmount] = useState(25);
  const [multiplier, setMultiplier] = useState(1);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState<Direction | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    setQuote(null);
    const load = () =>
      fetch(`/api/price?m=${market}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setQuote({ price: d.price, sigma: d.sigma }))
        .catch(() => {});
    load();
    const id = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [market]);

  const maxMult = practice ? Math.max(...MULTIPLIERS) : summary?.level.maxMultiplier ?? 1.5;
  const targets = quote ? targetPrices(quote.price, multiplier, quote.sigma, minutes) : null;
  const win = payoutIfWin(amount, multiplier);
  const balance = summary?.weekBalance ?? 0;

  async function trade(direction: Direction) {
    setBusy(direction);
    setMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenId, market, direction, minutes, amount, multiplier, practice }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setMsg({ text: `${direction === "up" ? "HIGHER" : "LOWER"} on ${market} placed. Settles at ${new Date(d.trade.expiresAt).toLocaleTimeString()}.`, ok: true });
      onTraded();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Trade failed", ok: false });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-lg font-bold">{practice ? "Practice trade" : "Trade"}</h3>
        <p className="text-sm text-[var(--muted)]">{practice ? "Practice balance" : "Balance"} ${balance.toLocaleString()}</p>
      </div>
      {practice && (
        <p className="mb-4 rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 text-xs text-[var(--muted)]">
          Practice mode: demo trades with this Chog that don&apos;t count toward its record or the league. All multipliers are unlocked here; in the league they unlock as a Chog levels up.
        </p>
      )}

      <Row label="Market">
        {MARKETS.map((m) => (
          <Pill key={m} active={m === market} onClick={() => setMarket(m)}>{m}</Pill>
        ))}
      </Row>

      <div className="my-4 text-center">
        <p className="text-xs text-[var(--muted)]">{market}/USD live</p>
        <p className="text-3xl font-bold tabular-nums">{quote ? `$${formatPrice(quote.price)}` : "…"}</p>
      </div>

      <Row label="Duration">
        {DURATIONS_MIN.map((d) => (
          <Pill key={d} active={d === minutes} onClick={() => setMinutes(d)}>{d}m</Pill>
        ))}
      </Row>
      <Row label="Amount">
        {AMOUNTS.map((a) => (
          <Pill key={a} active={a === amount} onClick={() => setAmount(a)} disabled={a > balance}>${a}</Pill>
        ))}
      </Row>
      <Row label="Multiplier">
        {MULTIPLIERS.map((x) => {
          const locked = x > maxMult;
          const needs = LEVELS.find((l) => l.maxMultiplier >= x)?.level;
          return (
            <Pill key={x} active={x === multiplier} onClick={() => setMultiplier(x)} disabled={locked} title={locked ? `Unlocks at Level ${needs}` : undefined}>
              {locked ? "🔒 " : ""}{x}x
            </Pill>
          );
        })}
      </Row>
      <p className="mb-4 text-xs text-[var(--muted)]">Higher multiplier = bigger payout, but the price has to move further.{practice ? "" : " Your Chog unlocks more by levelling up."}</p>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => trade("up")}
          disabled={!quote || !!busy || amount > balance}
          className="rounded-xl bg-[var(--green)] p-4 text-left font-bold text-black disabled:opacity-50"
        >
          <span className="block text-lg">▲ HIGHER</span>
          <span className="block text-xs font-normal">{targets ? `Above $${formatPrice(targets.up)}` : "…"}</span>
          <span className="block text-sm">Win ${win}</span>
        </button>
        <button
          onClick={() => trade("down")}
          disabled={!quote || !!busy || amount > balance}
          className="rounded-xl bg-[var(--red)] p-4 text-left font-bold text-black disabled:opacity-50"
        >
          <span className="block text-lg">▼ LOWER</span>
          <span className="block text-xs font-normal">{targets ? `Below $${formatPrice(targets.down)}` : "…"}</span>
          <span className="block text-sm">Win ${win}</span>
        </button>
      </div>
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{msg.text}</p>}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Pill({ active, disabled, onClick, children, title }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-lg border px-3 py-1.5 text-sm ${active ? "border-[var(--purple)] bg-[var(--purple)] font-semibold" : "border-[var(--line)]"} disabled:opacity-40`}
    >
      {children}
    </button>
  );
}
