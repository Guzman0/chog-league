// Lists the Chog token IDs a wallet owns.
// 1) Tries the fast way (tokenOfOwnerByIndex), if the contract supports it.
// 2) Otherwise checks ownerOf for every Chog, in batches, and caches the result
//    for 2 minutes so the whole collection isn't re-scanned on every visit.
import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress, getAddress } from "viem";
import { monad } from "@/lib/wagmi";
import { CHOG_NFT_ADDRESS, CHOG_SUPPLY, erc721Abi } from "@/lib/chog";

const client = createPublicClient({ chain: monad, transport: http(undefined, { batch: { batchSize: 100 } }) });

let ownerCache: { at: number; owners: Map<number, string> } | null = null;
const CACHE_MS = 2 * 60 * 1000;

async function scanAllOwners(): Promise<Map<number, string>> {
  if (ownerCache && Date.now() - ownerCache.at < CACHE_MS) return ownerCache.owners;
  const owners = new Map<number, string>();
  const ids = Array.from({ length: CHOG_SUPPLY + 1 }, (_, i) => i); // 0..1969, in case IDs start at 0
  const CHUNK = 100;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const results = await Promise.allSettled(
      chunk.map((id) => client.readContract({ address: CHOG_NFT_ADDRESS, abi: erc721Abi, functionName: "ownerOf", args: [BigInt(id)] })),
    );
    results.forEach((r, j) => {
      if (r.status === "fulfilled") owners.set(chunk[j], r.value.toLowerCase());
    });
  }
  ownerCache = { at: Date.now(), owners };
  return owners;
}

export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) return NextResponse.json({ error: "Not a valid wallet address" }, { status: 400 });
  const wallet = getAddress(address);

  try {
    const balance = await client.readContract({ address: CHOG_NFT_ADDRESS, abi: erc721Abi, functionName: "balanceOf", args: [wallet] });
    if (balance === BigInt(0)) return NextResponse.json({ tokenIds: [], method: "balance" });

    // Fast path: ERC-721 Enumerable.
    try {
      const ids = await Promise.all(
        Array.from({ length: Number(balance) }, (_, i) =>
          client.readContract({ address: CHOG_NFT_ADDRESS, abi: erc721Abi, functionName: "tokenOfOwnerByIndex", args: [wallet, BigInt(i)] }),
        ),
      );
      return NextResponse.json({ tokenIds: ids.map(String).sort((a, b) => Number(a) - Number(b)), method: "enumerable" });
    } catch {
      // Contract isn't enumerable; fall back to scanning.
    }

    const owners = await scanAllOwners();
    const me = wallet.toLowerCase();
    const tokenIds = [...owners.entries()].filter(([, o]) => o === me).map(([id]) => String(id));
    return NextResponse.json({ tokenIds, method: "scan" });
  } catch (e) {
    return NextResponse.json({ error: "Couldn't read Chogs for this wallet", detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) }, { status: 502 });
  }
}
