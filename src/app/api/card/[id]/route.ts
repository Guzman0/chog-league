// GET /api/card/<tradeId> → a 1200×630 PNG share card for a finished call.
import { getTrade } from "@/lib/store";
import { resultCard } from "@/lib/result-card";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Bad card link", { status: 400 });
  const trade = await getTrade(id).catch(() => null);
  if (!trade || trade.status === "open" || trade.duelId) return new Response("No finished call with that ID", { status: 404 });

  const img = await resultCard(trade);
  const headers = new Headers(img.headers);
  // A finished call never changes, so the card can be cached for a long time.
  headers.set("cache-control", "public, max-age=86400, s-maxage=604800, immutable");
  return new Response(img.body, { status: 200, headers });
}
