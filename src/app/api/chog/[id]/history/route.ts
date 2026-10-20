// A Chog's full history, a page at a time.
//   ?kind=calls  every finished call (newest first) + totals; filters: result=won|lost, market=BTC…
//   ?kind=duels  every finished duel (newest first) + win/loss record and opponents
// Add &practice=1 for this browser's practice history with the Chog instead.
// Like the rest of the record, it belongs to the token ID, so anyone can view it.
import { NextResponse } from "next/server";
import { MARKETS, inScope, type Market, type Trade } from "@/lib/game";
import { FORMATS, BOT_TOKEN, other, type Duel, type Side } from "@/lib/duels";
import { listDuels, listTrades } from "@/lib/store";
import { getPracticeId } from "@/lib/practice";
import { loadMeta } from "@/lib/meta";
import { resolveUri } from "@/lib/chog";

const PAGE = 25;

function imageUrl(raw?: string) {
  if (!raw) return null;
  return /^(ipfs|ar):\/\//.test(raw) || /\/ipfs\/|arweave\.net/.test(raw) ? `/api/img?u=${encodeURIComponent(raw)}` : resolveUri(raw);
}

async function opponentInfo(tokenId: string) {
  if (tokenId === BOT_TOKEN) return { name: "Bot Chog", image: null };
  const timeout = new Promise<null>((r) => setTimeout(() => r(null), 4000));
  const loaded = await Promise.race([loadMeta(tokenId).catch(() => null), timeout]);
  const meta = loaded?.meta;
  return { name: meta?.name || `Chog #${tokenId}`, image: imageUrl(meta?.image || meta?.image_url) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Token ID must be a number" }, { status: 400 });
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind") === "duels" ? "duels" : "calls";
  const cursor = Math.max(0, Number(q.get("cursor")) || 0);
  const practice = q.has("practice");
  const practiceId = practice ? await getPracticeId() : null;
  if (practice && !practiceId) return NextResponse.json({ kind, items: [], stats: null, next: null });

  try {
    return NextResponse.json(kind === "calls" ? await calls(id, practiceId, q, cursor) : await duels(id, practiceId, cursor));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load history" }, { status: 500 });
  }
}

async function calls(tokenId: string, practiceId: string | null, q: URLSearchParams, cursor: number) {
  const all = (await listTrades({ tokenId, practiceId }))
    .filter((t) => inScope(t, tokenId, practiceId) && t.status !== "open")
    .sort((a, b) => b.expiresAt - a.expiresAt);

  const won = all.filter((t) => t.status === "won");
  const lost = all.filter((t) => t.status === "lost");
  const pnl = (t: Trade) => t.pnl ?? 0;
  const perMarket = MARKETS.map((m) => ({ m, n: all.filter((t) => t.market === m).length })).sort((a, b) => b.n - a.n);
  const stats = {
    total: all.length,
    won: won.length,
    lost: lost.length,
    hitRate: won.length + lost.length ? Math.round((won.length / (won.length + lost.length)) * 100) : null,
    net: round2(all.reduce((s, t) => s + pnl(t), 0)),
    best: won.length ? Math.max(...won.map(pnl)) : null,
    worst: lost.length ? Math.min(...lost.map(pnl)) : null,
    favMarket: perMarket[0]?.n ? perMarket[0].m : null,
  };

  const result = q.get("result");
  const market = q.get("market") as Market | null;
  const filtered = all.filter(
    (t) => (result === "won" || result === "lost" ? t.status === result : true) && (market && MARKETS.includes(market) ? t.market === market : true),
  );
  const items = filtered.slice(cursor, cursor + PAGE);
  return { kind: "calls", items, stats, matching: filtered.length, next: cursor + PAGE < filtered.length ? cursor + PAGE : null };
}

async function duels(tokenId: string, practiceId: string | null, cursor: number) {
  const mine: { d: Duel; side: Side }[] = [];
  for (const d of await listDuels({ tokenIds: [tokenId], statuses: ["done"] })) {
    let side: Side | null = null;
    if (practiceId) {
      if (d.mode !== "practice") continue;
      if (d.challengerToken === tokenId && d.challengerPractice === practiceId) side = "challenger";
      else if (d.opponentToken === tokenId && d.opponentPractice === practiceId) side = "opponent";
    } else {
      if (d.mode !== "league") continue;
      side = d.challengerToken === tokenId ? "challenger" : d.opponentToken === tokenId ? "opponent" : null;
    }
    if (side && d.result) mine.push({ d, side });
  }
  const when = (d: Duel) => d.endsAt ?? d.acceptedAt ?? d.createdAt;
  mine.sort((a, b) => when(b.d) - when(a.d));

  const outcome = ({ d, side }: { d: Duel; side: Side }) =>
    d.result!.winner === "draw" ? "draw" : d.result!.winner === side ? "won" : "lost";
  const wins = mine.filter((x) => outcome(x) === "won");
  const losses = mine.filter((x) => outcome(x) === "lost");
  const stats = {
    total: mine.length,
    won: wins.length,
    lost: losses.length,
    draws: mine.length - wins.length - losses.length,
    net: wins.reduce((s, x) => s + x.d.stake, 0) - losses.reduce((s, x) => s + x.d.stake, 0),
  };

  const page = mine.slice(cursor, cursor + PAGE);
  const opponents = [...new Set(page.map(({ d, side }) => (side === "challenger" ? d.opponentToken : d.challengerToken)))];
  const info = Object.fromEntries(await Promise.all(opponents.map(async (t) => [t, await opponentInfo(t)] as const)));

  const items = page.map(({ d, side }) => {
    const them = other(side);
    const oppToken = side === "challenger" ? d.opponentToken : d.challengerToken;
    const f = FORMATS[d.format];
    const r = d.result!;
    const mineScore = f.kind === "arena" ? r.bankrolls?.[side] : r.score?.[side];
    const theirScore = f.kind === "arena" ? r.bankrolls?.[them] : r.score?.[them];
    return {
      id: d.id,
      at: when(d),
      format: f.label,
      arena: f.kind === "arena",
      market: d.market,
      stake: d.stake,
      result: outcome({ d, side }),
      mine: mineScore ?? null,
      theirs: theirScore ?? null,
      reason: r.reason ?? null,
      opponent: { tokenId: oppToken, bot: d.isBot || oppToken === BOT_TOKEN, ...info[oppToken] },
    };
  });
  return { kind: "duels", items, stats, next: cursor + PAGE < mine.length ? cursor + PAGE : null };
}
