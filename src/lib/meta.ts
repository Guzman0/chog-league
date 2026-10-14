// Loads a Chog's metadata (name, image, traits) from its tokenURI on IPFS.
// Metadata never changes, so it's kept in memory after the first load.
// Server-side only.
import { createPublicClient, http } from "viem";
import { monad } from "./wagmi";
import { CHOG_NFT_ADDRESS, erc721Abi, resolveUri, type Trait } from "./chog";

const client = createPublicClient({ chain: monad, transport: http() });

export type Meta = { name?: string; image?: string; image_url?: string; attributes?: Trait[]; traits?: Trait[] };

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

export async function fetchMeta(uri: string, tried: string[]): Promise<Meta | null> {
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

export const metaCache = new Map<string, { uri: string; meta: Meta }>();

// Metadata for a token: from memory if we've seen it, otherwise from IPFS.
export async function loadMeta(id: string, tried: string[] = []): Promise<{ uri: string; meta: Meta | null }> {
  const cached = metaCache.get(id);
  if (cached) return cached;
  const uri = await client.readContract({ address: CHOG_NFT_ADDRESS, abi: erc721Abi, functionName: "tokenURI", args: [BigInt(id)] });
  let meta: Meta | null = null;
  try {
    meta = await fetchMeta(uri, tried);
  } catch (e) {
    tried.push(`parse error: ${e instanceof Error ? e.message : e}`);
  }
  if (meta) metaCache.set(id, { uri, meta });
  return { uri, meta };
}

// Just the traits, or null if the metadata couldn't be loaded.
export async function chogTraits(id: string): Promise<Trait[] | null> {
  const { meta } = await loadMeta(id);
  const t = meta?.attributes || meta?.traits;
  return meta ? (Array.isArray(t) ? t : []) : null;
}
