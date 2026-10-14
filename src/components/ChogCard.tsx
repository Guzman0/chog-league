"use client";

import type { ChogData } from "@/lib/chog";
import type { ChogSummary, Trade } from "@/lib/game";
import { short } from "./WalletButton";
import ChogAvatar, { useReaction } from "./ChogAvatar";

// The Chog reacts to how it's trading.
function mood(s: ChogSummary | undefined) {
  if (!s || s.totalTrades === 0) return { face: "👀", line: "Fresh Chog. Ready for its first trade." };
  if (s.openTrades > 0) return { face: "😬", line: "Watching the chart…" };
  if (s.streak >= 3) return { face: "🔥", line: `${s.streak} wins in a row. Unstoppable.` };
  if (s.lastResult === "won") return { face: "🚀", line: "LFG! Called it." };
  if (s.streak <= -3) return { face: "🥶", line: `${-s.streak} losses in a row. Maybe touch grass?` };
  if (s.lastResult === "lost") return { face: "😿", line: "Rekt. Shake it off." };
  return { face: "😐", line: "Even. Next one." };
}

export default function ChogCard({
  chog, isMine, summary, moodFrom, lastSettled, crowned = false, duelRecord,
}: {
  duelRecord?: { wins: number; losses: number; draws: number } | null;
  chog: ChogData;
  isMine: boolean;
  summary?: ChogSummary;
  moodFrom?: ChogSummary; // practice or league, whichever you're playing right now
  lastSettled?: Trade; // newest settled trade in the current mode; triggers a reaction
  crowned?: boolean; // #1 in this week's league
}) {
  const m = crowned ? { face: "👑", line: "Top of the league. Bow down." } : mood(moodFrom ?? summary);
  const reaction = useReaction(lastSettled);
  const lvl = summary?.level;
  const toNext = lvl?.next ? lvl.next.netWins - Math.max(0, summary!.netWins) : 0;
  const pct = lvl?.next ? Math.min(100, (Math.max(0, summary!.netWins) - lvl.netWins) / (lvl.next.netWins - lvl.netWins) * 100) : 100;

  return (
    <section className="grid gap-6 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 sm:grid-cols-[220px_1fr]">
      <div>
        <div className="relative">
          <ChogAvatar image={chog.image} name={chog.name} crowned={crowned} streak={(moodFrom ?? summary)?.streak ?? 0} reaction={reaction} />
          <div className="absolute -bottom-3 left-3 right-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-sm shadow-lg">
            <span className="mr-1 text-lg">{m.face}</span>
            {m.line}
          </div>
        </div>
        <p className={`mt-6 text-center text-sm font-semibold ${isMine ? "text-[var(--green)]" : "text-[var(--muted)]"}`}>
          {isMine ? "You own this Chog" : `Spectating · owner ${short(chog.owner)}`}
        </p>
      </div>

      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-bold">{chog.name}</h2>
          <p className="text-xs text-[var(--muted)]">Token ID {chog.tokenId} · League record below</p>
        </div>

        {lvl && (
          <div className="rounded-xl border border-[var(--purple)] p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-lg font-bold">Level {lvl.level} · {lvl.title}</p>
              <p className="text-sm text-[var(--muted)]">Up to {lvl.maxMultiplier}x</p>
            </div>
            <div className="my-2 h-2 overflow-hidden rounded-full bg-[var(--line)]">
              <div className="h-full bg-[var(--purple)]" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-[var(--muted)]">
              {lvl.next
                ? `${toNext} more net win${toNext === 1 ? "" : "s"} to Level ${lvl.next.level} (unlocks ${lvl.next.maxMultiplier}x). Net wins = wins minus losses.`
                : "Max level. This Chog is a proven trader."}
            </p>
          </div>
        )}

        {summary && (
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="This week" value={`$${summary.weekBalance.toLocaleString()}`} sub={`${summary.weekPnl >= 0 ? "+" : ""}$${summary.weekPnl}`} good={summary.weekPnl >= 0} />
            <Stat label="Record" value={`${summary.wins}W · ${summary.losses}L`} />
            <Stat label="Hit rate" value={summary.hitRate === null ? "–" : `${Math.round(summary.hitRate * 100)}%`} />
            <Stat label="Duels" value={duelRecord ? `${duelRecord.wins}W · ${duelRecord.losses}L` : "–"} sub={duelRecord?.draws ? `${duelRecord.draws} draw${duelRecord.draws > 1 ? "s" : ""}` : undefined} />
          </dl>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-[var(--muted)]">Traits</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {chog.traits.map((t) => (
              <span key={`${t.trait_type}-${t.value}`} className="rounded-full border border-[var(--line)] px-3 py-1 text-xs">
                <span className="text-[var(--muted)]">{t.trait_type}:</span> {String(t.value)}
              </span>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}

function Stat({ label, value, sub, good }: { label: string; value: string; sub?: string; good?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--line)] p-3">
      <dt className="text-xs text-[var(--muted)]">{label}</dt>
      <dd className="font-semibold">{value}</dd>
      {sub && <dd className={`text-xs ${good ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{sub}</dd>}
    </div>
  );
}
