// Server-side duel actions: load + advance + save, with retries when two
// players update the same duel at the same moment.
import { advanceDuel, FORMATS, type Duel } from "./duels";
import { getSettlementPrice, getSpot, getVolatility } from "./prices";
import { getDuel, listTrades, saveDuel } from "./store";
import { settleDue } from "./settle";
import type { Trade } from "./game";

const deps = { getSpot, getVolatility, getSettlementPrice };

// Loads a duel and moves it forward to now. Returns the duel and, for arenas, its trades.
export async function loadAndAdvance(id: string): Promise<{ duel: Duel; trades: Trade[] } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const duel = await getDuel(id);
    if (!duel) return null;
    let trades: Trade[] = [];
    if (FORMATS[duel.format].kind === "arena" && duel.status === "active") {
      await settleDue({ duelId: duel.id });
      trades = await listTrades({ duelId: duel.id });
    }
    const before = duel.version;
    const changed = await advanceDuel(duel, Date.now(), deps, trades);
    if (!changed || (await saveDuel(duel, before))) {
      if (FORMATS[duel.format].kind === "arena" && trades.length === 0) trades = await listTrades({ duelId: duel.id });
      return { duel, trades };
    }
  }
  const duel = await getDuel(id);
  return duel ? { duel, trades: await listTrades({ duelId: duel.id }) } : null;
}

// Applies a change to a duel safely. `fn` throws to refuse; returns the saved duel.
export async function mutateDuel(id: string, fn: (d: Duel) => void | Promise<void>): Promise<Duel> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const loaded = await loadAndAdvance(id);
    if (!loaded) throw new Error("Duel not found");
    const d = loaded.duel;
    const before = d.version;
    await fn(d);
    if (await saveDuel(d, before)) {
      // Picks can complete a round instantly (e.g. vs the bot), so advance once more.
      return (await loadAndAdvance(id))?.duel ?? d;
    }
  }
  throw new Error("Busy, please try again");
}
