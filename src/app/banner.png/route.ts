// Downloadable submission banner (1600x900): open /banner.png and save it.
import { brandCard } from "@/lib/brand-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return brandCard(1600, 900);
}
