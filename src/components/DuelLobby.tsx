"use client";

import { useEffect, useState } from "react";
import { MARKETS, type Market } from "@/lib/game";
import { FORMATS, MAX_STAKE_SHARE, STAKES, type FormatId } from "@/lib/duels";
import type { ChogData } from "@/lib/chog";
import ChogAvatar from "./ChogAvatar";
import { Field, Pill } from "./ui";
import { duelAction, type MyDuel } from "./useDuels";

type Player = { playerKey: string; tokenId: string; name?: string; image?: string; busy: boolean };

export default function DuelLobby({
  chog, mode, balance, outgoing, onChanged,
}: {
  chog: ChogData;
  mode: "league" | "practice";
  balance: number;
  outgoing: MyDuel[];
  onChanged: () => void;
}) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [format, setFormat] = useState<FormatId>("quick");
  const [market, setMarket] = useState<Market>("BTC");
  const [stake, setStake] = useState(100);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/presence?mode=${mode}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && setPlayers(d.players ?? []))
        .catch(() => {});
    load();
    const id = setInterval(load, 5000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      clearInterval(id);
      clearInterval(tick);
    };
  }, [mode]);

  const maxStake = balance * MAX_STAKE_SHARE;
  useEffect(() => {
    if (stake > maxStake) setStake(STAKES.filter((s) => s <= maxStake).pop() ?? STAKES[0]);
  }, [maxStake, stake]);

  async function challenge(target: { opponentKey?: string; bot?: boolean }) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/duels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, tokenId: chog.tokenId, format, market, stake, ...target }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg({ text: target.bot ? "The bot accepted. Make your call!" : "Challenge sent. They have 60 seconds to accept.", ok: true });
      onChanged();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Couldn't send the challenge", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const f = FORMATS[format];
  const botFormat = f.kind === "rounds";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
      <section className="panel">
        <h3 className="mb-1 text-2xl">Set up a duel</h3>
        <p className="mb-4 text-sm text-[var(--muted)]">
          You both put in the same stake{mode === "league" ? " from your weekly league balance" : " from your practice balance"}, and the winner takes both. It&apos;s all demo money: no real funds, ever.
        </p>

        <Field label="Format">
          {(Object.keys(FORMATS) as FormatId[]).map((k) => (
            <Pill key={k} on={k === format} onClick={() => setFormat(k)} title={FORMATS[k].blurb}>{FORMATS[k].label}</Pill>
          ))}
        </Field>
        <p className="mb-4 text-xs text-[var(--muted)]">
          {f.kind === "rounds"
            ? `${f.blurb}. Each round you both secretly call higher or lower with a multiplier, and the bigger profit takes the round.`
            : `${f.blurb}. You each get $1,000 to trade with, and the bigger balance when time's up wins.`}
        </p>

        {f.kind === "rounds" && (
          <Field label="Market">
            {MARKETS.map((m) => (
              <Pill key={m} on={m === market} onClick={() => setMarket(m)}>{m}</Pill>
            ))}
          </Field>
        )}

        <Field label={`Stake each, in demo money (up to half your $${balance.toLocaleString()})`}>
          {STAKES.map((s) => (
            <Pill key={s} on={s === stake} onClick={() => setStake(s)} disabled={s > maxStake}>${s}</Pill>
          ))}
        </Field>

        {mode === "practice" && (
          <button
            type="button"
            onClick={() => challenge({ bot: true })}
            disabled={busy || !botFormat || stake > maxStake}
            className="btn btn-banana mt-2 w-full py-3 text-lg"
          >
            {botFormat ? `🤖 Duel the bot for a $${stake * 2} demo pot` : "The bot only plays round formats"}
          </button>
        )}
        {msg && <p className={`mt-3 text-sm font-extrabold ${msg.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{msg.text}</p>}
      </section>

      <section className="panel">
        <h3 className="mb-1 text-2xl">Online now</h3>
        <p className="mb-4 text-sm text-[var(--muted)]">{mode === "league" ? "Chog holders in the league right now." : "Players in practice right now."}</p>

        {outgoing.length > 0 && (
          <div className="mb-4 space-y-2">
            {outgoing.map((d) => (
              <div key={d.id} className="panel-flat flex items-center justify-between gap-2 p-3 text-sm">
                <span>Waiting for token {d.opponentToken} to accept, {Math.max(0, Math.ceil((d.createdAt + 60000 - now) / 1000))}s left</span>
                <button type="button" className="font-extrabold text-[var(--muted)] underline" onClick={() => duelAction(d.id, { action: "cancel" }).then(onChanged).catch(() => {})}>Cancel</button>
              </div>
            ))}
          </div>
        )}

        {players.length === 0 ? (
          <div className="panel-flat p-5 text-center text-sm text-[var(--muted)]">
            <p className="mb-1 text-3xl" aria-hidden="true">🦗</p>
            Nobody else is here yet.{mode === "practice" ? " Duel the bot, or send a friend the link." : " Share the link in the Chog Discord."}
          </div>
        ) : (
          <ul className="space-y-2">
            {players.map((p) => (
              <li key={p.playerKey} className="panel-flat flex items-center gap-3 p-2">
                <div className="h-12 w-12 shrink-0">
                  <ChogAvatar image={p.image || null} name={p.name || ""} size="sm" />
                </div>
                <span className="min-w-0 flex-1 text-sm">
                  <b className="block truncate">{p.name || `Token ${p.tokenId}`}</b>
                  <span className="text-xs text-[var(--muted)]">{p.busy ? "In a duel" : "Ready"}</span>
                </span>
                <button type="button" onClick={() => challenge({ opponentKey: p.playerKey })} disabled={busy || p.busy || stake > maxStake} className="btn btn-primary px-3 py-1.5 text-sm">
                  Challenge
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
