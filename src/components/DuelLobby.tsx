"use client";

import { useEffect, useState } from "react";
import { MARKETS, type Market } from "@/lib/game";
import { FORMATS, MAX_STAKE_SHARE, STAKES, type FormatId } from "@/lib/duels";
import type { ChogData } from "@/lib/chog";
import ChogAvatar from "./ChogAvatar";
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
    const id = setInterval(() => {
      load();
      setNow(Date.now());
    }, 5000);
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
      setMsg({ text: target.bot ? "Bot accepted. Fight!" : "Challenge sent. They have 60 seconds to accept.", ok: true });
      onChanged();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Couldn't send challenge", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const botFormat = FORMATS[format].kind === "rounds";

  return (
    <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
      <div className="mb-1 flex items-baseline justify-between">
        <h3 className="text-lg font-bold">⚔️ Chog vs Chog</h3>
        <p className="text-xs text-[var(--muted)]">{mode === "league" ? "League duel: stakes come from your weekly balance" : "Practice duel: uses practice balance"}</p>
      </div>
      <p className="mb-4 text-sm text-[var(--muted)]">Both Chogs stake the same amount. Winner takes all.</p>

      <p className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">Format</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(FORMATS) as FormatId[]).map((f) => (
          <Pill key={f} on={f === format} onClick={() => setFormat(f)} title={FORMATS[f].blurb}>{FORMATS[f].label}</Pill>
        ))}
      </div>
      <p className="mb-3 text-xs text-[var(--muted)]">
        {FORMATS[format].blurb}.{" "}
        {FORMATS[format].kind === "rounds"
          ? "Each round you both secretly pick HIGHER or LOWER and a multiplier; the bigger profit wins the round."
          : "You each get a $1,000 arena bankroll; highest bankroll at the end wins."}
      </p>

      {FORMATS[format].kind === "rounds" && (
        <>
          <p className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">Market</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {MARKETS.map((m) => (
              <Pill key={m} on={m === market} onClick={() => setMarket(m)}>{m}</Pill>
            ))}
          </div>
        </>
      )}

      <p className="mb-1 text-xs uppercase tracking-wide text-[var(--muted)]">Stake</p>
      <div className="mb-4 flex flex-wrap gap-2">
        {STAKES.map((s) => (
          <Pill key={s} on={s === stake} onClick={() => setStake(s)} disabled={s > maxStake} title={s > maxStake ? "Max stake is half your balance" : undefined}>${s}</Pill>
        ))}
      </div>

      {outgoing.length > 0 && (
        <div className="mb-4 space-y-2">
          {outgoing.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border border-[var(--purple)] p-3 text-sm">
              <span>Waiting for Chog token {d.opponentToken} to accept · {Math.max(0, Math.ceil((d.createdAt + 60000 - now) / 1000))}s</span>
              <button className="text-[var(--muted)] underline" onClick={() => duelAction(d.id, { action: "cancel" }).then(onChanged).catch(() => {})}>Cancel</button>
            </div>
          ))}
        </div>
      )}

      {mode === "practice" && (
        <button
          onClick={() => challenge({ bot: true })}
          disabled={busy || !botFormat || stake > maxStake}
          title={botFormat ? undefined : "The bot plays Quick, Best of 3 and Best of 5"}
          className="mb-4 w-full rounded-xl border border-[var(--purple)] p-3 font-semibold disabled:opacity-50"
        >
          🤖 Duel the bot now{botFormat ? "" : " (rounds formats only)"}
        </button>
      )}

      <p className="mb-2 text-xs uppercase tracking-wide text-[var(--muted)]">Online now</p>
      {players.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">
          Nobody else is online {mode === "league" ? "in the league" : "in practice"} right now.{mode === "practice" ? " Try the bot, or share the link with a friend." : ""}
        </p>
      ) : (
        <ul className="space-y-2">
          {players.map((p) => (
            <li key={p.playerKey} className="flex items-center gap-3 rounded-lg border border-[var(--line)] p-2">
              <div className="h-10 w-10">
                <ChogAvatar image={p.image || null} name={p.name || ""} size="sm" />
              </div>
              <span className="flex-1 text-sm">
                <b>{p.name || `Token ${p.tokenId}`}</b>
                <span className="block text-xs text-[var(--muted)]">{p.busy ? "In a duel" : "Online"}</span>
              </span>
              <button
                onClick={() => challenge({ opponentKey: p.playerKey })}
                disabled={busy || p.busy || stake > maxStake}
                className="rounded-lg bg-[var(--purple)] px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              >
                Challenge
              </button>
            </li>
          ))}
        </ul>
      )}
      {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{msg.text}</p>}
    </section>
  );
}

function Pill({ on, onClick, children, disabled, title }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`rounded-lg border px-3 py-1.5 text-sm ${on ? "border-[var(--purple)] bg-[var(--purple)] font-semibold" : "border-[var(--line)]"} disabled:opacity-40`}>
      {children}
    </button>
  );
}
