// Loads everything needed for a Chog's full summary: its trades plus the
// effect of duels on its balance. Server-side only.
import { inScope, summarize, weekStart } from "./game";
import { duelBalanceDelta, duelRecord } from "./duels";
import { listDuels, listTrades } from "./store";

export async function chogSummary(tokenId: string, practiceId: string | null, now = Date.now()) {
  const [trades, duels] = await Promise.all([
    listTrades({ tokenId, practiceId }),
    listDuels({ tokenIds: [tokenId], statuses: ["active", "done"], acceptedSince: weekStart(now) }),
  ]);
  const scoped = trades.filter((t) => inScope(t, tokenId, practiceId));
  return { summary: summarize(tokenId, scoped, now, practiceId, duelBalanceDelta(tokenId, duels, now, practiceId)), trades: scoped };
}

export async function duelRecordFor(tokenId: string) {
  return duelRecord(tokenId, await listDuels({ tokenIds: [tokenId], statuses: ["done"] }));
}
