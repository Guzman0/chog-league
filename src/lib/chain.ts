// Server-side connection to Monad for reading Chog ownership.
import { createPublicClient, http } from "viem";
import { monad } from "./wagmi";
import { CHOG_NFT_ADDRESS, erc721Abi } from "./chog";

export const publicClient = createPublicClient({ chain: monad, transport: http() });

export async function ownerOf(tokenId: string): Promise<string> {
  const owner = await publicClient.readContract({ address: CHOG_NFT_ADDRESS, abi: erc721Abi, functionName: "ownerOf", args: [BigInt(tokenId)] });
  const o = owner.toLowerCase();
  ownerCache.set(tokenId, { at: Date.now(), owner: o });
  return o;
}

// For frequent, low-stakes checks (lobby heartbeats). Trades and duels use ownerOf directly.
const ownerCache = new Map<string, { at: number; owner: string }>();
export async function ownerOfCached(tokenId: string, maxAgeMs = 60000): Promise<string> {
  const hit = ownerCache.get(tokenId);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.owner;
  return ownerOf(tokenId);
}
