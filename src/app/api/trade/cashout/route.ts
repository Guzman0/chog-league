// Cash out a live call early, for what it's worth right now.
//   GET  ?id=<tradeId>  → { value, pnl, price } a quote (nothing changes)
//   POST { id }         → closes the call at the server's current price
// Only the player who made the call can cash it out: league calls need the
// signed-in owner of the Chog, practice calls need the same practice browser.
import { NextResponse } from "next/server";
import { CASHOUT_CUTOFF_MS, cashOutValue, type Trade } from "@/lib/game";
import { getSpot, getVolatility } from "@/lib/prices";
import { getSessionAddress } from "@/lib/session";
import { getPracticeId } from "@/lib/practice";
import { ownerOf } from "@/lib/chain";
import { cashOutTrade, getTrade } from "@/lib/store";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });

async function load(id: unknown, checkOwner: boolean): Promise<Trade | NextResponse> {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return bad("Unknown call");
  const t = await getTrade(id).catch(() => null);
  if (!t || t.duelId) return bad("Unknown call", 404);
  if (t.status !== "open") return bad("This call already ended");
  if (t.practiceId) {
    if ((await getPracticeId()) !== t.practiceId) return bad("That's not your call", 403);
  } else {
    const wallet = await getSessionAddress();
    if (!wallet || wallet !== t.wallet) return bad("Sign in with the wallet that made this call", 401);
    if (checkOwner) {
      try {
        if ((await ownerOf(t.tokenId)) !== wallet) return bad("This wallet doesn't own that Chog any more", 403);
      } catch {
        return bad("Couldn't check Chog ownership on Monad, try again", 502);
      }
    }
  }
  if (t.expiresAt - Date.now() < CASHOUT_CUTOFF_MS) return bad("Too late to cash out: the result is seconds away");
  return t;
}

async function quote(t: Trade) {
  const [price, sigma] = await Promise.all([getSpot(t.market), getVolatility(t.market)]);
  const now = Date.now();
  const value = cashOutValue(t, price, sigma, now);
  return { value, pnl: Math.round((value - t.amount) * 100) / 100, price, now };
}

export async function GET(req: Request) {
  const t = await load(new URL(req.url).searchParams.get("id"), false);
  if (t instanceof NextResponse) return t;
  try {
    const q = await quote(t);
    return NextResponse.json({ value: q.value, pnl: q.pnl, price: q.price }, { headers: { "cache-control": "no-store" } });
  } catch {
    return bad("Live price unavailable, try again", 502);
  }
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const t = await load(b.id, true);
  if (t instanceof NextResponse) return t;
  try {
    const q = await quote(t);
    const ok = await cashOutTrade(t.id, { settlePrice: q.price, payout: q.value, pnl: q.pnl, closedAt: q.now });
    if (!ok) return bad("This call already ended");
    return NextResponse.json({ value: q.value, pnl: q.pnl, price: q.price });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Couldn't cash out, try again", 500);
  }
}
