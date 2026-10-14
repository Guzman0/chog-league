"use client";

import { useEffect, useState } from "react";
import {
  AMOUNTS, DURATIONS_MIN, LEVELS, MARKETS, MAX_AMOUNT, MAX_MULTIPLIER, MIN_AMOUNT, MIN_MULTIPLIER, MULTIPLIERS,
  formatPrice, targetPrices, winPayout, type ChogSummary, type Direction, type Market, type Trade,
} from "@/lib/game";
import { POWERS, multiplierCap, nextRecharge, type ChogIdentity } from "@/lib/identity";
import { play } from "@/lib/sound";
import PriceChart, { type ChartLine } from "./PriceChart";
import Positions from "./Positions";
import { CustomNumber, Field, Pill } from "./ui";
import { usePriceStream } from "./usePriceStream";

// The Trade tab: live chart on the left, controls on the right, positions below.
export default function TradePanel({
  tokenId, identity, summary, open, history, onTraded, practice = false,
}: {
  tokenId: string;
  identity: ChogIdentity;
  summary?: ChogSummary;
  open: Trade[];
  history: Trade[];
  onTraded: () => void;
  practice?: boolean;
}) {
  const [market, setMarket] = useState<Market>(identity.home);
  const [armed, setArmed] = useState(false); // use the Chog's power on the next call
  const [minutes, setMinutes] = useState(1);
  const [amount, setAmount] = useState<number | null>(25);
  const [multiplier, setMultiplier] = useState<number | null>(1);
  const [sigma, setSigma] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const { ticks, price } = usePriceStream(market);

  // Each market's typical 1-minute move sets how far targets sit (from our server).
  useEffect(() => {
    let alive = true;
    setSigma(null);
    const load = () =>
      fetch(`/api/price?m=${market}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setSigma(d.sigma))
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [market]);

  const levelMax = practice ? MAX_MULTIPLIER : summary?.level.maxMultiplier ?? 1.5;
  const maxMult = multiplierCap(levelMax, market, identity.home);
  const power = POWERS[identity.power];
  const powerReady = !!summary && !summary.powerUsedToday;
  const usePower = armed && powerReady;
  const targets = price && sigma && multiplier !== null ? targetPrices(price, multiplier, sigma, minutes) : null;
  const win = amount !== null && multiplier !== null ? winPayout(amount, multiplier, usePower ? identity.power : undefined) : null;
  const balance = summary?.weekBalance ?? 0;
  const tooBig = multiplier !== null && multiplier > maxMult;
  const canTrade = !!targets && !busy && amount !== null && amount <= balance && !tooBig;

  const lines: ChartLine[] = [
    ...open.filter((t) => t.market === market).map((t) => ({
      price: t.targetPrice,
      label: `${t.direction === "up" ? "▲" : "▼"} $${t.amount} @ ${t.multiplier}x`,
      color: t.direction === "up" ? "var(--green)" : "var(--red)",
    })),
    ...(targets && multiplier !== null && multiplier > 1
      ? [
          { price: targets.up, label: "Higher above", color: "#a8f0cf", dashed: true },
          { price: targets.down, label: "Lower below", color: "#ffb3c2", dashed: true },
        ]
      : []),
  ];

  async function trade(direction: Direction) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/trade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenId, market, direction, minutes, amount, multiplier, practice, usePower }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      play("place");
      setArmed(false);
      setMsg({ text: `${direction === "up" ? "HIGHER" : "LOWER"} on ${market} is in. Result at ${new Date(d.trade.expiresAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`, ok: true });
      onTraded();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Trade failed", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              {MARKETS.map((m) => (
                <Pill key={m} on={m === market} onClick={() => setMarket(m)} title={m === identity.home ? "Your Chog's home market" : undefined}>{m}{m === identity.home ? " 🏠" : ""}</Pill>
              ))}
            </div>
            <p className="display num text-3xl">{price ? `$${formatPrice(price)}` : "…"}</p>
          </div>
          <PriceChart ticks={ticks} lines={lines} height={240} />
          <p className="mt-2 text-xs text-[var(--muted)]">Live {market}/USD, last 2 minutes. Results use the exchange&apos;s closing price.</p>
        </div>

        <div>
          <Field label="Ends in">
            {DURATIONS_MIN.map((d) => (
              <Pill key={d} on={d === minutes} onClick={() => setMinutes(d)}>{d} min</Pill>
            ))}
          </Field>
          <Field label={`Amount (you have $${balance.toLocaleString()})`}>
            {AMOUNTS.map((a) => (
              <Pill key={a} on={a === amount} onClick={() => setAmount(a)} disabled={a > balance}>${a}</Pill>
            ))}
            <CustomNumber label="Custom amount in dollars" value={amount} presets={AMOUNTS} onChange={setAmount} prefix="$" min={MIN_AMOUNT} max={Math.min(MAX_AMOUNT, Math.max(MIN_AMOUNT, Math.floor(balance)))} />
          </Field>
          <Field label="Multiplier: bigger payout, harder target">
            {MULTIPLIERS.map((x) => {
              const locked = x > maxMult;
              const needs = LEVELS.find((l) => multiplierCap(l.maxMultiplier, market, identity.home) >= x)?.level;
              return (
                <Pill key={x} on={x === multiplier} onClick={() => setMultiplier(x)} disabled={locked} title={locked ? `Unlocks at level ${needs}` : undefined}>
                  {locked ? "🔒 " : ""}{x}x
                </Pill>
              );
            })}
            <CustomNumber label="Custom multiplier" value={multiplier} presets={MULTIPLIERS} onChange={setMultiplier} suffix="x" decimals={1} min={MIN_MULTIPLIER} max={maxMult} />
          </Field>
          {!practice && (
            <p className="-mt-1 mb-3 text-xs text-[var(--muted)]">
              {market === identity.home
                ? `🏠 ${market} is your Chog's home market: up to ${maxMult}x here.`
                : `🏠 Your home market is ${identity.home}: +1x there.`}
              {tooBig && <b className="text-[var(--red)]"> {multiplier}x is above your limit in {market}.</b>}
            </p>
          )}

          <button
            type="button"
            aria-pressed={usePower}
            disabled={!powerReady}
            onClick={() => setArmed((a) => !a)}
            className={`mb-1 flex w-full items-center gap-3 rounded-2xl border-[3px] border-[var(--ink)] p-3 text-left shadow-[3px_3px_0_var(--ink)] transition disabled:opacity-60 ${usePower ? "bg-[var(--sky)] text-[var(--ink)]" : "bg-[var(--panel-2)]"}`}
          >
            <span className="text-3xl" aria-hidden="true">{power.emoji}</span>
            <span className="min-w-0 flex-1">
              <span className="display block text-lg leading-tight">
                {usePower ? `${power.name} is on for this call` : `Use ${power.name}`}
              </span>
              <span className={`block text-xs font-extrabold ${usePower ? "" : "text-[var(--muted)]"}`}>
                {!summary
                  ? "…"
                  : powerReady
                    ? `${power.short}. Once a day.`
                    : `Used today. Recharges at ${new Date(nextRecharge(Date.now())).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`}
              </span>
            </span>
            <span className={`rounded-lg border-2 border-[var(--ink)] px-2 py-0.5 text-xs font-black ${usePower ? "bg-[var(--ink)] text-[var(--sky)]" : powerReady ? "bg-[var(--green)] text-[var(--ink)]" : "bg-[var(--bg)]"}`}>
              {usePower ? "ON" : powerReady ? "READY" : "USED"}
            </span>
          </button>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={() => trade("up")} disabled={!canTrade} className="btn btn-up p-4 text-left">
              <span className="display block text-2xl">▲ Higher</span>
              <span className="block text-xs font-extrabold">{targets ? `above $${formatPrice(targets.up)}` : "…"}</span>
              <span className="block text-sm font-black">{win !== null ? `win $${win}${usePower && identity.power === "parachute" && amount !== null ? ` · risk $${amount / 2}` : ""}` : "…"}</span>
            </button>
            <button type="button" onClick={() => trade("down")} disabled={!canTrade} className="btn btn-down p-4 text-left">
              <span className="display block text-2xl">▼ Lower</span>
              <span className="block text-xs font-extrabold">{targets ? `below $${formatPrice(targets.down)}` : "…"}</span>
              <span className="block text-sm font-black">{win !== null ? `win $${win}${usePower && identity.power === "parachute" && amount !== null ? ` · risk $${amount / 2}` : ""}` : "…"}</span>
            </button>
          </div>
          {msg && <p className={`mt-3 text-sm font-extrabold ${msg.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{msg.text}</p>}
          {practice && <p className="mt-3 text-xs text-[var(--muted)]">Practice calls don&apos;t count toward this Chog&apos;s record or the league, and every multiplier is unlocked.</p>}
        </div>
      </section>

      <Positions practice={practice} open={open} history={history} />
    </div>
  );
}
