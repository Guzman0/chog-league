// This week's practice board: anyone playing Practice (no wallet), ranked by
// practice balance. Just for fun: no crown, no prize, and it never touches a
// Chog's real record. Players show as "Player ab12" (a short fingerprint of
// their practice ID, never the ID itself, which works like a login cookie).
import crypto from "crypto";
import { NextResponse } from "next/server";
import { summarize, weekStart } from "@/lib/game";
import { settleDue } from "@/lib/settle";
import { getPracticeNames, listDuels, listTrades } from "@/lib/store";
import { duelBalanceDelta } from "@/lib/duels";
import { getPracticeId } from "@/lib/practice";

const MIN_CALLS = 3; // finished calls this week before you show up

const tag = (practiceId: string) => crypto.createHash("sha256").update("chog-practice:" + practiceId).digest("hex").slice(0, 4);

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

  // One entry per practice player per Chog.
  const groups = new Map<string, { practiceId: string; tokenId: string }>();
  for (const t of week) {
    if (!t.practiceId || t.duelId) continue;
    groups.set(`${t.practiceId}|${t.tokenId}`, { practiceId: t.practiceId, tokenId: t.tokenId });
  }

  const nicknames = await getPracticeNames([...new Set([...[...groups.values()].map((g) => g.practiceId), ...(me ? [me] : [])])]);
  const rows = [...groups.values()]
    .map(({ practiceId, tokenId }) => {
      const s = summarize(tokenId, week, now, practiceId, duelBalanceDelta(tokenId, practiceDuels, now, practiceId));
      const finished = s.wins + s.losses;
      return { row: { tokenId, player: nicknames[practiceId] ?? `Player ${tag(practiceId)}`, tag: tag(practiceId), named: !!nicknames[practiceId], isMe: practiceId === me, weekBalance: s.weekBalance, wins: s.wins, losses: s.losses }, finished };
    })
    .filter((r) => r.finished >= MIN_CALLS)
    .map((r) => r.row)
    .sort((a, b) => b.weekBalance - a.weekBalance || b.wins - a.wins);

  const players = new Set(rows.map((r) => r.tag)).size;
  const myBest = rows.findIndex((r) => r.isMe);
  return NextResponse.json(
    {
      weekStart: ws,
      resetsAt: ws + 7 * 86400000,
      minCalls: MIN_CALLS,
      players,
      rows: rows.slice(0, 20),
      you: me ? { tag: tag(me), name: nicknames[me] ?? null } : null,
      me: myBest >= 20 ? { rank: myBest + 1, ...rows[myBest] } : null,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
