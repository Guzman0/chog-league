// Chog collection constants and metadata types.
// Chog Genesis NFT address comes from another Chogathon builder's public repo
// (github.com/comzzy/chog-debt) and was verified on-chain (1,969 Chogs).
// Game rules live in game.ts.

export const MONAD_CHAIN_ID = 143;
export const MONAD_RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://rpc.monad.xyz";

export const CHOG_NFT_ADDRESS = (process.env.NEXT_PUBLIC_CHOG_NFT_ADDRESS ||
  "0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763") as `0x${string}`;

export const CHOG_TOKEN_ADDRESS = "0x350035555E10d9AfAF1566AaebfCeD5BA6C27777" as const;
export const CHOG_SUPPLY = 1969;

export const erc721Abi = [
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "string" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenOfOwnerByIndex", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "index", type: "uint256" }], outputs: [{ type: "uint256" }] },
] as const;

export type Trait = { trait_type: string; value: string | number };

export type ChogData = {
  tokenId: string;
  owner: string;
  name: string;
  image: string | null;
  traits: Trait[];
};

export function resolveUri(uri: string): string {
  if (uri.startsWith("ipfs://")) return "https://gateway.pinata.cloud/ipfs/" + uri.slice(7).replace(/^ipfs\//, "");
  if (uri.startsWith("ar://")) return "https://arweave.net/" + uri.slice(5);
  return uri;
}
