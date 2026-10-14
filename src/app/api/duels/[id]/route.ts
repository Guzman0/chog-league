// One duel. GET: its current state (moves it forward first).
// POST { action }: accept | decline | cancel | pick | trade
import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  AMOUNTS, DURATIONS_MIN, MARKETS, MAX_OPEN_TRADES, MULTIPLIERS, expiryFor, targetPrices,
  type Direction, type Market, type Trade,
} from "@/lib/game";
import {
  FORMATS, MAX_STAKE_SHARE, arenaBankroll, publicDuel, sideFor, sideKey, tokenOf, validMultiplier,
  type Duel, type Side,
} from "@/lib/duels";
import { getViewer } from "@/lib/viewer";
import { ownerOf } from "@/lib/chain";
import { chogSummary } from "@/lib/records";
import { insertTrade, listTrades } from "@/lib/store";
import { loadAndAdvance, mutateDuel } from "@/lib/duel-service";
import { getSpot, getVolatility } from "@/lib/prices";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

async function view(duel: Duel, side: Side | null, trades: Trade[]) {
  const arena = FORMATS[duel.format].kind === "arena";
  return {
    duel: { ...publicDuel(duel, side), side },
    arena: arena
      ? {
          challenger: arenaBankroll(trades, duel, "challenger"),
          opponent: arenaBankroll(trades, duel, "opponent"),
          trades: trades.map((t) => ({ ...t, side: t.wallet === sideKey(duel, "challenger") ? "challenger" : "opponent", wallet: undefined, practiceId: undefined })),
        }
      : null,
    now: Date.now(),
  };
}

// Max multiplier this side may use: league = its Chog's level, practice = everything.
async function maxMultiplierFor(d: Duel, side: Side) {
  if (d.mode === "practice") return Math.max(...MULTIPLIERS);
  return (await chogSummary(tokenOf(d, side), null)).summary.level.maxMultiplier;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const loaded = await loadAndAdvance(id);
  if (!loaded) return bad("Duel not found", 404);
  const viewer = await getViewer();
  return NextResponse.json(await view(loaded.duel, sideFor(loaded.duel, viewer), loaded.trades));
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const viewer = await getViewer();

  try {
    if (action === "trade") return await arenaTrade(id, b, viewer);

    const duel = await mutateDuel(id, async (d) => {
      const side = sideFor(d, viewer);
      if (!side) throw new Error("You're not in this duel");

      if (action === "accept" || action === "decline") {
        if (side !== "opponent") throw new Error("Only the challenged player can answer");
        if (d.status !== "pending") throw new Error(d.status === "expired" ? "This invite expired" : "This duel already started or ended");
        if (action === "decline") {
          d.status = "declined";
          return;
        }
        if (d.mode === "league") {
          if ((await ownerOf(d.opponentToken)) !== viewer.wallet) throw new Error("You no longer own this Chog");
          if ((await ownerOf(d.challengerToken)) !== d.challengerWallet) throw new Error("The challenger no longer owns their Chog");
        }
        // Both sides must still be able to cover the stake.
        for (const s of ["challenger", "opponent"] as Side[]) {
          const pid = d.mode === "practice" ? (s === "challenger" ? d.challengerPractice! : d.opponentPractice!) : null;
          const bal = (await chogSummary(tokenOf(d, s), pid)).summary.weekBalance;
          if (d.stake > bal * MAX_STAKE_SHARE + 0.001) {
            throw new Error(s === "opponent" ? `Your max stake is half your balance ($${Math.floor(bal * MAX_STAKE_SHARE)})` : "The challenger can't cover this stake anymore");
          }
        }
        const now = Date.now();
        d.status = "active";
        d.acceptedAt = now;
        const f = FORMATS[d.format];
        if (f.kind === "arena") d.endsAt = now + f.ms;
        return;
      }

      if (action === "cancel") {
        if (side !== "challenger" || d.status !== "pending") throw new Error("Only a waiting challenge can be cancelled");
        d.status = "cancelled";
        return;
      }

      if (action === "pick") {
        if (d.status !== "active" || FORMATS[d.format].kind !== "rounds") throw new Error("No round to pick in");
        const r = d.rounds[d.rounds.length - 1];
        if (!r || r.lockedAt !== undefined || Date.now() >= r.pickClosesAt) throw new Error("Too late for this round");
        if (r.picks[side]) throw new Error("You already picked this round");
        const direction = b.direction as Direction;
        const multiplier = Number(b.multiplier);
        if (direction !== "up" && direction !== "down") throw new Error("Pick HIGHER or LOWER");
        const max = await maxMultiplierFor(d, side);
        if (!validMultiplier(multiplier, max)) throw new Error(`Your Chog can use up to ${max}x`);
        r.picks[side] = { direction, multiplier, at: Date.now() };
        return;
      }

      throw new Error("Unknown action");
    });

    const loaded = await loadAndAdvance(duel.id);
    return NextResponse.json(await view(loaded!.duel, sideFor(loaded!.duel, viewer), loaded!.trades));
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Something went wrong");
  }
}

async function arenaTrade(id: string, b: Record<string, unknown>, viewer: { wallet: string | null; practiceId: string | null }) {
  const loaded = await loadAndAdvance(id);
  if (!loaded) return bad("Duel not found", 404);
  const d = loaded.duel;
  const side = sideFor(d, viewer);
  if (!side) return bad("You're not in this duel", 403);
  if (FORMATS[d.format].kind !== "arena" || d.status !== "active") return bad("This arena isn't running");

  const market = b.market as Market;
  const direction = b.direction as Direction;
  const minutes = Number(b.minutes);
  const amount = Number(b.amount);
  const multiplier = Number(b.multiplier);
  if (!MARKETS.includes(market)) return bad("Unknown market");
  if (direction !== "up" && direction !== "down") return bad("Pick HIGHER or LOWER");
  if (!DURATIONS_MIN.includes(minutes)) return bad("Unsupported duration");
  if (!AMOUNTS.includes(amount)) return bad("Unsupported amount");
  const max = await maxMultiplierFor(d, side);
  if (!validMultiplier(multiplier, max)) return bad(`Your Chog can use up to ${max}x`);

  const now = Date.now();
  const expiresAt = expiryFor(now, minutes);
  if (expiresAt > d.endsAt!) return bad("That trade would end after the arena closes. Pick a shorter one.");

  const trades = await listTrades({ duelId: d.id });
  const bank = arenaBankroll(trades, d, side);
  if (bank.balance < amount) return bad("Not enough arena balance");
  if (bank.open >= MAX_OPEN_TRADES) return bad(`Max ${MAX_OPEN_TRADES} open trades at once`);

  const [entry, sigma] = await Promise.all([getSpot(market), getVolatility(market)]);
  const t: Trade = {
    id: crypto.randomUUID(),
    tokenId: tokenOf(d, side),
    wallet: sideKey(d, side),
    market,
    direction,
    amount,
    multiplier,
    entryPrice: entry,
    targetPrice: targetPrices(entry, multiplier, sigma, minutes)[direction],
    openedAt: now,
    expiresAt,
    status: "open",
    duelId: d.id,
    ...(d.mode === "practice" ? { practiceId: side === "challenger" ? d.challengerPractice : d.opponentPractice } : {}),
  };
  await insertTrade(t);
  const after = await loadAndAdvance(id);
  return NextResponse.json(await view(after!.duel, side, after!.trades));
}
