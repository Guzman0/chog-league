// Image proxy: loads NFT images from IPFS/Arweave through several gateways,
// so a slow or blocked gateway doesn't leave a broken image in the browser.
// Only IPFS and Arweave links are allowed, so this can't be used as an open proxy.

// Pinata first: the public gateways often rate-limit (HTTP 429).
const IPFS_GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://w3s.link/ipfs/"];

function candidates(u: string): string[] | null {
  const ipfsPath = u.startsWith("ipfs://") ? u.slice(7).replace(/^ipfs\//, "") : u.match(/^https:\/\/[^/]+\/ipfs\/(.+)$/)?.[1];
  if (ipfsPath) return IPFS_GATEWAYS.map((g) => g + ipfsPath);
  if (u.startsWith("ar://")) return ["https://arweave.net/" + u.slice(5)];
  if (/^https:\/\/(www\.)?arweave\.net\//.test(u)) return [u];
  return null;
}

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get("u") || "";
  const urls = candidates(u);
  if (!urls) return new Response("Unsupported image link", { status: 400 });

  // Ask every gateway at once and stream back the first image that arrives.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const winner = await Promise.any(
      urls.map(async (url) => {
        const res = await fetch(url, { signal: ctrl.signal });
        const type = res.headers.get("content-type") || "";
        if (!res.ok || !(type.startsWith("image/") || type.startsWith("video/") || type === "application/octet-stream")) throw new Error("not an image");
        return { res, type };
      }),
    );
    clearTimeout(timer);
    const body = new Uint8Array(await winner.res.arrayBuffer());
    ctrl.abort(); // stop the slower gateways
    return new Response(body, {
      // Chog art never changes: cache it in the browser and at Vercel's edge.
      headers: { "content-type": winner.type, "cache-control": "public, max-age=86400, s-maxage=31536000, immutable" },
    });
  } catch {
    clearTimeout(timer);
  }
  return new Response("Image unavailable", { status: 502 });
}
