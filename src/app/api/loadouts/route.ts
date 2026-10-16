// What a few Chogs are wearing (titles, frames, victory animations), for the
// leaderboard and duels. GET /api/loadouts?ids=1,2,3
import { NextResponse } from "next/server";
import { CHOG_SUPPLY } from "@/lib/chog";
import { getLoadouts } from "@/lib/store";

export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get("ids") ?? "")
    .split(",")
    .filter((id) => /^\d+$/.test(id) && Number(id) >= 1 && Number(id) <= CHOG_SUPPLY)
    .slice(0, 60);
  const loadouts = await getLoadouts([...new Set(ids)]).catch(() => ({}));
  return NextResponse.json({ loadouts });
}
