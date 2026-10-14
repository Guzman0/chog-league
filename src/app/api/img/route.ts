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

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const type = res.headers.get("content-type") || "";
      if (!res.ok || !(type.startsWith("image/") || type.startsWith("video/") || type === "application/octet-stream")) continue;
      return new Response(res.body, {
        headers: { "content-type": type, "cache-control": "public, max-age=86400, immutable" },
      });
    } catch {
      // try the next gateway
    }
  }
  return new Response("Image unavailable", { status: 502 });
}
