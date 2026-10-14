"use client";

import { useEffect, useRef, useState } from "react";
import { AMOUNTS, DURATIONS_MIN, MARKETS, MAX_AMOUNT, MIN_AMOUNT, MIN_MULTIPLIER, MULTIPLIERS, formatPrice, targetPrices, type Direction, type Market, type Trade } from "@/lib/game";
import { FORMATS, other, roundPayout, score, type Duel, type Round, type Side } from "@/lib/duels";
import type { ChogData } from "@/lib/chog";
import { play } from "@/lib/sound";
import ChogAvatar, { type Reaction } from "./ChogAvatar";
import PriceChart, { type ChartLine } from "./PriceChart";
import { fetchChog } from "./MyChogs";
import { duelAction } from "./useDuels";
import { usePriceStream, type Tick } from "./usePriceStream";
import { CustomNumber, Field, Pill } from "./ui";

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
const arrow = (d?: Direction) => (d === "up" ? "▲ Higher" : d === "down" ? "▼ Lower" : "no call");

export default function DuelScreen({ duelId, maxMultiplier, onClose }: { duelId: string; maxMultiplier: number; onClose: () => void }) {
  const [v, setV] = useState<View | null>(null);
  const [chogs, setChogs] = useState<Partial<Record<Side, ChogData>>>({});
  const [err, setErr] = useState<string | null>(null);
  const [mult, setMult] = useState<number | null>(1);
  const [reactions, setReactions] = useState<Partial<Record<Side, Reaction>>>({});
  const seenRounds = useRef<Set<number> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announced = useRef(false);
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
  const stream = usePriceStream(d?.market ?? "BTC");

  // Load both Chogs' pictures.
  useEffect(() => {
    if (!d) return;
    (["challenger", "opponent"] as Side[]).forEach((s) => {
      const token = s === "challenger" ? d.challengerToken : d.opponentToken;
      if (chogs[s]?.tokenId === token) return;
      fetchChog(token).then((c) => setChogs((x) => ({ ...x, [s]: c }))).catch(() => {});
    });
  }, [d?.challengerToken, d?.opponentToken]); // eslint-disable-line react-hooks/exhaustive-deps

  // Both Chogs react when a round is decided (not for rounds already over when you opened the duel).
  useEffect(() => {
    if (!d) return;
    const decided = d.rounds.filter((r) => r.winner !== undefined).map((r) => r.n);
    if (seenRounds.current === null) {
      seenRounds.current = new Set(decided);
      if (d.status === "done") announced.current = true;
      return;
    }
    if (d.status === "done" && !announced.current) {
      announced.current = true;
      play(d.result?.winner === me ? "victory" : d.result?.winner === "draw" ? "place" : "lose");
    }
    const fresh = d.rounds.find((r) => r.winner !== undefined && !seenRounds.current!.has(r.n));
    if (!fresh) return;
    seenRounds.current.add(fresh.n);
    const mk = (s: Side): Reaction => {
      const res = fresh.results?.[s];
      if (fresh.winner === "tie" || !res) return null;
      const won = fresh.winner === s;
      return { kind: won ? "win" : "lose", text: won ? `Round ${fresh.n}! ${res.pnl >= 0 ? "+" : ""}$${res.pnl}` : res.missed ? "Too slow…" : "rekt", key: `${d.id}-${fresh.n}-${s}` };
    };
    if (d.status !== "done") play(fresh.winner === me ? "win" : fresh.winner === "tie" ? "place" : "lose");
    setReactions({ challenger: mk("challenger"), opponent: mk("opponent") });
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setReactions({}), 3500);
  }, [d, me]);

  async function act(body: Record<string, unknown>) {
    setErr(null);
    try {
      setV(await duelAction(duelId, body));
      if (body.action === "pick" || body.action === "trade") play("place");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  if (!d) {
    return <section className="panel text-center text-sm text-[var(--muted)]">Loading the duel…</section>;
  }

  const f = FORMATS[d.format];
  const sc = score(d);
  const done = d.status === "done";
  const iWon = done && d.result?.winner === me;
  const draw = done && d.result?.winner === "draw";
  const nameOf = (s: Side) => chogs[s]?.name ?? `Token ${s === "challenger" ? d.challengerToken : d.opponentToken}`;
  const isBotSide = (s: Side) => d.isBot && s === "opponent";
  const round: Round | undefined = d.rounds[d.rounds.length - 1];

  return (
    <section className="panel">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-2xl">⚔️ {f.label}{f.kind === "rounds" ? ` on ${d.market}` : ""}</h3>
        <p className="text-sm font-extrabold text-[var(--muted)]">Pot ${d.stake * 2}, {d.mode === "league" ? "league duel" : "practice duel"}</p>
      </div>

      {/* Face-off */}
      <div className="mb-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {[me, them].map((s, i) => (
          <div key={s} className={`text-center ${i === 1 ? "order-3" : ""}`}>
            <div className="mx-auto w-full max-w-[150px]">
              <ChogAvatar image={chogs[s]?.image ?? null} name={nameOf(s)} reaction={reactions[s] ?? null} crowned={done && d.result?.winner === s} size="md" />
            </div>
            <p className="mt-2 truncate text-sm font-extrabold">{s === me ? "You" : isBotSide(s) ? "🤖 Bot" : "Them"}</p>
            <p className="truncate text-xs text-[var(--muted)]">{nameOf(s)}</p>
            {f.kind === "arena" && v?.arena && <p className="display num text-2xl text-[var(--banana)]">${v.arena[s].balance.toLocaleString()}</p>}
          </div>
        ))}
        <div className="order-2 text-center">
          {f.kind === "rounds" ? <p className="display num text-5xl">{sc[me]}–{sc[them]}</p> : <p className="display text-4xl">vs</p>}
          {f.kind === "rounds" && <p className="text-xs font-extrabold text-[var(--muted)]">first to {f.toWin}</p>}
        </div>
      </div>

      {done && (
        <div className={`mb-4 rounded-2xl border-[3px] border-[var(--ink)] p-5 text-center text-[var(--ink)] ${iWon ? "bg-[var(--green)]" : draw ? "bg-[var(--muted)]" : "bg-[var(--red)]"}`}>
          <p className="display text-4xl">{iWon ? `You won $${d.stake * 2}!` : draw ? "Draw. Stakes returned." : `You lost $${d.stake}`}</p>
          {d.result?.reason && <p className="text-sm font-extrabold">{d.result.reason}</p>}
          <button type="button" onClick={onClose} className="btn btn-ghost mt-3 px-5 py-2">Back to the lobby</button>
        </div>
      )}

      {!done && f.kind === "rounds" && round && (
        <RoundPanel round={round} me={me} them={them} now={now} ticks={stream.ticks} live={stream.price} maxMultiplier={maxMultiplier} mult={mult} setMult={setMult} onPick={(direction) => act({ action: "pick", direction, multiplier: mult })} />
      )}

      {!done && f.kind === "arena" && v?.arena && (
        <ArenaPanel endsAt={d.endsAt!} now={now} maxMultiplier={maxMultiplier} trades={v.arena.trades} me={me} onTrade={(body) => act({ action: "trade", ...body })} />
      )}

      {err && <p className="mt-3 text-sm font-extrabold text-[var(--red)]">{err}</p>}

      {f.kind === "rounds" && d.rounds.some((r) => r.winner !== undefined) && (
        <ul className="mt-4 space-y-1.5 text-xs">
          {d.rounds.filter((r) => r.winner !== undefined).map((r) => (
            <li key={r.n} className="panel-flat flex flex-wrap justify-between gap-2 px-3 py-2">
              <span>Round {r.n}: you {arrow(r.picks[me]?.direction)}{r.picks[me] ? ` ${r.picks[me]!.multiplier}x` : ""}, them {arrow(r.picks[them]?.direction)}{r.picks[them] ? ` ${r.picks[them]!.multiplier}x` : ""}</span>
              <b className={r.winner === me ? "text-[var(--green)]" : r.winner === them ? "text-[var(--red)]" : "text-[var(--muted)]"}>
                {r.winner === me ? "You took it" : r.winner === them ? "They took it" : "Tie"}
              </b>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RoundPanel({
  round, me, them, now, ticks, live, maxMultiplier, mult, setMult, onPick,
}: {
  round: Round & { hasPicked?: Record<Side, boolean> };
  me: Side;
  them: Side;
  now: number;
  ticks: Tick[];
  live: number | null;
  maxMultiplier: number;
  mult: number | null;
  setMult: (n: number | null) => void;
  onPick: (d: Direction) => void;
}) {
  const myPick = round.picks[me];
  const theyPicked = round.lockedAt !== undefined ? !!round.picks[them] : !!round.hasPicked?.[them];
  const locked = round.lockedAt !== undefined;

  const target = (s: Side) => {
    const p = round.picks[s];
    return p && round.entryPrice && round.sigma ? targetPrices(round.entryPrice, p.multiplier, round.sigma, 1)[p.direction] : null;
  };
  const winning = (s: Side) => {
    const p = round.picks[s], t = target(s);
    if (!p || t === null || live === null) return null;
    return p.direction === "up" ? live > t : live < t;
  };

  const lines: ChartLine[] = [];
  if (locked && round.entryPrice) {
    lines.push({ price: round.entryPrice, label: "Start", color: "#fff5e8", dashed: true });
    const tm = target(me), tt = target(them);
    if (tm !== null && round.picks[me]) lines.push({ price: tm, label: `You ${round.picks[me]!.direction === "up" ? "▲" : "▼"}`, color: "var(--banana)" });
    if (tt !== null && round.picks[them]) lines.push({ price: tt, label: `Them ${round.picks[them]!.direction === "up" ? "▲" : "▼"}`, color: "var(--pink)" });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <PriceChart ticks={ticks} lines={lines} height={230} />
        <p className="mt-2 text-xs text-[var(--muted)]">Live price {live ? `$${formatPrice(live)}` : "…"}{locked && round.entryPrice ? `, round started at $${formatPrice(round.entryPrice)}` : ""}</p>
      </div>

      {!locked ? (
        <div className="panel-flat p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="display text-2xl">Round {round.n}</p>
            <p className="display num text-4xl text-[var(--banana)]">{secs(round.pickClosesAt - now)}s</p>
          </div>
          <p className="mb-3 text-sm font-extrabold">{theyPicked ? "✅ They've locked in" : "⏳ They're still thinking"}</p>
          {myPick ? (
            <p className="rounded-xl border-2 border-[var(--ink)] bg-[var(--bg)] p-3 text-center font-extrabold">
              You called {arrow(myPick.direction)} at {myPick.multiplier}x. Picks reveal when the round locks.
            </p>
          ) : (
            <>
              <Field label="Multiplier">
                {MULTIPLIERS.map((x) => (
                  <Pill key={x} on={x === mult} onClick={() => setMult(x)} disabled={x > maxMultiplier}>
                    {x > maxMultiplier ? "🔒 " : ""}{x}x
                  </Pill>
                ))}
                <CustomNumber label="Custom multiplier" value={mult} presets={MULTIPLIERS} onChange={setMult} suffix="x" decimals={1} min={MIN_MULTIPLIER} max={maxMultiplier} />
              </Field>
              <p className="mb-3 text-xs text-[var(--muted)]">{mult !== null ? `A right call at ${mult}x scores +$${roundPayout(mult) - 100}.` : "Pick a multiplier."} Bigger multiplier, harder target.</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" disabled={mult === null} onClick={() => onPick("up")} className="btn btn-up display p-4 text-2xl">▲ Higher</button>
                <button type="button" disabled={mult === null} onClick={() => onPick("down")} className="btn btn-down display p-4 text-2xl">▼ Lower</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="panel-flat p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="display text-2xl">Round {round.n}</p>
            <p className="display num text-4xl text-[var(--banana)]">{round.expiresAt ? (now < round.expiresAt ? clock(round.expiresAt - now) : "…") : ""}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[me, them].map((s) => {
              const p = round.picks[s], t = target(s), w = winning(s);
              return (
                <div key={s} className={`rounded-xl border-[3px] p-3 ${w === true ? "border-[var(--green)]" : w === false ? "border-[var(--red)]" : "border-[var(--ink)]"}`}>
                  <p className="text-xs font-extrabold text-[var(--muted)]">{s === me ? "You" : "Them"}</p>
                  <p className="font-black">{p ? `${arrow(p.direction)} ${p.multiplier}x` : "No call"}</p>
                  {t !== null && <p className="text-xs">needs {p!.direction === "up" ? "above" : "below"} ${formatPrice(t)}</p>}
                  {w !== null && <p className={`text-xs font-black ${w ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{w ? "winning" : "losing"}</p>}
                </div>
              );
            })}
          </div>
          {now >= (round.expiresAt ?? Infinity) && <p className="mt-3 text-center text-sm font-extrabold text-[var(--muted)]">Checking the closing price…</p>}
        </div>
      )}
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
  const [amount, setAmount] = useState<number | null>(50);
  const [mult, setMult] = useState<number | null>(1);
  const { ticks, price } = usePriceStream(market);
  const ready = amount !== null && mult !== null;
  const left = endsAt - now;
  const fits = (m: number) => now + m * 60000 + 30000 < endsAt;
  const lines: ChartLine[] = trades
    .filter((t) => t.status === "open" && t.market === market)
    .map((t) => ({ price: t.targetPrice, label: `${t.side === me ? "You" : "Them"} ${t.direction === "up" ? "▲" : "▼"}`, color: t.side === me ? "var(--banana)" : "var(--pink)" }));

  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex gap-2">{MARKETS.map((m) => <Pill key={m} on={m === market} onClick={() => setMarket(m)}>{m}</Pill>)}</div>
          <p className="display num text-2xl">{price ? `$${formatPrice(price)}` : "…"}</p>
        </div>
        <PriceChart ticks={ticks} lines={lines} height={230} />
        {trades.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-xs">
            {[...trades].reverse().slice(0, 10).map((t) => (
              <li key={t.id} className="panel-flat flex justify-between gap-2 px-3 py-2">
                <span>{t.side === me ? "You" : "Them"}: {t.direction === "up" ? "▲" : "▼"} {t.market} ${t.amount} at {t.multiplier}x</span>
                <b className={t.status === "won" ? "text-[var(--green)]" : t.status === "lost" ? "text-[var(--red)]" : "text-[var(--muted)]"}>
                  {t.status === "open" ? clock(t.expiresAt - now) : t.status === "won" ? `+$${t.pnl}` : t.status === "lost" ? `-$${t.amount}` : "push"}
                </b>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="panel-flat p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <p className="display text-2xl">Arena</p>
          <p className="display num text-3xl text-[var(--banana)]">{left > 0 ? clock(left) : "…"}</p>
        </div>
        {left > 0 ? (
          <>
            <Field label="Ends in">{DURATIONS_MIN.map((m) => <Pill key={m} on={m === minutes} disabled={!fits(m)} onClick={() => setMinutes(m)}>{m} min</Pill>)}</Field>
            <Field label="Amount">
              {AMOUNTS.map((a) => <Pill key={a} on={a === amount} onClick={() => setAmount(a)}>${a}</Pill>)}
              <CustomNumber label="Custom amount in dollars" value={amount} presets={AMOUNTS} onChange={setAmount} prefix="$" min={MIN_AMOUNT} max={MAX_AMOUNT} />
            </Field>
            <Field label="Multiplier">
              {MULTIPLIERS.map((x) => <Pill key={x} on={x === mult} disabled={x > maxMultiplier} onClick={() => setMult(x)}>{x > maxMultiplier ? "🔒 " : ""}{x}x</Pill>)}
              <CustomNumber label="Custom multiplier" value={mult} presets={MULTIPLIERS} onChange={setMult} suffix="x" decimals={1} min={MIN_MULTIPLIER} max={maxMultiplier} />
            </Field>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button type="button" disabled={!fits(minutes) || !ready} onClick={() => onTrade({ market, direction: "up", minutes, amount, multiplier: mult })} className="btn btn-up display p-3 text-xl">▲ Higher</button>
              <button type="button" disabled={!fits(minutes) || !ready} onClick={() => onTrade({ market, direction: "down", minutes, amount, multiplier: mult })} className="btn btn-down display p-3 text-xl">▼ Lower</button>
            </div>
          </>
        ) : (
          <p className="text-sm font-extrabold text-[var(--muted)]">Time&apos;s up. Waiting for the last calls to settle…</p>
        )}
      </div>
    </div>
  );
}
