// Server route: reads a Chog from the Monad chain and fetches its metadata.
// Doing this on the server avoids browser CORS problems with metadata hosts.
import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { monad } from "@/lib/wagmi";
import { CHOG_NFT_ADDRESS, erc721Abi, resolveUri, type ChogData } from "@/lib/chog";
import { loadMeta } from "@/lib/meta";

const client = createPublicClient({ chain: monad, transport: http() });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const debug = new URL(req.url).searchParams.has("debug");
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Token ID must be a number" }, { status: 400 });
  const tokenId = BigInt(id);

  try {
    // Owner is always read fresh (it changes on sale). Metadata never changes,
    // so after the first load it's served from memory instead of IPFS.
    const tried: string[] = [];
    const [owner, { uri, meta }] = await Promise.all([
      client.readContract({ address: CHOG_NFT_ADDRESS, abi: erc721Abi, functionName: "ownerOf", args: [tokenId] }),
      loadMeta(id, tried),
    ]);

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
