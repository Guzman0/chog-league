// Hall of Champions: the #1 Chog of each finished league week (league only,
// never practice), newest first. Last week's #1 is the reigning champion.
import { NextResponse } from "next/server";
import { WEEK_MS, summarize, weekStart } from "@/lib/game";
import { duelBalanceDelta } from "@/lib/duels";
import { listDuels, listTrades } from "@/lib/store";

const WEEKS = 12; // how far back to look

type Champion = { weekStart: number; tokenId: string; balance: number; wins: number; losses: number; players: number };

let cache: { at: number; currentWeek: number; champions: Champion[] } | null = null;

export async function GET() {
  const now = Date.now();
  const cur = weekStart(now);
  // Finished weeks never change, so the answer only needs refreshing occasionally.
  if (cache && cache.currentWeek === cur && now - cache.at < 5 * 60000) {
    return NextResponse.json({ champions: cache.champions });
  }

  const from = cur - WEEKS * WEEK_MS;
  const [trades, duels] = await Promise.all([
    listTrades({ since: from, practiceId: null }),
    listDuels({ statuses: ["done"], acceptedSince: from }),
  ]);
  const league = trades.filter((t) => !t.duelId && t.openedAt < cur && t.status !== "open");
  const leagueDuels = duels.filter((d) => d.mode === "league" && (d.acceptedAt ?? 0) < cur);

  const champions: Champion[] = [];
  for (let w = cur - WEEK_MS; w >= from; w -= WEEK_MS) {
    const end = w + WEEK_MS - 1;
    const weekTrades = league.filter((t) => t.openedAt >= w && t.openedAt <= end);
    const weekDuels = leagueDuels.filter((d) => d.acceptedAt! >= w && d.acceptedAt! <= end);
    const ids = [...new Set([...weekTrades.map((t) => t.tokenId), ...weekDuels.flatMap((d) => [d.challengerToken, d.opponentToken])])];
    if (!ids.length) continue;
    const rows = ids
      .map((id) => summarize(id, weekTrades, end, null, duelBalanceDelta(id, weekDuels, end, null)))
      .sort((a, b) => b.weekBalance - a.weekBalance || b.netWins - a.netWins);
    const top = rows[0];
    champions.push({ weekStart: w, tokenId: top.tokenId, balance: top.weekBalance, wins: top.wins, losses: top.losses, players: rows.length });
  }

  cache = { at: now, currentWeek: cur, champions };
  return NextResponse.json({ champions });
}
