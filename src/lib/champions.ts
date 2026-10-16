// Hall of Champions (used by /api/champions and /api/tips): the #1 Chog of each finished league week (league only,
// never practice), newest first. Last week's #1 is the reigning champion.
// Each week also shows its $CHOG prize and, once paid, links to the payments.
import { WEEK_MS, summarize, weekStart } from "@/lib/game";
import { duelBalanceDelta } from "@/lib/duels";
import { listChipins, listDuels, listPayouts, listPurchases, listTips, listTrades } from "@/lib/store";
import { ownerOfCached } from "@/lib/chain";
import { prizeFor, weekKey } from "@/lib/shop";

const WEEKS = 12; // how far back to look

export type Champion = {
  weekStart: number; tokenId: string; balance: number; wins: number; losses: number; players: number;
  // The $CHOG prize for that week, and the payment links once the team has paid it.
  prize: number; burn: number; chips: number; paidTx?: string; burnTx?: string;
  owner?: string; // the Chog's current owner (who gets the prize and tips)
  tipTotal?: number; tippers?: number; // tips sent to the reigning champion
};

let cache: { at: number; currentWeek: number; champions: Champion[] } | null = null;

/** Champions, newest first, with prizes. Tips are added live by withTips(). */
export async function getChampions(): Promise<Champion[]> {
  const now = Date.now();
  const cur = weekStart(now);
  // Finished weeks rarely change, so the answer only needs refreshing occasionally.
  if (cache && cache.currentWeek === cur && now - cache.at < 2 * 60000) return cache.champions;

  const from = cur - WEEKS * WEEK_MS;
  const [trades, duels, purchases, payouts, chipins] = await Promise.all([
    listTrades({ since: from, practiceId: null }),
    listDuels({ statuses: ["done"], acceptedSince: from }),
    listPurchases({ since: from }).catch(() => []),
    listPayouts(),
    listChipins({ since: from }).catch(() => []),
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
    const sales = purchases.filter((p) => p.createdAt >= w && p.createdAt <= end).reduce((n, p) => n + p.price, 0);
    const chips = chipins.filter((c) => c.createdAt >= w && c.createdAt <= end).reduce((n, c) => n + c.amount, 0);
    const { prize, burn } = prizeFor(sales, chips);
    const paid = payouts.find((p) => p.week === weekKey(w));
    champions.push({
      weekStart: w, tokenId: top.tokenId, balance: top.weekBalance, wins: top.wins, losses: top.losses, players: rows.length,
      prize, burn, chips, ...(paid?.paidTx ? { paidTx: paid.paidTx } : {}), ...(paid?.burnTx ? { burnTx: paid.burnTx } : {}),
    });
  }

  // Who to pay (and tip): the Chog's current owner. Always for the reigning
  // champion, and for older weeks while their prize is unpaid.
  await Promise.all(
    champions.filter((c, i) => i === 0 || !c.paidTx).slice(0, 4).map(async (c) => {
      c.owner = await Promise.race([ownerOfCached(c.tokenId, 10 * 60000), new Promise<undefined>((r) => setTimeout(r, 4000))]).catch(() => undefined);
    }),
  );

  cache = { at: now, currentWeek: cur, champions };
  return champions;
}

/** Adds the live tip total to the reigning champion. */
export async function withTips(champions: Champion[]): Promise<Champion[]> {
  const top = champions[0];
  if (!top) return champions;
  const tips = await listTips({ tokenId: top.tokenId, week: weekKey(top.weekStart) }).catch(() => []);
  return [{ ...top, tipTotal: tips.reduce((n, t) => n + t.amount, 0), tippers: new Set(tips.map((t) => t.from)).size }, ...champions.slice(1)];
}
