// =============================================================================
// CHOG IDENTITY
//
// Every Chog is born with two things, read from its own traits:
//
//  - A HOME MARKET (from its Background colour). In its home market a Chog can
//    use +1x above its level's multiplier cap.
//  - A POWER (from its Eyes), usable once per day (UTC):
//      🛡️ Shield     - if the call loses, the Chog's level doesn't drop.
//      🔥 Double Up  - if the call wins, it counts as 2 wins for the level.
//      🪂 Parachute  - lose: half the stake comes back. Win: half the profit.
//
// None of these change the odds of making money: every call still has a
// win chance of 1 / (1 + multiplier), and Parachute halves wins and losses
// equally. So rare Chogs don't automatically win; Chogs just play differently.
// Shared by the browser and the server, so both always agree.
// =============================================================================

import type { Trait } from "./chog";
import { MARKETS, MAX_MULTIPLIER, dayStart, type Market } from "./game";

export { dayStart };

export const POWERS = {
  shield: { emoji: "🛡️", name: "Shield", short: "A loss won't drop your level", long: "If this call loses, your Chog's level doesn't drop." },
  double: { emoji: "🔥", name: "Double Up", short: "A win counts twice for your level", long: "If this call wins, it counts as 2 wins toward your Chog's level." },
  parachute: { emoji: "🪂", name: "Parachute", short: "Half the risk, half the profit", long: "If this call loses you get half your stake back. If it wins you get half the profit. Same odds, smaller swing." },
} as const;
export type PowerId = keyof typeof POWERS;
const POWER_IDS = Object.keys(POWERS) as PowerId[];

export const HOME_BONUS = 1; // extra multiplier allowed in the home market

export type ChogIdentity = {
  home: Market;
  homeFrom: string; // e.g. "Background: Light Purple"
  power: PowerId;
  powerFrom: string; // e.g. "Eyes: Side Eye"
};

// Small, stable string hash (FNV-1a), so the same trait always gives the same answer.
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function trait(traits: Trait[], type: string) {
  const t = traits.find((x) => x.trait_type.toLowerCase() === type.toLowerCase());
  return t ? String(t.value) : null;
}

// Background colour → market: purple is Monad's colour, orange/gold is Bitcoin,
// blue is Ethereum, green/teal is Solana. Anything else is spread evenly.
const COLOUR_MARKET: [RegExp, Market][] = [
  [/purple|violet|lavender|lilac|plum|grape/i, "MON"],
  [/orange|gold|yellow|amber|peach|honey|banana/i, "BTC"],
  [/blue|navy|sky|cyan|aqua|ocean|denim/i, "ETH"],
  [/green|mint|teal|lime|jade|emerald|olive/i, "SOL"],
];

export function identityFor(tokenId: string, traits: Trait[]): ChogIdentity {
  const bg = trait(traits, "Background");
  const byColour = bg ? COLOUR_MARKET.find(([re]) => re.test(bg))?.[1] : undefined;
  const home = byColour ?? MARKETS[hash(`home:${bg ?? tokenId}`) % MARKETS.length];

  const eyes = trait(traits, "Eyes");
  const power = POWER_IDS[hash(`power:${eyes ?? tokenId}`) % POWER_IDS.length];

  return {
    home,
    homeFrom: bg ? `Background: ${bg}` : `token ${tokenId}`,
    power,
    powerFrom: eyes ? `Eyes: ${eyes}` : `token ${tokenId}`,
  };
}

// The biggest multiplier this Chog may use in a market.
export function multiplierCap(levelMax: number, market: Market, home: Market) {
  return Math.min(MAX_MULTIPLIER, levelMax + (market === home ? HOME_BONUS : 0));
}

// Powers recharge at 00:00 UTC each day.
export const nextRecharge = (ms: number) => dayStart(ms) + 86400000;

export function isPowerId(x: unknown): x is PowerId {
  return typeof x === "string" && x in POWERS;
}
