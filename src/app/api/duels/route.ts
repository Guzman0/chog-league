// GET: your duels (invites, outgoing challenges, active, recent).
// POST: challenge someone from the lobby, or the bot (practice only).
import crypto from "crypto";
import { NextResponse } from "next/server";
import { CHOG_SUPPLY } from "@/lib/chog";
import { MARKETS, weekStart, type Market } from "@/lib/game";
import {
  BOT_TOKEN, FORMATS, MAX_DUELS_PER_PAIR_PER_WEEK, MAX_STAKE_SHARE, STAKES, publicDuel, sideFor,
  type Duel, type DuelMode, type FormatId,
} from "@/lib/duels";
import { getViewer } from "@/lib/viewer";
import { ownerOf } from "@/lib/chain";
import { chogSummary } from "@/lib/records";
import { insertDuel, listDuels, listPresence } from "@/lib/store";
import { loadAndAdvance } from "@/lib/duel-service";
import { PRACTICE_COOKIE, newPracticeId, practiceCookieOptions } from "@/lib/practice";

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  const { wallet, practiceId } = await getViewer();
  if (!wallet && !practiceId) return NextResponse.json({ duels: [] });
  const found = new Map<string, Duel>();
  const lists = await Promise.all([
    wallet ? listDuels({ wallet, statuses: ["pending", "active"] }) : [],
    practiceId ? listDuels({ practiceId, statuses: ["pending", "active"] }) : [],
    wallet ? listDuels({ wallet, statuses: ["done"] }) : [],
    practiceId ? listDuels({ practiceId, statuses: ["done"] }) : [],
  ]);
  for (const d of lists.flat()) found.set(d.id, d);

  // Move live duels forward so invites expire and rounds progress.
  const out = [];
  for (const d of found.values()) {
    const cur = d.status === "pending" || d.status === "active" ? (await loadAndAdvance(d.id))?.duel ?? d : d;
    const side = sideFor(cur, { wallet, practiceId });
    if (!side) continue;
    out.push({ ...publicDuel(cur, side), side });
  }
  out.sort((a, b) => b.createdAt - a.createdAt);
  // Keep finished duels to the latest few.
  const live = out.filter((d) => d.status === "pending" || d.status === "active");
  const done = out.filter((d) => d.status === "done").slice(0, 5);
  return NextResponse.json({ duels: [...live, ...done] });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const mode = b.mode as DuelMode;
  const myToken = String(b.tokenId ?? "");
  const format = b.format as FormatId;
  const market = b.market as Market;
  const stake = Number(b.stake);
  const vsBot = b.bot === true;

  if (mode !== "league" && mode !== "practice") return bad("Pick league or practice");
  if (!/^\d+$/.test(myToken) || Number(myToken) > CHOG_SUPPLY) return bad("Pick a Chog");
  if (!(format in FORMATS)) return bad("Unknown duel format");
  if (!MARKETS.includes(market)) return bad("Unknown market");
  if (!STAKES.includes(stake)) return bad("Unsupported stake");
  if (vsBot && mode !== "practice") return bad("Bot duels are practice only");
  if (vsBot && FORMATS[format].kind !== "rounds") return bad("The bot plays Quick, Best of 3 and Best of 5");

  const viewer = await getViewer();
  let practiceId = viewer.practiceId;
  let setCookie = false;
  if (mode === "practice" && !practiceId) {
    practiceId = newPracticeId();
    setCookie = true;
  }
  if (mode === "league") {
    if (!viewer.wallet) return bad("Sign in with your wallet first", 401);
    if ((await ownerOf(myToken)) !== viewer.wallet) return bad("This wallet doesn't own that Chog", 403);
  }

  // One live duel at a time per player keeps things simple.
  const mine = mode === "league" ? await listDuels({ wallet: viewer.wallet!, statuses: ["pending", "active"] }) : practiceId && !setCookie ? await listDuels({ practiceId, statuses: ["pending", "active"] }) : [];
  if (mine.some((d) => d.mode === mode && d.status === "active")) return bad("Finish your current duel first");

  const { summary } = await chogSummary(myToken, mode === "practice" ? practiceId! : null);
  if (stake > summary.weekBalance * MAX_STAKE_SHARE) {
    return bad(`Max stake is half your balance ($${Math.floor(summary.weekBalance * MAX_STAKE_SHARE)})`);
  }

  const now = Date.now();
  const duel: Duel = {
    id: crypto.randomUUID(),
    mode,
    format,
    market,
    stake,
    challengerToken: myToken,
    challengerWallet: mode === "league" ? viewer.wallet! : "",
    challengerPractice: mode === "practice" ? practiceId! : undefined,
    opponentToken: "",
    opponentWallet: "",
    isBot: vsBot,
    status: "pending",
    createdAt: now,
    rounds: [],
    version: 0,
  };

  if (vsBot) {
    // The bot borrows a random Chog's face.
    duel.opponentToken = String(1 + Math.floor(Math.random() * CHOG_SUPPLY));
    duel.opponentWallet = BOT_TOKEN;
    duel.status = "active";
    duel.acceptedAt = now;
  } else {
    const key = String(b.opponentKey ?? "");
    const online = await listPresence(now - 45000);
    const opp = online.find((p) => p.playerKey === key && p.mode === mode);
    if (!opp) return bad("That player isn't online anymore");
    if (mode === "league") {
      const oppWallet = await ownerOf(opp.tokenId);
      if (oppWallet === viewer.wallet) return bad("You can't duel your own Chog");
      duel.opponentToken = opp.tokenId;
      duel.opponentWallet = oppWallet;
      // Safeguard: max 3 league duels a week between the same two Chogs.
      const pair = (await listDuels({ tokenIds: [myToken], statuses: ["pending", "active", "done"] })).filter(
        (d) => d.mode === "league" && d.createdAt >= weekStart(now) &&
          [d.challengerToken, d.opponentToken].sort().join() === [myToken, opp.tokenId].sort().join(),
      );
      if (pair.length >= MAX_DUELS_PER_PAIR_PER_WEEK) return bad(`These two Chogs already dueled ${MAX_DUELS_PER_PAIR_PER_WEEK} times this week`);
    } else {
      if (opp.practiceId === practiceId) return bad("You can't duel yourself");
      duel.opponentToken = opp.tokenId;
      duel.opponentPractice = opp.practiceId;
    }
  }

  await insertDuel(duel);
  const res = NextResponse.json({ duel: { ...publicDuel(duel, "challenger"), side: "challenger" } });
  if (setCookie && practiceId) res.cookies.set(PRACTICE_COOKIE, practiceId, practiceCookieOptions);
  return res;
}
