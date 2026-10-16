// Hall of Champions: the #1 Chog of each finished league week, with its $CHOG
// prize, payment links and (for the reigning champion) tips. See lib/champions.ts.
import { NextResponse } from "next/server";
import { getChampions, withTips } from "@/lib/champions";

export async function GET() {
  return NextResponse.json({ champions: await withTips(await getChampions()) });
}
