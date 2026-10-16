// The weekly prize pot: the base prize, plus 70% of that week's shop sales,
// plus everything chipped in that week.
import { WEEK_MS } from "./game";
import { listChipins, listPurchases } from "./store";
import { prizeFor } from "./shop";

export async function weekPrize(weekStartMs: number) {
  const range = { since: weekStartMs, until: weekStartMs + WEEK_MS - 1 };
  const [purchases, chipins] = await Promise.all([
    listPurchases(range).catch(() => []), // shop tables not created yet: no sales
    listChipins(range).catch(() => []),
  ]);
  const sales = purchases.reduce((n, p) => n + p.price, 0);
  const chips = chipins.reduce((n, c) => n + c.amount, 0);
  // Top chippers this week (by wallet).
  const by = new Map<string, number>();
  for (const c of chipins) by.set(c.wallet, (by.get(c.wallet) ?? 0) + c.amount);
  const topChippers = [...by].map(([wallet, amount]) => ({ wallet, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
  return { ...prizeFor(sales, chips), topChippers };
}
