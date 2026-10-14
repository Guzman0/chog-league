// Live price + typical 1-minute move for one market, for the trade screen preview.
import { NextResponse } from "next/server";
import { MARKETS, type Market } from "@/lib/game";
import { getSpot, getVolatility } from "@/lib/prices";

export async function GET(req: Request) {
  const m = new URL(req.url).searchParams.get("m") as Market;
  if (!MARKETS.includes(m)) return NextResponse.json({ error: "Unknown market" }, { status: 400 });
  try {
    const [price, sigma] = await Promise.all([getSpot(m), getVolatility(m)]);
    return NextResponse.json({ market: m, price, sigma, at: Date.now() });
  } catch (e) {
    return NextResponse.json({ error: "Price unavailable", detail: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
