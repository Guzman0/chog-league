"use client";

import type { ChogData } from "@/lib/chog";
import type { ChogSummary, Trade } from "@/lib/game";
import { short } from "./WalletButton";
import ChogAvatar, { useReaction } from "./ChogAvatar";

// What the Chog says, based on how it's trading right now.
function mood(s: ChogSummary | undefined, crowned: boolean) {
  if (crowned) return { face: "👑", line: "Top of the league. Bow down." };
  if (!s || s.totalTrades === 0) return { face: "👀", line: "Fresh Chog. Make the first call." };
  if (s.openTrades > 0) return { face: "😬", line: "Watching the chart…" };
  if (s.streak >= 3) return { face: "🔥", line: `${s.streak} wins in a row. Unstoppable.` };
  if (s.lastResult === "won") return { face: "🚀", line: "LFG! Called it." };
  if (s.streak <= -3) return { face: "🥶", line: `${-s.streak} losses in a row. Touch grass?` };
  if (s.lastResult === "lost") return { face: "😿", line: "Rekt. Shake it off." };
  return { face: "😐", line: "Even. Next one." };
}

// Always-visible strip: the Chog (reacting), its level, mood and balance.
export function ChogBar({
  chog, isMine, mode, summary, lastSettled, crowned, onSwitch, onMode, leagueLocked,
}: {
  chog: ChogData;
  isMine: boolean;
  mode: "league" | "practice";
  summary?: ChogSummary; // of the current mode
  lastSettled?: Trade;
  crowned: boolean;
  onSwitch: () => void;
  onMode: (m: "league" | "practice") => void;
  leagueLocked: boolean;
}) {
  const reaction = useReaction(lastSettled);
  const m = mood(summary, crowned);
  return (
    <section className="panel flex flex-wrap items-center gap-4 sm:flex-nowrap">
      <div className="w-24 shrink-0 sm:w-28">
        <ChogAvatar image={chog.image} name={chog.name} crowned={crowned} streak={summary?.streak ?? 0} reaction={reaction} size="md" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="truncate text-2xl">{chog.name}</h2>
          <span className="text-sm text-[var(--muted)]">token {chog.tokenId}</span>
        </div>
        <p className="text-sm font-extrabold">
          {summary ? `Level ${summary.level.level} ${summary.level.title}` : "…"}
          <span className="font-semibold text-[var(--muted)]"> {isMine ? "is yours" : `owned by ${short(chog.owner)}`}</span>
        </p>
        <p className="mt-2 inline-block rounded-xl border-2 border-[var(--ink)] bg-[var(--text)] px-3 py-1 text-sm font-extrabold text-[var(--ink)]">
          {m.face} {m.line}
        </p>
      </div>
      <div className="flex w-full flex-wrap items-end justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
        <div className="sm:text-right">
          <p className="text-xs font-extrabold text-[var(--muted)]">{mode === "practice" ? "Practice balance" : "League balance"}</p>
          <p className="display num text-3xl text-[var(--banana)]">{summary ? `$${summary.weekBalance.toLocaleString()}` : "…"}</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-xl border-2 border-[var(--ink)] bg-[var(--panel-2)] p-0.5 text-sm" role="group" aria-label="Mode">
            <button type="button" aria-pressed={mode === "league"} disabled={leagueLocked} onClick={() => onMode("league")} title={leagueLocked ? "Only this Chog's owner can play in the league" : undefined}
              className={`rounded-lg px-3 py-1 font-extrabold disabled:opacity-50 ${mode === "league" ? "bg-[var(--banana)] text-[var(--ink)]" : ""}`}>
              League{leagueLocked ? " 🔒" : ""}
            </button>
            <button type="button" aria-pressed={mode === "practice"} onClick={() => onMode("practice")}
              className={`rounded-lg px-3 py-1 font-extrabold ${mode === "practice" ? "bg-[var(--banana)] text-[var(--ink)]" : ""}`}>
              Practice
            </button>
          </div>
          <button type="button" className="btn btn-ghost px-3 py-1 text-sm" onClick={onSwitch}>Switch Chog</button>
        </div>
      </div>
    </section>
  );
}

// League tab: the Chog's permanent record (this is what a buyer gets).
export function ChogRecord({ chog, summary, duelRecord }: { chog: ChogData; summary?: ChogSummary; duelRecord?: { wins: number; losses: number; draws: number } | null }) {
  const lvl = summary?.level;
  const net = Math.max(0, summary?.netWins ?? 0);
  const toNext = lvl?.next ? lvl.next.netWins - net : 0;
  const pct = lvl?.next ? Math.min(100, ((net - lvl.netWins) / (lvl.next.netWins - lvl.netWins)) * 100) : 100;

  return (
    <section className="panel">
      <h3 className="mb-1 text-2xl">{chog.name}&apos;s record</h3>
      <p className="mb-4 text-sm text-[var(--muted)]">Saved to the NFT, not the wallet. If this Chog is sold, its level and record go with it.</p>

      {lvl && (
        <div className="panel-flat mb-4 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="display text-2xl">Level {lvl.level} {lvl.title}</p>
            <p className="text-sm font-extrabold">Multipliers up to {lvl.maxMultiplier}x</p>
          </div>
          <div className="my-2 h-4 overflow-hidden rounded-full border-2 border-[var(--ink)] bg-[var(--bg)]">
            <div className="h-full bg-[var(--banana)]" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-[var(--muted)]">
            {lvl.next
              ? `${toNext} more net win${toNext === 1 ? "" : "s"} to level ${lvl.next.level}, which unlocks ${lvl.next.maxMultiplier}x. Net wins are wins minus losses, so luck cancels out.`
              : "Max level. This Chog is a proven trader."}
          </p>
        </div>
      )}

      {summary && (
        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="This week" value={`$${summary.weekBalance.toLocaleString()}`} sub={`${summary.weekPnl >= 0 ? "+" : "-"}$${Math.abs(summary.weekPnl)}`} good={summary.weekPnl >= 0} />
          <Stat label="Calls" value={`${summary.wins} won, ${summary.losses} lost`} />
          <Stat label="Hit rate" value={summary.hitRate === null ? "–" : `${Math.round(summary.hitRate * 100)}%`} />
          <Stat label="Duels" value={duelRecord ? `${duelRecord.wins} won, ${duelRecord.losses} lost` : "–"} />
        </dl>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-extrabold text-[var(--muted)]">Traits</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {chog.traits.map((t) => (
            <span key={`${t.trait_type}-${t.value}`} className="rounded-full border-2 border-[var(--ink)] bg-[var(--panel-2)] px-3 py-1 text-xs">
              <span className="text-[var(--muted)]">{t.trait_type}:</span> {String(t.value)}
            </span>
          ))}
        </div>
      </details>
    </section>
  );
}

function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="panel-flat p-3">
      <dt className="text-xs font-extrabold text-[var(--muted)]">{label}</dt>
      <dd className="font-black">{value}</dd>
      {sub && <dd className={`text-xs font-black ${good ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{sub}</dd>}
    </div>
  );
}
