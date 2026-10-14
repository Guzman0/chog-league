import { brandCard } from "@/lib/brand-card";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // render on request, never at build time
export const alt = "Chog League: call higher or lower with your Chog, level up, and duel other holders.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return brandCard(size.width, size.height);
}
