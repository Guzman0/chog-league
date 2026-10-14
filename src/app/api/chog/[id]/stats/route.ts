// A Chog's record: level, weekly balance, open trades and recent history.
// Anyone can view a Chog's real record. With ?practice=1 it returns this
// browser's own practice record with that Chog instead.
import { NextResponse } from "next/server";
import { summarize } from "@/lib/game";
import { settleDue } from "@/lib/settle";
import { chogSummary, duelRecordFor } from "@/lib/records";
import { getPracticeId } from "@/lib/practice";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Token ID must be a number" }, { status: 400 });
  const wantsPractice = new URL(req.url).searchParams.has("practice");
  const practiceId = wantsPractice ? await getPracticeId() : null;
  const now = Date.now();

  // A practice player with no practice ID yet simply has no trades.
  if (wantsPractice && !practiceId) {
    return NextResponse.json({ summary: summarize(id, [], now, "none"), open: [], history: [], now, practice: true });
  }

  await settleDue({ tokenId: id, practiceId });
  const [{ summary, trades }, duels] = await Promise.all([chogSummary(id, practiceId, now), practiceId ? null : duelRecordFor(id)]);
  const open = trades.filter((t) => t.status === "open").sort((a, b) => a.expiresAt - b.expiresAt);
  const history = trades.filter((t) => t.status !== "open").sort((a, b) => b.expiresAt - a.expiresAt).slice(0, 20);
  return NextResponse.json({ summary, duels, open, history, now, practice: wantsPractice });
}
