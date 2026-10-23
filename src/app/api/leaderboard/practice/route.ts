// This week's practice board: anyone playing Practice (no wallet), one row per
// player, ranked by practice profit this week across every Chog they played
// (each Chog has its own practice $1,000, so profit is the fair way to add them up).
// Just for fun: no crown, no prize, and it never touches a Chog's real record.
// Players show as their nickname or "Player ab12" (a short fingerprint of their
// practice ID, never the ID itself, which works like a login cookie).
import crypto from "crypto";
import { NextResponse } from "next/server";
import { weekStart, type Trade } from "@/lib/game";
import { settleDue } from "@/lib/settle";
import { getPracticeNames, listDuels, listTrades } from "@/lib/store";
import { duelBalanceDelta } from "@/lib/duels";
import { getPracticeId } from "@/lib/practice";

const MIN_CALLS = 3; // finished calls this week (any Chog) before you show up

const tag = (practiceId: string) => crypto.createHash("sha256").update("chog-practice:" + practiceId).digest("hex").slice(0, 4);
const round2 = (n: number) => Math.round(n * 100) / 100;

export async function GET() {
  const now = Date.now();
  const ws = weekStart(now);
  const me = await getPracticeId();
  await settleDue({ since: ws }).catch(() => {});
  const [week, duels] = await Promise.all([
    listTrades({ since: ws }),
    listDuels({ statuses: ["active", "done"], acceptedSince: ws }),
  ]);
  const practiceDuels = duels.filter((d) => d.mode === "practice");

  // Every practice call this week, grouped by player.
  const byPlayer = new Map<string, Trade[]>();
  for (const t of week) {
    if (!t.practiceId || t.duelId) continue;
    const list = byPlayer.get(t.practiceId) ?? [];
    list.push(t);
    byPlayer.set(t.practiceId, list);
  }
  const nicknames = await getPracticeNames([...new Set([...byPlayer.keys(), ...(me ? [me] : [])])]);

  const rows = [...byPlayer.entries()]
    .map(([practiceId, trades]) => {
      const finished = trades.filter((t) => t.status !== "open");
      const chogs = [...new Set(trades.map((t) => t.tokenId))];
      const duelDelta = chogs.reduce((s, id) => s + duelBalanceDelta(id, practiceDuels, now, practiceId), 0);
      // The Chog they played most, to show next to their name.
      const counts = new Map<string, number>();
      trades.forEach((t) => counts.set(t.tokenId, (counts.get(t.tokenId) ?? 0) + 1));
      const fave = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
      return {
        finished: finished.length,
        row: {
          tokenId: fave,
          chogs: chogs.length,
          player: nicknames[practiceId] ?? `Player ${tag(practiceId)}`,
          tag: tag(practiceId),
          named: !!nicknames[practiceId],
          isMe: practiceId === me,
          profit: round2(finished.reduce((s, t) => s + (t.pnl ?? 0), 0) + duelDelta),
          calls: finished.length,
          wins: finished.filter((t) => t.status === "won").length,
          losses: finished.filter((t) => t.status === "lost").length,
        },
      };
    })
    .filter((r) => r.finished >= MIN_CALLS)
    .map((r) => r.row)
    .sort((a, b) => b.profit - a.profit || b.wins - a.wins);

  const mine = me ? byPlayer.get(me) ?? [] : [];
  const myRank = rows.findIndex((r) => r.isMe);
  return NextResponse.json(
    {
      weekStart: ws,
      resetsAt: ws + 7 * 86400000,
      minCalls: MIN_CALLS,
      players: rows.length,
      rows: rows.slice(0, 20),
      you: me ? { tag: tag(me), name: nicknames[me] ?? null, calls: mine.filter((t) => t.status !== "open").length, open: mine.filter((t) => t.status === "open").length } : null,
      me: myRank >= 20 ? { rank: myRank + 1, ...rows[myRank] } : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
