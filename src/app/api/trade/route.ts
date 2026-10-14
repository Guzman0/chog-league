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
  DURATIONS_MIN, MARKETS, MAX_OPEN_TRADES, MAX_AMOUNT, MAX_MULTIPLIER, MIN_AMOUNT, MIN_MULTIPLIER, isValidAmount, isValidMultiplier,
  expiryFor, targetPrices, type Direction, type Market, type Trade,
} from "@/lib/game";
import { getSpot, getVolatility } from "@/lib/prices";
import { getSessionAddress } from "@/lib/session";
import { ownerOf } from "@/lib/chain";
import { settleDue } from "@/lib/settle";
import { insertTrade } from "@/lib/store";
import { chogSummary } from "@/lib/records";
import { CHOG_SUPPLY } from "@/lib/chog";
import { POWERS, identityFor, multiplierCap, type ChogIdentity } from "@/lib/identity";
import { chogTraits } from "@/lib/meta";
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
  const usePower = b.usePower === true;

  if (!/^\d+$/.test(tokenId) || Number(tokenId) > CHOG_SUPPLY) return bad("Pick a Chog");
  if (!MARKETS.includes(market)) return bad("Unknown market");
  if (direction !== "up" && direction !== "down") return bad("Pick HIGHER or LOWER");
  if (!DURATIONS_MIN.includes(minutes)) return bad("Unsupported duration");
  if (!isValidAmount(amount)) return bad(`Amount must be a whole number from $${MIN_AMOUNT} to $${MAX_AMOUNT}`);
  if (!isValidMultiplier(multiplier)) return bad(`Multiplier must be ${MIN_MULTIPLIER}x to ${MAX_MULTIPLIER}x, with at most one decimal`);

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
    const levelMax = practice ? MAX_MULTIPLIER : s.level.maxMultiplier;

    // The Chog's identity (home market + power) comes from its traits. Only
    // loaded when it matters: above the level cap, or when using the power.
    let identity: ChogIdentity | null = null;
    if (usePower || multiplier > levelMax) {
      const traits = await chogTraits(tokenId).catch(() => null);
      if (!traits) throw new Error("Couldn't read this Chog's traits right now, try again");
      identity = identityFor(tokenId, traits);
    }
    if (multiplier > levelMax && multiplier > multiplierCap(levelMax, market, identity!.home)) {
      throw new Error(`Level ${s.level.level} Chogs can use up to ${levelMax}x (${multiplierCap(levelMax, identity!.home, identity!.home)}x in their home market, ${identity!.home}). Level up to unlock more.`);
    }
    if (usePower && s.powerUsedToday) {
      throw new Error(`${POWERS[identity!.power].name} is already used today. It recharges at 00:00 UTC.`);
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
      ...(usePower && identity ? { power: identity.power } : {}),
    };
    await insertTrade(trade);
    const res = NextResponse.json({ trade });
    if (setCookie && practiceId) res.cookies.set(PRACTICE_COOKIE, practiceId, practiceCookieOptions);
    return res;
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Couldn't open trade");
  }
}
