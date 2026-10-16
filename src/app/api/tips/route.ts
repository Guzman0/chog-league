// Tip the reigning champion: $CHOG goes straight from the tipper's wallet to the
// wallet that owns the champion Chog. Chog League never holds it; this only records it.
// POST { tokenId, txHash }
import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/session";
import { ownerOf } from "@/lib/chain";
import { getChampions } from "@/lib/champions";
import { insertTip, listTips, paymentUsed } from "@/lib/store";
import { verifyChogTransfer } from "@/lib/payments";
import { MIN_CHIP, isTxHash, weekKey } from "@/lib/shop";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const tokenId = String(b.tokenId ?? "");
  if (!isTxHash(b.txHash)) return bad("Missing payment");
  const wallet = await getSessionAddress();
  if (!wallet) return bad("Sign in with your wallet first", 401);
  try {
    const champ = (await getChampions())[0];
    if (!champ || champ.tokenId !== tokenId) return bad("You can only tip the reigning champion.");
    if ((await listTips({ txHash: b.txHash })).length) return NextResponse.json({ ok: true }); // sent twice: already counted
    if (await paymentUsed(b.txHash)) return bad("That payment was already used for something else.");
    const owner = await ownerOf(tokenId);
    if (owner === wallet) return bad("You can't tip your own Chog.");
    const amount = await verifyChogTransfer(b.txHash, wallet, owner, MIN_CHIP);
    await insertTip({ id: crypto.randomUUID(), tokenId, week: weekKey(champ.weekStart), from: wallet, to: owner, amount, txHash: b.txHash.toLowerCase(), createdAt: Date.now() });
    return NextResponse.json({ ok: true, amount });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Something went wrong");
  }
}
