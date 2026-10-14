"use client";

import { useEffect, useRef, useState } from "react";
import { AMOUNTS, DURATIONS_MIN, MARKETS, MULTIPLIERS, formatPrice, targetPrices, type Direction, type Market, type Trade } from "@/lib/game";
import { FORMATS, other, roundPayout, score, type Duel, type Round, type Side } from "@/lib/duels";
import type { ChogData } from "@/lib/chog";
import ChogAvatar, { type Reaction } from "./ChogAvatar";
import { fetchChog } from "./MyChogs";
import { duelAction } from "./useDuels";

type ArenaSide = { balance: number; open: number; trades: number };
type View = {
  duel: Duel & { side: Side | null };
  arena: { challenger: ArenaSide; opponent: ArenaSide; trades: (Trade & { side: Side })[] } | null;
  now: number;
};

function useNow(ms = 250) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const secs = (ms: number) => Math.max(0, Math.ceil(ms / 1000));
const clock = (ms: number) => {
  const s = secs(ms);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
const arrow = (d?: Direction) => (d === "up" ? "▲ HIGHER" : d === "down" ? "▼ LOWER" : "–");

export default function DuelScreen({ duelId, maxMultiplier, onClose }: { duelId: string; maxMultiplier: number; onClose: () => void }) {
  const [v, setV] = useState<View | null>(null);
  const [chogs, setChogs] = useState<Partial<Record<Side, ChogData>>>({});
  const [err, setErr] = useState<string | null>(null);
  const [mult, setMult] = useState(1);
  const [live, setLive] = useState<number | null>(null);
  const [reactions, setReactions] = useState<Partial<Record<Side, Reaction>>>({});
  const seenRounds = useRef<Set<number> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useNow();

  // Poll the duel.
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`/api/duels/${duelId}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && d.duel && setV(d))
        .catch(() => {});
    load();
    const id = setInterval(load, 1500);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [duelId]);

  const d = v?.duel;
  const me: Side = d?.side ?? "challenger";
  const them = other(me);

  // Load both Chogs' pictures.
  useEffect(() => {
    if (!d) return;
    (["challenger", "opponent"] as Side[]).forEach((s) => {
      const token = s === "challenger" ? d.challengerToken : d.opponentToken;
      if (chogs[s]?.tokenId === token) return;
      fetchChog(token).then((c) => setChogs((x) => ({ ...x, [s]: c }))).catch(() => {});
    });
  }, [d?.challengerToken, d?.opponentToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live price for the duel market while a round is running.
  const round: Round | undefined = d?.rounds[d.rounds.length - 1];
  const showLive = !!d && d.status === "active" && FORMATS[d.format].kind === "rounds";
  useEffect(() => {
    if (!showLive || !d) return;
    let alive = true;
    const load = () => fetch(`/api/price?m=${d.market}`).then((r) => r.json()).then((p) => alive && p.price && setLive(p.price)).catch(() => {});
    load();
    const id = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [showLive, d?.market]); // eslint-disable-line react-hooks/exhaustive-deps

  // Both Chogs react when a round is decided (not for rounds already over when you opened the duel).
  useEffect(() => {
    if (!d) return;
    const decided = d.rounds.filter((r) => r.winner !== undefined).map((r) => r.n);
    if (seenRounds.current === null) {
      seenRounds.current = new Set(decided);
      return;
    }
    const fresh = d.rounds.find((r) => r.winner !== undefined && !seenRounds.current!.has(r.n));
    if (!fresh) return;
    seenRounds.current.add(fresh.n);
    const mk = (s: Side): Reaction => {
      const res = fresh.results?.[s];
      if (fresh.winner === "tie" || !res) return null;
      const won = fresh.winner === s;
      return { kind: won ? "win" : "lose", text: won ? `Round ${fresh.n}! ${res.pnl >= 0 ? "+" : ""}$${res.pnl}` : res.missed ? "Too slow…" : `rekt ${res.pnl}`, key: `${d.id}-${fresh.n}-${s}` };
    };
    setReactions({ challenger: mk("challenger"), opponent: mk("opponent") });
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setReactions({}), 3500);
  }, [d]);

  async function act(body: Record<string, unknown>) {
    setErr(null);
    try {
      setV(await duelAction(duelId, body));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  if (!d) {
    return <section className="rounded-2xl border-2 border-[var(--purple)] bg-[var(--panel)] p-6 text-center text-sm text-[var(--muted)]">Loading duel…</section>;
  }

  const f = FORMATS[d.format];
  const sc = score(d);
  const done = d.status === "done";
  const iWon = done && d.result?.winner === me;
  const draw = done && d.result?.winner === "draw";
  const nameOf = (s: Side) => chogs[s]?.name ?? `Token ${s === "challenger" ? d.challengerToken : d.opponentToken}`;
  const isBotSide = (s: Side) => d.isBot && s === "opponent";

  return (
    <section className="rounded-2xl border-2 border-[var(--purple)] bg-[var(--panel)] p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-lg font-bold">⚔️ {f.label}{f.kind === "rounds" ? ` · ${d.market}` : ""}</h3>
        <p className="text-sm text-[var(--muted)]">Pot ${d.stake * 2} · {d.mode === "league" ? "League" : "Practice"}</p>
      </div>

      {/* Face-off */}
      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {[me, them].map((s, i) => (
          <div key={s} className={`text-center ${i === 1 ? "order-3" : ""}`}>
            <div className="mx-auto w-full max-w-[160px]">
              <ChogAvatar
                image={chogs[s]?.image ?? null}
                name={nameOf(s)}
                reaction={reactions[s] ?? null}
                crowned={done && d.result?.winner === s}
              />
            </div>
            <p className="mt-2 truncate text-sm font-semibold">{s === me ? "You" : isBotSide(s) ? "🤖 Bot" : "Them"} · {nameOf(s)}</p>
            {f.kind === "arena" && v?.arena && <p className="text-lg font-bold tabular-nums">${v.arena[s].balance.toLocaleString()}</p>}
          </div>
        ))}
        <div className="order-2 text-center">
          {f.kind === "rounds" ? (
            <p className="text-3xl font-extrabold tabular-nums">{sc[me]} – {sc[them]}</p>
          ) : (
            <p className="text-xl font-extrabold">VS</p>
          )}
          {f.kind === "rounds" && <p className="text-xs text-[var(--muted)]">first to {f.toWin}</p>}
        </div>
      </div>

      {/* Finished */}
      {done && (
        <div className={`mb-4 rounded-xl p-4 text-center ${iWon ? "bg-[var(--green)] text-black" : draw ? "bg-[var(--line)]" : "bg-[var(--red)] text-black"}`}>
          <p className="text-2xl font-extrabold">{iWon ? `🏆 You won $${d.stake * 2}!` : draw ? "🤝 Draw. Stakes returned." : `💀 You lost $${d.stake}`}</p>
          {d.result?.reason && <p className="text-sm">{d.result.reason}</p>}
          <button onClick={onClose} className="mt-3 rounded-lg bg-black/80 px-4 py-2 font-semibold text-white">Back</button>
        </div>
      )}

      {/* Round in progress */}
      {!done && f.kind === "rounds" && round && (
        <RoundPanel
          round={round}
          me={me}
          them={them}
          now={now}
          live={live}
          maxMultiplier={maxMultiplier}
          mult={mult}
          setMult={setMult}
          onPick={(direction) => act({ action: "pick", direction, multiplier: mult })}
        />
      )}

      {/* Arena in progress */}
      {!done && f.kind === "arena" && v?.arena && (
        <ArenaPanel endsAt={d.endsAt!} now={now} maxMultiplier={maxMultiplier} trades={v.arena.trades} me={me} onTrade={(body) => act({ action: "trade", ...body })} />
      )}

      {err && <p className="mt-3 text-sm text-[var(--red)]">{err}</p>}

      {/* Round history */}
      {f.kind === "rounds" && d.rounds.some((r) => r.winner !== undefined) && (
        <ul className="mt-4 space-y-1 text-xs">
          {d.rounds.filter((r) => r.winner !== undefined).map((r) => (
            <li key={r.n} className="flex justify-between rounded-md border border-[var(--line)] px-3 py-1.5">
              <span>R{r.n}: you {arrow(r.picks[me]?.direction)} {r.picks[me]?.multiplier ?? ""}{r.picks[me] ? "x" : "(no pick)"} · them {arrow(r.picks[them]?.direction)} {r.picks[them]?.multiplier ?? ""}{r.picks[them] ? "x" : "(no pick)"}</span>
              <b className={r.winner === me ? "text-[var(--green)]" : r.winner === them ? "text-[var(--red)]" : "text-[var(--muted)]"}>
                {r.winner === me ? "WON" : r.winner === them ? "LOST" : "TIE"}
              </b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoundPanel({
  round, me, them, now, live, maxMultiplier, mult, setMult, onPick,
}: {
  round: Round & { hasPicked?: Record<Side, boolean> };
  me: Side;
  them: Side;
  now: number;
  live: number | null;
  maxMultiplier: number;
  mult: number;
  setMult: (n: number) => void;
  onPick: (d: Direction) => void;
}) {
  const myPick = round.picks[me];
  const theyPicked = round.lockedAt !== undefined ? !!round.picks[them] : !!round.hasPicked?.[them];

  if (round.lockedAt === undefined) {
    return (
      <div className="rounded-xl border border-[var(--line)] p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="font-bold">Round {round.n}: make your call</p>
          <p className="text-2xl font-extrabold tabular-nums">{secs(round.pickClosesAt - now)}s</p>
        </div>
        <p className="mb-3 text-center text-sm text-[var(--muted)]">Live {live ? `$${formatPrice(live)}` : "…"} · {theyPicked ? "✅ They've locked in" : "⏳ They're thinking…"}</p>
        {myPick ? (
          <p className="rounded-lg bg-[var(--bg)] p-3 text-center font-semibold">You picked {arrow(myPick.direction)} at {myPick.multiplier}x. Waiting for the reveal…</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap justify-center gap-2">
              {MULTIPLIERS.map((x) => (
                <button key={x} onClick={() => setMult(x)} disabled={x > maxMultiplier} className={`rounded-lg border px-3 py-1.5 text-sm ${x === mult ? "border-[var(--purple)] bg-[var(--purple)] font-semibold" : "border-[var(--line)]"} disabled:opacity-40`}>
                  {x > maxMultiplier ? "🔒 " : ""}{x}x
                </button>
              ))}
            </div>
            <p className="mb-3 text-center text-xs text-[var(--muted)]">A right call at {mult}x scores +${roundPayout(mult) - 100}. Higher multiplier = bigger score but a harder target.</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => onPick("up")} className="rounded-xl bg-[var(--green)] p-4 text-lg font-bold text-black">▲ HIGHER</button>
              <button onClick={() => onPick("down")} className="rounded-xl bg-[var(--red)] p-4 text-lg font-bold text-black">▼ LOWER</button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Locked: both picks revealed, waiting for the close.
  const target = (s: Side) => {
    const p = round.picks[s];
    return p && round.entryPrice && round.sigma ? targetPrices(round.entryPrice, p.multiplier, round.sigma, 1)[p.direction] : null;
  };
  const winning = (s: Side) => {
    const p = round.picks[s], t = target(s);
    if (!p || t === null || live === null) return null;
    return p.direction === "up" ? live > t : live < t;
  };
  return (
    <div className="rounded-xl border border-[var(--line)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-bold">Round {round.n}: picks revealed</p>
        <p className="text-2xl font-extrabold tabular-nums">{round.expiresAt ? (now < round.expiresAt ? clock(round.expiresAt - now) : "settling…") : ""}</p>
      </div>
      <p className="mb-3 text-center text-sm text-[var(--muted)]">
        Entry ${round.entryPrice ? formatPrice(round.entryPrice) : "–"} · live <b className="text-[var(--text)]">{live ? `$${formatPrice(live)}` : "…"}</b>
      </p>
      <div className="grid grid-cols-2 gap-3 text-sm">
        {[me, them].map((s) => {
          const p = round.picks[s], t = target(s), w = winning(s);
          return (
            <div key={s} className={`rounded-lg border p-3 ${w === true ? "border-[var(--green)]" : w === false ? "border-[var(--red)]" : "border-[var(--line)]"}`}>
              <p className="text-xs text-[var(--muted)]">{s === me ? "You" : "Them"}</p>
              <p className="font-bold">{p ? `${arrow(p.direction)} ${p.multiplier}x` : "No pick"}</p>
              {t !== null && <p className="text-xs">{p!.direction === "up" ? "above" : "below"} ${formatPrice(t)}</p>}
              {w !== null && <p className={`text-xs font-semibold ${w ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{w ? "winning" : "losing"}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArenaPanel({
  endsAt, now, maxMultiplier, trades, me, onTrade,
}: {
  endsAt: number;
  now: number;
  maxMultiplier: number;
  trades: (Trade & { side: Side })[];
  me: Side;
  onTrade: (b: Record<string, unknown>) => void;
}) {
  const [market, setMarket] = useState<Market>("BTC");
  const [minutes, setMinutes] = useState(1);
  const [amount, setAmount] = useState(50);
  const [mult, setMult] = useState(1);
  const left = endsAt - now;
  const fits = (m: number) => now + m * 60000 + 30000 < endsAt;

  return (
    <div className="rounded-xl border border-[var(--line)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="font-bold">Arena: trade to win</p>
        <p className="text-2xl font-extrabold tabular-nums">{left > 0 ? clock(left) : "settling…"}</p>
      </div>
      {left > 0 && (
        <>
          <Row>{MARKETS.map((m) => <Chip key={m} on={m === market} onClick={() => setMarket(m)}>{m}</Chip>)}</Row>
          <Row>{DURATIONS_MIN.map((m) => <Chip key={m} on={m === minutes} disabled={!fits(m)} onClick={() => setMinutes(m)}>{m}m</Chip>)}</Row>
          <Row>{AMOUNTS.map((a) => <Chip key={a} on={a === amount} onClick={() => setAmount(a)}>${a}</Chip>)}</Row>
          <Row>{MULTIPLIERS.map((x) => <Chip key={x} on={x === mult} disabled={x > maxMultiplier} onClick={() => setMult(x)}>{x > maxMultiplier ? "🔒 " : ""}{x}x</Chip>)}</Row>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <button disabled={!fits(minutes)} onClick={() => onTrade({ market, direction: "up", minutes, amount, multiplier: mult })} className="rounded-xl bg-[var(--green)] p-3 font-bold text-black disabled:opacity-50">▲ HIGHER</button>
            <button disabled={!fits(minutes)} onClick={() => onTrade({ market, direction: "down", minutes, amount, multiplier: mult })} className="rounded-xl bg-[var(--red)] p-3 font-bold text-black disabled:opacity-50">▼ LOWER</button>
          </div>
        </>
      )}
      {trades.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs">
          {[...trades].reverse().slice(0, 12).map((t) => (
            <li key={t.id} className="flex justify-between rounded-md border border-[var(--line)] px-3 py-1.5">
              <span>{t.side === me ? "You" : "Them"}: {t.direction === "up" ? "▲" : "▼"} {t.market} ${t.amount} @ {t.multiplier}x</span>
              <b className={t.status === "won" ? "text-[var(--green)]" : t.status === "lost" ? "text-[var(--red)]" : "text-[var(--muted)]"}>
                {t.status === "open" ? clock(t.expiresAt - now) : t.status === "won" ? `+$${t.pnl}` : t.status === "lost" ? `-$${t.amount}` : "push"}
              </b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 flex flex-wrap gap-2">{children}</div>;
}
function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={`rounded-lg border px-3 py-1.5 text-sm ${on ? "border-[var(--purple)] bg-[var(--purple)] font-semibold" : "border-[var(--line)]"} disabled:opacity-40`}>
      {children}
    </button>
  );
}
