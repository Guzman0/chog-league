// Server route: reads a Chog from the Monad chain and fetches its metadata.
// Doing this on the server avoids browser CORS problems with metadata hosts.
import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { monad } from "@/lib/wagmi";
import { CHOG_NFT_ADDRESS, erc721Abi, resolveUri, type ChogData, type Trait } from "@/lib/chog";

const client = createPublicClient({ chain: monad, transport: http() });

type Meta = { name?: string; image?: string; image_url?: string; attributes?: Trait[]; traits?: Trait[] };

// Pinata first: the public gateways often rate-limit (HTTP 429).
const IPFS_GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://w3s.link/ipfs/"];

// Every URL we should try for one metadata link, best first.
function candidateUrls(uri: string): string[] {
  const urls: string[] = [];
  const ipfsPath = uri.startsWith("ipfs://")
    ? uri.slice(7).replace(/^ipfs\//, "")
    : uri.match(/\/ipfs\/(.+)$/)?.[1];
  if (ipfsPath) IPFS_GATEWAYS.forEach((g) => urls.push(g + ipfsPath));
  else urls.push(resolveUri(uri));
  // Some collections store a base path and expect ".json" on the end.
  if (!uri.endsWith(".json")) urls.push(...urls.map((u) => u + ".json"));
  return urls;
}

async function fetchMeta(uri: string, tried: string[]): Promise<Meta | null> {
  if (uri.startsWith("data:application/json;base64,")) {
    return JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
  }
  if (uri.startsWith("data:application/json")) {
    return JSON.parse(decodeURIComponent(uri.split(",").slice(1).join(",")));
  }
  for (const url of candidateUrls(uri)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
      tried.push(`${res.status} ${url}`);
      if (!res.ok) continue;
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        tried.push(`not JSON: ${text.slice(0, 80)}`);
      }
    } catch (e) {
      tried.push(`failed ${url}: ${e instanceof Error ? e.message : e}`);
    }
  }
  return null;
}

const metaCache = new Map<string, { uri: string; meta: Meta }>();

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const debug = new URL(req.url).searchParams.has("debug");
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Token ID must be a number" }, { status: 400 });
  const tokenId = BigInt(id);

  try {
    // Owner is always read fresh (it changes on sale). Metadata never changes,
    // so after the first load it's served from memory instead of IPFS.
    const cached = metaCache.get(id);
    const [owner, uri] = await Promise.all([
      client.readContract({ address: CHOG_NFT_ADDRESS, abi: erc721Abi, functionName: "ownerOf", args: [tokenId] }),
      cached ? Promise.resolve(cached.uri) : client.readContract({ address: CHOG_NFT_ADDRESS, abi: erc721Abi, functionName: "tokenURI", args: [tokenId] }),
    ]);

    const tried: string[] = [];
    let meta: Meta | null = cached?.meta ?? null;
    if (!meta) {
      try {
        meta = await fetchMeta(uri, tried);
      } catch (e) {
        tried.push(`parse error: ${e instanceof Error ? e.message : e}`);
      }
      if (meta) metaCache.set(id, { uri, meta });
    }

    const rawImage = meta?.image || meta?.image_url;
    const traits = meta?.attributes || meta?.traits;
    const data: ChogData & { debug?: unknown } = {
      tokenId: id,
      owner,
      name: meta?.name || `Chog #${id}`,
      image: !rawImage
        ? null
        : /^(ipfs|ar):\/\//.test(rawImage) || /\/ipfs\/|arweave\.net/.test(rawImage)
          ? `/api/img?u=${encodeURIComponent(rawImage)}`
          : resolveUri(rawImage),
      traits: Array.isArray(traits) ? traits : [],
    };
    if (debug) data.debug = { tokenURI: uri.slice(0, 500), tried, metaKeys: meta ? Object.keys(meta) : null, meta };
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const notFound = /nonexistent|invalid token|ERC721/i.test(msg);
    return NextResponse.json(
      { error: notFound ? `Chog #${id} doesn't exist` : "Couldn't read this Chog from Monad", detail: msg.slice(0, 300) },
      { status: notFound ? 404 : 502 },
    );
  }
}
