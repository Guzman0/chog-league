// Chip in: anyone signed in can add $CHOG to this week's prize.
// POST { txHash } after sending $CHOG to the Chog League wallet. All of it goes to the prize.
import crypto from "crypto";
import { NextResponse } from "next/server";
import { getSessionAddress } from "@/lib/session";
import { insertChipin, listChipins, paymentUsed } from "@/lib/store";
import { verifyChogTransfer } from "@/lib/payments";
import { weekPrize } from "@/lib/prize";
import { weekStart } from "@/lib/game";
import { MAX_CHIP, MIN_CHIP, TREASURY, isTxHash } from "@/lib/shop";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  if (!isTxHash(b.txHash)) return bad("Missing payment");
  const wallet = await getSessionAddress();
  if (!wallet) return bad("Sign in with your wallet first", 401);
  try {
    // Sent twice (e.g. after a reload): already counted, fine.
    if ((await listChipins({ txHash: b.txHash })).length) return NextResponse.json({ ok: true, pot: await weekPrize(weekStart(Date.now())) });
    if (await paymentUsed(b.txHash)) return bad("That payment was already used for something else.");
    const amount = Math.min(MAX_CHIP, await verifyChogTransfer(b.txHash, wallet, TREASURY, MIN_CHIP));
    await insertChipin({ id: crypto.randomUUID(), wallet, amount, txHash: b.txHash.toLowerCase(), createdAt: Date.now() });
    return NextResponse.json({ ok: true, amount, pot: await weekPrize(weekStart(Date.now())) });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Something went wrong");
  }
}
