// Settles any trades whose timer has ended, using the exchange's closing price
// for that minute. Runs whenever someone views a Chog, a duel or the
// leaderboard, so no background job is needed.
import { settleOutcome } from "./game";
import { getSettlementPrice } from "./prices";
import { listTrades, settleTrades, type TradeFilter } from "./store";

export async function settleDue(filter: Omit<TradeFilter, "dueBefore"> = {}) {
  const due = await listTrades({ ...filter, dueBefore: Date.now() - 3000 });
  if (due.length === 0) return;

  const prices = new Map<string, number>();
  for (const t of due) {
    const key = `${t.market}:${t.expiresAt}`;
    if (prices.has(key)) continue;
    try {
      const p = await getSettlementPrice(t.market, t.expiresAt);
      if (p !== null) prices.set(key, p);
    } catch {
      // price service hiccup; we'll settle on the next view
    }
  }

  const updates = due.flatMap((t) => {
    const p = prices.get(`${t.market}:${t.expiresAt}`);
    return p === undefined ? [] : [{ id: t.id, patch: settleOutcome(t, p) }];
  });
  await settleTrades(updates);
}
