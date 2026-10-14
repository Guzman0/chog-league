// The Chog League share card: used for link previews (Discord, X) and the
// downloadable submission banner. Same sticker look as the site.
import fs from "fs/promises";
import path from "path";
import { ImageResponse } from "next/og";
import sharp from "sharp";

const ART_CID = "bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e";
const CHOGS = [1462, 42, 777]; // hand-picked, landing-page friendly art

const C = { bg: "#24124f", panel: "#33206b", ink: "#120a2b", text: "#fff5e8", muted: "#c9bbf2", banana: "#ffd84d", green: "#4fe3a1", red: "#ff5e7e", pink: "#ff7ac6", sky: "#5ce1f2" };

async function font(file: string) {
  return fs.readFile(path.join(process.cwd(), "src/assets/fonts", file));
}

// Chog art is WebP; the image renderer wants PNG, so convert it. Returns null if IPFS is unreachable.
async function chogPng(n: number, size: number): Promise<string | null> {
  try {
    const res = await fetch(`https://gateway.pinata.cloud/ipfs/${ART_CID}/${n}.webp`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const png = await sharp(Buffer.from(await res.arrayBuffer())).resize(size, size).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

// A thick ink outline for text, built from shadows (the renderer has no text-stroke).
function inkOutline(px: number, drop: number) {
  const s: string[] = [];
  for (let a = 0; a < 360; a += 30) {
    const r = (a * Math.PI) / 180;
    s.push(`${(Math.cos(r) * px).toFixed(1)}px ${(Math.sin(r) * px).toFixed(1)}px 0 ${C.ink}`);
  }
  s.push(`${drop}px ${drop}px 0 ${C.ink}`);
  return s.join(", ");
}

export async function brandCard(width: number, height: number) {
  const k = width / 1200; // scale everything from a 1200-wide design
  const stickerSize = Math.round(250 * k);
  const [lilita, nunito900, nunito800, ...arts] = await Promise.all([
    font("LilitaOne.woff"),
    font("Nunito-900.woff"),
    font("Nunito-800.woff"),
    ...CHOGS.map((n) => chogPng(n, stickerSize * 2)),
  ]);
  const fills = [C.pink, C.sky, C.banana];
  const stickers = [
    { left: 700, top: 70, r: -8 },
    { left: 900, top: 150, r: 7 },
    { left: 760, top: 300, r: -3 },
  ];

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
          backgroundSize: `${Math.round(26 * k)}px ${Math.round(26 * k)}px`,
          fontFamily: "Nunito",
        }}
      >
        {/* Left: wordmark, headline, three ideas */}
        <div style={{ display: "flex", flexDirection: "column", position: "absolute", left: 70 * k, top: 80 * k, width: 640 * k }}>
          <div style={{ display: "flex", fontFamily: "Lilita One", fontSize: 112 * k, color: C.banana, textShadow: inkOutline(5 * k, 9 * k), transform: "rotate(-2deg)", lineHeight: 1 }}>
            Chog League
          </div>
          <div style={{ display: "flex", fontFamily: "Lilita One", fontSize: 58 * k, color: C.text, marginTop: 34 * k, lineHeight: 1.05 }}>
            Call it with your Chog.
          </div>
          <div style={{ display: "flex", fontSize: 27 * k, fontWeight: 800, color: C.muted, marginTop: 16 * k, lineHeight: 1.3, width: 600 * k }}>
            Higher or lower on live prices. Level up your Chog. Duel other holders. Demo money only.
          </div>
          <div style={{ display: "flex", marginTop: 34 * k }}>
            {[
              ["Higher", C.green],
              ["Lower", C.red],
              ["Duel", C.banana],
            ].map(([label, bg]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  fontFamily: "Lilita One",
                  fontSize: 32 * k,
                  color: C.ink,
                  background: bg,
                  border: `${4 * k}px solid ${C.ink}`,
                  borderRadius: 18 * k,
                  boxShadow: `${5 * k}px ${5 * k}px 0 ${C.ink}`,
                  padding: `${10 * k}px ${24 * k}px`,
                  marginRight: 18 * k,
                }}
              >
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Right: a pile of Chog stickers */}
        {stickers.map((s, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              position: "absolute",
              left: s.left * k,
              top: s.top * k,
              width: stickerSize,
              height: stickerSize,
              transform: `rotate(${s.r}deg)`,
              border: `${6 * k}px solid ${C.ink}`,
              borderRadius: 30 * k,
              boxShadow: `${9 * k}px ${9 * k}px 0 ${C.ink}`,
              background: fills[i],
              overflow: "hidden",
            }}
          >
            {arts[i] ? (
              // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
              <img src={arts[i]!} width={stickerSize} height={stickerSize} style={{ width: "100%", height: "100%" }} />
            ) : (
              <div style={{ display: "flex", width: "100%", height: "100%" }} />
            )}
          </div>
        ))}

        {/* Crown on the front Chog (drawn, so no emoji download is needed) */}
        <div style={{ display: "flex", position: "absolute", left: 838 * k, top: 236 * k, transform: "rotate(-10deg)" }}>
          <svg width={112 * k} height={84 * k} viewBox="0 0 64 48">
            <path d="M6 38 L9 10 L20 22 L32 4 L44 22 L55 10 L58 38 Z" fill={C.banana} stroke={C.ink} strokeWidth="4" strokeLinejoin="round" />
            <rect x="6" y="36" width="52" height="9" rx="3" fill={C.banana} stroke={C.ink} strokeWidth="4" />
            <circle cx="32" cy="5" r="4" fill={C.pink} stroke={C.ink} strokeWidth="2.5" />
          </svg>
        </div>

        <div style={{ display: "flex", position: "absolute", left: 70 * k, bottom: 46 * k, fontSize: 24 * k, fontWeight: 900, color: C.text }}>
          chog-league.vercel.app
        </div>
      </div>
    ),
    {
      width,
      height,
      fonts: [
        { name: "Lilita One", data: lilita, weight: 400, style: "normal" },
        { name: "Nunito", data: nunito900, weight: 900, style: "normal" },
        { name: "Nunito", data: nunito800, weight: 800, style: "normal" },
      ],
    },
  );
}
