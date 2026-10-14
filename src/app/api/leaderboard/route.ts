// This week's leaderboard: every Chog that traded this week (league trades
// only, never practice), ranked by balance.
import { NextResponse } from "next/server";
import { summarize, weekStart } from "@/lib/game";
import { settleDue } from "@/lib/settle";
import { listDuels, listTrades } from "@/lib/store";
import { duelBalanceDelta } from "@/lib/duels";

export async function GET() {
  const ws = weekStart(Date.now());
  await settleDue({ since: ws, practiceId: null });
  const [week, duels] = await Promise.all([
    listTrades({ since: ws, practiceId: null }),
    listDuels({ statuses: ["active", "done"], acceptedSince: ws }),
  ]);
  const leagueDuels = duels.filter((d) => d.mode === "league");
  const ids = [...new Set([
    ...week.filter((t) => !t.duelId).map((t) => t.tokenId),
    ...leagueDuels.flatMap((d) => [d.challengerToken, d.opponentToken]),
  ])];
  // Levels need each Chog's whole career, not just this week.
  const career = ids.length ? (await listTrades({ tokenIds: ids, practiceId: null })).filter((t) => !t.duelId) : [];
  const rows = ids
    .map((id) => summarize(id, career, Date.now(), null, duelBalanceDelta(id, leagueDuels, Date.now(), null)))
    .sort((a, b) => b.weekBalance - a.weekBalance || b.netWins - a.netWins)
    .slice(0, 20);
  return NextResponse.json({ weekStart: ws, resetsAt: ws + 7 * 86400000, rows });
}
