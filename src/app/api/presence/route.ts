// The duel lobby. POST: "I'm online with this Chog" (sent every ~15s).
// GET ?mode=league|practice: who else is online right now.
import { NextResponse } from "next/server";
import { CHOG_SUPPLY } from "@/lib/chog";
import { getViewer } from "@/lib/viewer";
import { ownerOfCached } from "@/lib/chain";
import { listDuels, listPresence, upsertPresence } from "@/lib/store";
import { PRACTICE_COOKIE, newPracticeId, practiceCookieOptions } from "@/lib/practice";

const ONLINE_MS = 45000;

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const mode = b.mode === "league" ? "league" : "practice";
  const tokenId = String(b.tokenId ?? "");
  if (!/^\d+$/.test(tokenId) || Number(tokenId) > CHOG_SUPPLY) return NextResponse.json({ error: "Pick a Chog" }, { status: 400 });
  const viewer = await getViewer();

  if (mode === "league") {
    if (!viewer.wallet) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
    if ((await ownerOfCached(tokenId)) !== viewer.wallet) return NextResponse.json({ error: "Not your Chog" }, { status: 403 });
    await upsertPresence({ playerKey: `L:${tokenId}`, tokenId, wallet: viewer.wallet, mode, name: String(b.name ?? "").slice(0, 60), image: String(b.image ?? "").slice(0, 500), lastSeen: Date.now() });
    return NextResponse.json({ ok: true, playerKey: `L:${tokenId}` });
  }

  let practiceId = viewer.practiceId;
  const fresh = !practiceId;
  practiceId ??= newPracticeId();
  await upsertPresence({ playerKey: `P:${practiceId}`, tokenId, wallet: "", practiceId, mode, name: String(b.name ?? "").slice(0, 60), image: String(b.image ?? "").slice(0, 500), lastSeen: Date.now() });
  const res = NextResponse.json({ ok: true, playerKey: `P:${practiceId}` });
  if (fresh) res.cookies.set(PRACTICE_COOKIE, practiceId, practiceCookieOptions);
  return res;
}

export async function GET(req: Request) {
  const mode = new URL(req.url).searchParams.get("mode") === "league" ? "league" : "practice";
  const viewer = await getViewer();
  const now = Date.now();
  const [online, active] = await Promise.all([listPresence(now - ONLINE_MS), listDuels({ statuses: ["active"] })]);
  const busyTokens = new Set(active.filter((d) => d.mode === mode).flatMap((d) => [d.challengerToken, d.opponentToken]));
  const busyPractice = new Set(active.filter((d) => d.mode === "practice").flatMap((d) => [d.challengerPractice, d.opponentPractice]));
  const players = online
    .filter((p) => p.mode === mode)
    .filter((p) => !(mode === "league" ? p.wallet && p.wallet === viewer.wallet : p.practiceId && p.practiceId === viewer.practiceId))
    .map((p) => ({
      playerKey: p.playerKey,
      tokenId: p.tokenId,
      name: p.name,
      image: p.image,
      busy: mode === "league" ? busyTokens.has(p.tokenId) : busyPractice.has(p.practiceId),
      lastSeen: p.lastSeen,
    }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
  return NextResponse.json({ players });
}
