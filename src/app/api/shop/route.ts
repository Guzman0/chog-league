// The $CHOG shop.
//  GET  /api/shop?tokenId=12  → this week's prize pot, plus what Chog 12 owns and wears
//  POST { action: "buy", tokenId, itemId, txHash }   → checks the payment on Monad, then gives the item
//  POST { action: "equip", tokenId, slot, itemId }   → wear an owned item (itemId null = take it off)
// Only the signed-in owner of a Chog can buy for it or change what it wears.
import crypto from "crypto";
import { NextResponse } from "next/server";
import { weekStart, WEEK_MS } from "@/lib/game";
import { CHOG_SUPPLY } from "@/lib/chog";
import { ownerOf } from "@/lib/chain";
import { getSessionAddress } from "@/lib/session";
import { getLoadouts, insertPurchase, listPurchases, setLoadout } from "@/lib/store";
import { chogDecimals, verifyChogPayment } from "@/lib/payments";
import { weekPrize } from "@/lib/prize";
import { ITEMS, TREASURY, isTxHash, itemById, type Slot } from "@/lib/shop";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const validId = (id: string) => /^\d+$/.test(id) && Number(id) >= 1 && Number(id) <= CHOG_SUPPLY;

async function chogShop(tokenId: string) {
  const [purchases, loadouts] = await Promise.all([listPurchases({ tokenId }).catch(() => []), getLoadouts([tokenId])]);
  return { owned: [...new Set(purchases.map((p) => p.itemId))], loadout: loadouts[tokenId] ?? {} };
}

export async function GET(req: Request) {
  const tokenId = new URL(req.url).searchParams.get("tokenId") ?? "";
  const now = Date.now();
  const ws = weekStart(now);
  const [pot, decimals, mine] = await Promise.all([
    weekPrize(ws),
    // Only needed to buy, so only asked for (with a time limit) when a Chog is open.
    validId(tokenId) ? Promise.race([chogDecimals(), new Promise<null>((r) => setTimeout(() => r(null), 4000))]).catch(() => null) : null,
    validId(tokenId) ? chogShop(tokenId) : Promise.resolve(null),
  ]);
  return NextResponse.json({ items: ITEMS, treasury: TREASURY, decimals, pot: { ...pot, weekStart: ws, endsAt: ws + WEEK_MS }, ...(mine ?? {}) });
}

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const tokenId = String(b.tokenId ?? "");
  if (!validId(tokenId)) return bad("Pick a Chog");

  const wallet = await getSessionAddress();
  if (!wallet) return bad("Sign in with your wallet first", 401);
  try {
    if ((await ownerOf(tokenId)) !== wallet) return bad("Only this Chog's owner can do that", 403);
  } catch {
    return bad("Couldn't check Chog ownership on Monad, try again", 502);
  }

  try {
    if (b.action === "buy") {
      const item = itemById(b.itemId);
      if (!item) return bad("Unknown item");
      if (!isTxHash(b.txHash)) return bad("Missing payment");
      const txHash = b.txHash.toLowerCase();

      // Same payment sent twice (e.g. the page was reloaded): fine if it's the same item.
      const [used] = await listPurchases({ txHash });
      if (used) {
        if (used.tokenId === tokenId && used.itemId === item.id) return NextResponse.json({ ok: true, ...(await chogShop(tokenId)) });
        return bad("That payment was already used for another item.");
      }
      const owned = await chogShop(tokenId);
      if (owned.owned.includes(item.id)) return bad("This Chog already owns that item.");

      await verifyChogPayment(b.txHash, wallet, item.price);
      const saved = await insertPurchase({ id: crypto.randomUUID(), tokenId, itemId: item.id, price: item.price, wallet, txHash, createdAt: Date.now() });
      if (!saved) return bad("That payment was already used.");
      // Wear it straight away.
      await setLoadout(tokenId, { ...owned.loadout, [item.slot]: item.id });
      return NextResponse.json({ ok: true, ...(await chogShop(tokenId)) });
    }

    if (b.action === "equip") {
      const slot = b.slot as Slot;
      if (!["title", "frame", "victory"].includes(slot)) return bad("Unknown slot");
      const mine = await chogShop(tokenId);
      const next = { ...mine.loadout };
      if (b.itemId === null) delete next[slot];
      else {
        const item = itemById(b.itemId);
        if (!item || item.slot !== slot) return bad("Unknown item");
        if (!mine.owned.includes(item.id)) return bad("Buy this item first");
        next[slot] = item.id;
      }
      await setLoadout(tokenId, next);
      return NextResponse.json({ ok: true, owned: mine.owned, loadout: next });
    }
    return bad("Unknown action");
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Something went wrong", 400);
  }
}
