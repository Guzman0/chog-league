// The weekly prize pot: the base prize plus 70% of that week's shop sales.
import { WEEK_MS } from "./game";
import { listPurchases } from "./store";
import { prizeFor } from "./shop";

export async function weekPrize(weekStartMs: number) {
  const sales = await listPurchases({ since: weekStartMs, until: weekStartMs + WEEK_MS - 1 })
    .then((ps) => ps.reduce((n, p) => n + p.price, 0))
    .catch(() => 0); // shop tables not created yet: no sales
  return prizeFor(sales);
}
