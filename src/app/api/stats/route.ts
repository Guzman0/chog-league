// Usage totals since launch (read-only): how many people and Chogs have played.
// Players = distinct practice browsers + distinct league wallets.
import { NextResponse } from "next/server";
import { listDuels, listTrades } from "@/lib/store";

export async function GET() {
  const [trades, duels] = await Promise.all([listTrades({}), listDuels({ statuses: ["done"] })]);
  const calls = trades.filter((t) => !t.duelId);
  const finished = calls.filter((t) => t.status !== "open");
  const practicePlayers = new Set(calls.filter((t) => t.practiceId).map((t) => t.practiceId));
  const leagueWallets = new Set(calls.filter((t) => !t.practiceId && t.wallet).map((t) => t.wallet));
  const first = calls.reduce((m, t) => Math.min(m, t.openedAt), Date.now());
  return NextResponse.json(
    {
      since: new Date(first).toISOString().slice(0, 10),
      players: practicePlayers.size + leagueWallets.size,
      practicePlayers: practicePlayers.size,
      leagueWallets: leagueWallets.size,
      chogs: new Set(calls.map((t) => t.tokenId)).size,
      calls: finished.length,
      leagueCalls: finished.filter((t) => !t.practiceId).length,
      duels: duels.length,
      cashOuts: finished.filter((t) => t.status === "cashed").length,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
