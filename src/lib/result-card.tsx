// A shareable image for one finished call: the Chog, the result and a funny line.
// Built on the server from the saved trade, so nobody can fake their numbers.
import { ImageResponse } from "next/og";
import sharp from "sharp";
import { formatPrice, type Trade } from "./game";
import { resolveUri } from "./chog";
import { loadMeta } from "./meta";
import { C, font, inkOutline } from "./brand-card";
import { pnlText, quipFor } from "./quips";

async function chogArt(tokenId: string, size: number): Promise<{ name: string; png: string | null }> {
  const { meta } = await loadMeta(tokenId).catch(() => ({ meta: null }));
  const name = meta?.name || `Chog #${tokenId}`;
  const raw = meta?.image || meta?.image_url;
  if (!raw) return { name, png: null };
  try {
    const res = await fetch(resolveUri(raw), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { name, png: null };
    const png = await sharp(Buffer.from(await res.arrayBuffer())).resize(size, size).png().toBuffer();
    return { name, png: `data:image/png;base64,${png.toString("base64")}` };
  } catch {
    return { name, png: null };
  }
}

function Chip({ bg, color = C.ink, children }: { bg: string; color?: string; children: string }) {
  return (
    <div
      style={{
        display: "flex",
        fontFamily: "Lilita One",
        fontSize: 30,
        color,
        background: bg,
        border: `4px solid ${C.ink}`,
        borderRadius: 16,
        boxShadow: `4px 4px 0 ${C.ink}`,
        padding: "6px 18px",
        marginRight: 14,
      }}
    >
      {children}
    </div>
  );
}

export async function resultCard(t: Trade) {
  const won = t.status === "won";
  const lost = t.status === "lost";
  const cashed = t.status === "cashed";
  const accent = won ? C.green : lost ? C.red : cashed ? C.banana : C.sky;
  const size = 380;
  const [lilita, nunito900, nunito800, art] = await Promise.all([
    font("LilitaOne.woff"),
    font("Nunito-900.woff"),
    font("Nunito-800.woff"),
    chogArt(t.tokenId, size * 2),
  ]);
  const up = t.direction === "up";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: C.bg,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.07) 2px, transparent 2.5px)",
          backgroundSize: "26px 26px",
          fontFamily: "Nunito",
        }}
      >
        {/* The Chog sticker, with a stamp across the corner */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 70,
            top: 92,
            width: size,
            height: size,
            transform: "rotate(-5deg)",
            border: `7px solid ${C.ink}`,
            borderRadius: 36,
            boxShadow: `10px 10px 0 ${C.ink}`,
            background: accent,
            overflow: "hidden",
            ...(lost ? { filter: "grayscale(0.55)" } : {}),
          }}
        >
          {art.png ? (
            // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
            <img src={art.png} width={size} height={size} style={{ width: "100%", height: "100%" }} />
          ) : (
            <div style={{ display: "flex", width: "100%", height: "100%" }} />
          )}
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 270,
            top: 410,
            transform: "rotate(-12deg)",
            fontFamily: "Lilita One",
            fontSize: 64,
            color: C.ink,
            background: accent,
            border: `6px solid ${C.ink}`,
            borderRadius: 18,
            boxShadow: `6px 6px 0 ${C.ink}`,
            padding: "2px 22px",
          }}
        >
          {won ? "WIN" : lost ? "REKT" : cashed ? "CASHED OUT" : "PUSH"}
        </div>

        {/* Right: who, the line, the number, the call */}
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 540, top: 70, width: 600 }}>
          <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Lilita One", fontSize: 50, color: C.text }}>
            {art.name.toUpperCase()}
            <span style={{ fontFamily: "Nunito", fontWeight: 800, fontSize: 24, color: C.muted, marginLeft: 14 }}>token {t.tokenId}</span>
          </div>
          <div style={{ display: "flex", fontFamily: "Lilita One", fontSize: 66, color: C.banana, textShadow: inkOutline(4, 7), marginTop: 6, lineHeight: 1.05 }}>
            {quipFor(t)}
          </div>
          <div style={{ display: "flex", fontFamily: "Lilita One", fontSize: 128, color: accent, textShadow: inkOutline(6, 10), marginTop: 10, lineHeight: 1 }}>
            {pnlText(t)}
          </div>
          <div style={{ display: "flex", marginTop: 30 }}>
            {[
              <Chip key="call" bg={up ? C.green : C.red}>{`${up ? "HIGHER" : "LOWER"} ${t.market}`}</Chip>,
              <Chip key="size" bg={C.banana}>{`$${t.amount} at ${t.multiplier}x`}</Chip>,
              ...(t.practiceId ? [<Chip key="practice" bg={C.panel} color={C.text}>PRACTICE</Chip>] : []),
            ]}
          </div>
          <div style={{ display: "flex", fontSize: 25, fontWeight: 800, color: C.muted, marginTop: 22 }}>
            {`Target ${up ? "above" : "below"} $${formatPrice(t.targetPrice)} · closed $${formatPrice(t.settlePrice ?? 0)}`}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", position: "absolute", left: 70, right: 70, bottom: 38, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontFamily: "Lilita One", fontSize: 40, color: C.banana, textShadow: inkOutline(3, 5) }}>Chog League</span>
            <span style={{ fontSize: 24, fontWeight: 900, color: C.text, marginLeft: 20 }}>chog-league.vercel.app</span>
          </div>
          <span style={{ fontSize: 21, fontWeight: 800, color: C.muted }}>Demo money · live prices from Coinbase</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Lilita One", data: lilita, weight: 400, style: "normal" },
        { name: "Nunito", data: nunito900, weight: 900, style: "normal" },
        { name: "Nunito", data: nunito800, weight: 800, style: "normal" },
      ],
    },
  );
}
