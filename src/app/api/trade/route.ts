// Open a trade for a Chog. All prices and limits are decided here on the
// server, never trusted from the browser.
//
// Two modes:
//  - League (default): wallet must be signed in and own the Chog. Counts
//    toward the Chog's record, level and the weekly league.
//  - Practice ({ practice: true }): no wallet needed, any Chog, all
//    multipliers unlocked. Never counts toward anything real.
import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  AMOUNTS, DURATIONS_MIN, MARKETS, MAX_OPEN_TRADES, MULTIPLIERS,
  expiryFor, targetPrices, type Direction, type Market, type Trade,
} from "@/lib/game";
import { getSpot, getVolatility } from "@/lib/prices";
import { getSessionAddress } from "@/lib/session";
import { ownerOf } from "@/lib/chain";
import { settleDue } from "@/lib/settle";
import { insertTrade } from "@/lib/store";
import { chogSummary } from "@/lib/records";
import { CHOG_SUPPLY } from "@/lib/chog";
import { PRACTICE_COOKIE, getPracticeId, newPracticeId, practiceCookieOptions } from "@/lib/practice";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const practice = b.practice === true;
  const tokenId = String(b.tokenId ?? "");
  const market = b.market as Market;
  const direction = b.direction as Direction;
  const minutes = Number(b.minutes);
  const amount = Number(b.amount);
  const multiplier = Number(b.multiplier);

  if (!/^\d+$/.test(tokenId) || Number(tokenId) > CHOG_SUPPLY) return bad("Pick a Chog");
  if (!MARKETS.includes(market)) return bad("Unknown market");
  if (direction !== "up" && direction !== "down") return bad("Pick HIGHER or LOWER");
  if (!DURATIONS_MIN.includes(minutes)) return bad("Unsupported duration");
  if (!AMOUNTS.includes(amount)) return bad("Unsupported amount");
  if (!MULTIPLIERS.includes(multiplier)) return bad("Unsupported multiplier");

  let wallet = "";
  let practiceId: string | null = null;
  let setCookie = false;

  if (practice) {
    practiceId = await getPracticeId();
    if (!practiceId) {
      practiceId = newPracticeId();
      setCookie = true;
    }
  } else {
    const session = await getSessionAddress();
    if (!session) return bad("Sign in with your wallet first", 401);
    wallet = session;
    try {
      if ((await ownerOf(tokenId)) !== wallet) return bad("This wallet doesn't own that Chog", 403);
    } catch {
      return bad("Couldn't check Chog ownership on Monad, try again", 502);
    }
  }

  await settleDue({ tokenId, practiceId: practiceId ?? null });

  let entry: number, sigma: number;
  try {
    [entry, sigma] = await Promise.all([getSpot(market), getVolatility(market)]);
  } catch {
    return bad("Live price unavailable, try again", 502);
  }

  const now = Date.now();
  const target = targetPrices(entry, multiplier, sigma, minutes)[direction];

  try {
    const { summary: s } = await chogSummary(tokenId, practiceId ?? null, now);
    if (!practice && multiplier > s.level.maxMultiplier) {
      throw new Error(`Level ${s.level.level} Chogs can use up to ${s.level.maxMultiplier}x. Level up to unlock more.`);
    }
    if (s.openTrades >= MAX_OPEN_TRADES) throw new Error(`Max ${MAX_OPEN_TRADES} open trades at once`);
    if (s.weekBalance < amount) {
      throw new Error(practice ? "Out of practice money. It resets Monday 00:00 UTC." : "Not enough balance this week. It resets Monday 00:00 UTC.");
    }
    const trade: Trade = {
      id: crypto.randomUUID(),
      tokenId,
      wallet,
      market,
      direction,
      amount,
      multiplier,
      entryPrice: entry,
      targetPrice: target,
      openedAt: now,
      expiresAt: expiryFor(now, minutes),
      status: "open",
      ...(practiceId ? { practiceId } : {}),
    };
    await insertTrade(trade);
    const res = NextResponse.json({ trade });
    if (setCookie && practiceId) res.cookies.set(PRACTICE_COOKIE, practiceId, practiceCookieOptions);
    return res;
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Couldn't open trade");
  }
}
