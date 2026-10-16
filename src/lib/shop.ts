// The $CHOG shop and the weekly prize. All prices live here: change a number,
// push, and the shop and the prize banner update.
//
// How the money moves:
//  - A player pays for an item with real $CHOG, sent from their wallet to the
//    Chog League wallet (TREASURY). One payment, one item, saved to the Chog's
//    token ID (so it goes with the NFT when it's sold).
//  - Each week's prize = BASE_PRIZE + 70% of that week's shop sales.
//  - The other 30% of sales is burned (sent to BURN_ADDRESS) when the prize is paid.
//  - Items are looks only. They never change win chances, levels or balances.

export const TREASURY = "0x87F451225907da77E23D8d5fE80982F272186ee5" as const;
export const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD" as const;
export const BASE_PRIZE = 2000; // $CHOG for the weekly #1, paid by Chog League
export const POT_SHARE = 0.7; // of shop sales, added to the prize
export const BURN_SHARE = 0.3; // of shop sales, burned
export const EXPLORER = "https://monadscan.com";

export type Slot = "title" | "frame" | "victory";
export type ShopItem = { id: string; slot: Slot; name: string; emoji: string; price: number; blurb: string };

export const SLOTS: { slot: Slot; label: string; help: string }[] = [
  { slot: "title", label: "Chog titles", help: "Shown under your Chog's name, everywhere." },
  { slot: "frame", label: "Profile frames", help: "Around your Chog's picture, on your card and the leaderboard." },
  { slot: "victory", label: "Victory animations", help: "Plays on your Chog every time a call wins." },
];

export const ITEMS: ShopItem[] = [
  { id: "title-moon-caller", slot: "title", name: "Moon Caller", emoji: "🌙", price: 250, blurb: "For Chogs who call the pump." },
  { id: "title-diamond-paws", slot: "title", name: "Diamond Paws", emoji: "💎", price: 250, blurb: "Never folds. Never sells." },
  { id: "frame-gold", slot: "frame", name: "Gold frame", emoji: "🟨", price: 500, blurb: "A shiny gold border." },
  { id: "frame-neon", slot: "frame", name: "Monad Neon frame", emoji: "🟪", price: 500, blurb: "A glowing purple border that pulses." },
  { id: "win-fireworks", slot: "victory", name: "Fireworks", emoji: "🎆", price: 1000, blurb: "Bursts of fireworks on every win." },
  { id: "win-rocket", slot: "victory", name: "Rocket launch", emoji: "🚀", price: 1000, blurb: "Your Chog blasts off on every win." },
];

export const itemById = (id: string | null | undefined) => ITEMS.find((i) => i.id === id);

/** What a Chog is wearing: one item id per slot (or nothing). */
export type Loadout = Partial<Record<Slot, string>>;

export type Purchase = {
  id: string;
  tokenId: string;
  itemId: string;
  price: number; // $CHOG paid
  wallet: string;
  txHash: string;
  createdAt: number; // ms
};

/** A prize payment the Chog League team recorded for a finished week. */
export type Payout = { week: string; paidTx?: string; burnTx?: string };

/** Week key as people read it: the Monday the week started, "2026-10-19". */
export const weekKey = (weekStartMs: number) => new Date(weekStartMs).toISOString().slice(0, 10);

/** The prize for a week, from its shop sales. */
export function prizeFor(sales: number) {
  return { base: BASE_PRIZE, sales, prize: BASE_PRIZE + Math.floor(sales * POT_SHARE), burn: Math.ceil(sales * BURN_SHARE) };
}

export const fmtChog = (n: number) => `${n.toLocaleString("en-US")} $CHOG`;
export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const isTxHash = (h: unknown): h is `0x${string}` => typeof h === "string" && /^0x[0-9a-fA-F]{64}$/.test(h);
