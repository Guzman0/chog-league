// =============================================================================
// CHOG VS CHOG DUELS
//
// Two Chogs stake the same amount from their weekly demo balance (league) or
// practice balance (practice). Winner takes both stakes; a draw refunds both.
//
// Formats
//  - Quick, Best of 3, Best of 5: 1-minute rounds on one market. Each round,
//    both players secretly pick HIGHER/LOWER and a multiplier within 20s.
//    Picks are revealed when the round locks; both get the same entry price.
//    Each pick is scored like a $100 trade; the bigger profit wins the round.
//  - Arena 15m / 1h / 24h: both Chogs get a $1,000 duel bankroll and trade
//    freely. Highest bankroll when time runs out wins.
//
// Nothing runs in the background: the duel moves forward whenever a player
// (or spectator) loads it, using deterministic times and exchange prices.
// =============================================================================
import {
  MULTIPLIERS, expiryFor, payoutIfWin, round2, settleOutcome, targetPrices, weekStart,
  type Direction, type Market, type Trade,
} from "./game";

export type Side = "challenger" | "opponent";
export type DuelMode = "league" | "practice";
export type DuelStatus = "pending" | "active" | "done" | "declined" | "expired" | "cancelled";

export const FORMATS = {
  quick: { label: "Quick duel", short: "Quick", kind: "rounds", toWin: 1, maxRounds: 3, blurb: "1 round, 1 minute" },
  bo3: { label: "Best of 3", short: "Bo3", kind: "rounds", toWin: 2, maxRounds: 6, blurb: "First to 2 rounds" },
  bo5: { label: "Best of 5", short: "Bo5", kind: "rounds", toWin: 3, maxRounds: 9, blurb: "First to 3 rounds" },
  arena15: { label: "Arena 15 min", short: "15m", kind: "arena", ms: 15 * 60000, blurb: "Trade freely for 15 minutes" },
  arena60: { label: "Arena 1 hour", short: "1h", kind: "arena", ms: 60 * 60000, blurb: "Trade freely for 1 hour" },
  arena1440: { label: "Arena 24 hours", short: "24h", kind: "arena", ms: 24 * 3600000, blurb: "Trade freely for a day" },
} as const;
export type FormatId = keyof typeof FORMATS;

export const STAKES = [50, 100, 250, 500];
export const MAX_STAKE_SHARE = 0.5; // max half your balance per duel
export const MAX_DUELS_PER_PAIR_PER_WEEK = 3; // league only, stops two Chogs feeding each other
export const PICK_WINDOW_MS = 20000;
export const INVITE_TTL_MS = 60000;
export const ROUND_AMOUNT = 100; // each round pick is scored like a $100 trade
export const ARENA_BANKROLL = 1000;
export const BOT_TOKEN = "bot";

export type Pick = { direction: Direction; multiplier: number; at: number };
export type RoundResult = { won: boolean; pnl: number; target?: number; missed?: boolean };
export type Round = {
  n: number;
  pickOpensAt: number;
  pickClosesAt: number;
  picks: Partial<Record<Side, Pick>>;
  lockedAt?: number;
  entryPrice?: number;
  sigma?: number;
  expiresAt?: number;
  settlePrice?: number;
  results?: Partial<Record<Side, RoundResult>>;
  winner?: Side | "tie";
};

export type DuelResult = {
  winner: Side | "draw";
  score?: Record<Side, number>;
  bankrolls?: Record<Side, number>;
  reason?: string;
};

export type Duel = {
  id: string;
  mode: DuelMode;
  format: FormatId;
  market: Market;
  stake: number;
  challengerToken: string;
  challengerWallet: string;
  challengerPractice?: string;
  opponentToken: string;
  opponentWallet: string;
  opponentPractice?: string;
  isBot: boolean;
  status: DuelStatus;
  createdAt: number;
  acceptedAt?: number;
  endsAt?: number;
  winnerToken?: string;
  rounds: Round[];
  result?: DuelResult;
  version: number;
};

export const other = (s: Side): Side => (s === "challenger" ? "opponent" : "challenger");
export const tokenOf = (d: Duel, s: Side) => (s === "challenger" ? d.challengerToken : d.opponentToken);

// Which side is this player on? League players are identified by wallet,
// practice players by their practice ID.
export function sideFor(d: Duel, who: { wallet?: string | null; practiceId?: string | null }): Side | null {
  if (d.mode === "league") {
    if (who.wallet && who.wallet === d.challengerWallet) return "challenger";
    if (who.wallet && who.wallet === d.opponentWallet) return "opponent";
  } else {
    if (who.practiceId && who.practiceId === d.challengerPractice) return "challenger";
    if (who.practiceId && who.practiceId === d.opponentPractice) return "opponent";
  }
  return null;
}

export function score(d: Duel): Record<Side, number> {
  const s = { challenger: 0, opponent: 0 };
  for (const r of d.rounds) if (r.winner === "challenger" || r.winner === "opponent") s[r.winner]++;
  return s;
}

// How much a Chog's weekly (or practice) balance moves because of duels:
// an active duel holds the stake; a finished duel pays +stake or -stake.
export function duelBalanceDelta(tokenId: string, duels: Duel[], nowMs: number, practiceId?: string | null): number {
  const ws = weekStart(nowMs);
  let delta = 0;
  for (const d of duels) {
    if (!d.acceptedAt || d.acceptedAt < ws) continue;
    if (d.status !== "active" && d.status !== "done") continue;
    let side: Side | null = null;
    if (practiceId) {
      if (d.mode !== "practice") continue;
      if (d.challengerPractice === practiceId && d.challengerToken === tokenId) side = "challenger";
      else if (d.opponentPractice === practiceId && d.opponentToken === tokenId) side = "opponent";
    } else {
      if (d.mode !== "league") continue;
      if (d.challengerToken === tokenId) side = "challenger";
      else if (d.opponentToken === tokenId) side = "opponent";
    }
    if (!side) continue;
    if (d.status === "active") delta -= d.stake;
    else if (d.result?.winner === side) delta += d.stake;
    else if (d.result?.winner === other(side)) delta -= d.stake;
  }
  return delta;
}

export function duelRecord(tokenId: string, duels: Duel[]) {
  let wins = 0, losses = 0, draws = 0;
  for (const d of duels) {
    if (d.mode !== "league" || d.status !== "done" || !d.result) continue;
    const side: Side | null = d.challengerToken === tokenId ? "challenger" : d.opponentToken === tokenId ? "opponent" : null;
    if (!side) continue;
    if (d.result.winner === "draw") draws++;
    else if (d.result.winner === side) wins++;
    else losses++;
  }
  return { wins, losses, draws };
}

// Arena bankroll for one side, from that side's duel trades.
export function arenaBankroll(trades: Trade[], d: Duel, side: Side) {
  const mine = trades.filter((t) => t.duelId === d.id && t.tokenId === tokenOf(d, side) && t.wallet === sideKey(d, side));
  const settled = mine.filter((t) => t.status !== "open").reduce((s, t) => s + (t.pnl || 0), 0);
  const open = mine.filter((t) => t.status === "open").reduce((s, t) => s + t.amount, 0);
  return { balance: round2(ARENA_BANKROLL + settled - open), open: mine.filter((t) => t.status === "open").length, trades: mine.length };
}

// Arena trades store which side placed them in `wallet` (league wallet or
// "practice:<id>"), so two practice players using the same Chog stay apart.
export function sideKey(d: Duel, side: Side) {
  if (d.mode === "league") return side === "challenger" ? d.challengerWallet : d.opponentWallet;
  return `practice:${side === "challenger" ? d.challengerPractice : d.opponentPractice}`;
}

export type PriceDeps = {
  getSpot: (m: Market) => Promise<number>;
  getVolatility: (m: Market) => Promise<number>;
  getSettlementPrice: (m: Market, expiryMs: number) => Promise<number | null>;
  random?: () => number;
};

function scorePick(p: Pick | undefined, entry: number, sigma: number, settle: number): RoundResult {
  if (!p) return { won: false, pnl: -ROUND_AMOUNT, missed: true };
  const target = targetPrices(entry, p.multiplier, sigma, 1)[p.direction];
  const t = { amount: ROUND_AMOUNT, multiplier: p.multiplier, direction: p.direction, targetPrice: target } as Trade;
  const out = settleOutcome(t, settle);
  return { won: out.status === "won", pnl: out.pnl ?? 0, target };
}

function botPick(rand: () => number): Pick {
  return { direction: rand() < 0.5 ? "up" : "down", multiplier: [1, 1.5, 2][Math.floor(rand() * 3)], at: Date.now() };
}

function finish(d: Duel, result: DuelResult) {
  d.status = "done";
  d.result = result;
  d.winnerToken = result.winner === "draw" ? undefined : tokenOf(d, result.winner);
}

// Moves a duel forward to "now". Returns true if anything changed.
// `arenaTrades` must already be settled as far as possible (arena only).
export async function advanceDuel(d: Duel, now: number, deps: PriceDeps, arenaTrades: Trade[] = []): Promise<boolean> {
  let changed = false;
  const rand = deps.random ?? Math.random;

  if (d.status === "pending") {
    if (now > d.createdAt + INVITE_TTL_MS) {
      d.status = "expired";
      return true;
    }
    return false;
  }
  if (d.status !== "active" || !d.acceptedAt) return false;
  const f = FORMATS[d.format];

  if (f.kind === "arena") {
    if (now < (d.endsAt ?? Infinity)) return false;
    const stillOpen = arenaTrades.some((t) => t.duelId === d.id && t.status === "open");
    if (stillOpen) return false;
    const c = arenaBankroll(arenaTrades, d, "challenger").balance;
    const o = arenaBankroll(arenaTrades, d, "opponent").balance;
    finish(d, { winner: c > o ? "challenger" : o > c ? "opponent" : "draw", bankrolls: { challenger: c, opponent: o } });
    return true;
  }

  // Round-based formats. Loop because one load may need to do several steps.
  for (let guard = 0; guard < 20; guard++) {
    let r = d.rounds[d.rounds.length - 1];
    if (!r) {
      r = { n: 1, pickOpensAt: d.acceptedAt, pickClosesAt: d.acceptedAt + PICK_WINDOW_MS, picks: {} };
      d.rounds.push(r);
      changed = true;
    }

    if (r.lockedAt === undefined) {
      const bothPicked = !!(r.picks.challenger && r.picks.opponent);
      if (d.isBot && r.picks.challenger && !r.picks.opponent) {
        r.picks.opponent = botPick(rand);
        changed = true;
        continue;
      }
      if (!bothPicked && now < r.pickClosesAt) return changed;
      if (!r.picks.challenger && !r.picks.opponent) {
        // Nobody picked: the round is a tie, move on.
        r.lockedAt = now;
        r.winner = "tie";
        r.results = { challenger: { won: false, pnl: 0, missed: true }, opponent: { won: false, pnl: 0, missed: true } };
      } else {
        const [entry, sigma] = await Promise.all([deps.getSpot(d.market), deps.getVolatility(d.market)]);
        r.lockedAt = now;
        r.entryPrice = entry;
        r.sigma = sigma;
        r.expiresAt = expiryFor(now, 1);
      }
      changed = true;
    }

    if (r.winner === undefined) {
      if (now < (r.expiresAt ?? 0) + 3000) return changed;
      const settle = await deps.getSettlementPrice(d.market, r.expiresAt!);
      if (settle === null) return changed;
      r.settlePrice = settle;
      const c = scorePick(r.picks.challenger, r.entryPrice!, r.sigma!, settle);
      const o = scorePick(r.picks.opponent, r.entryPrice!, r.sigma!, settle);
      r.results = { challenger: c, opponent: o };
      r.winner = c.pnl > o.pnl ? "challenger" : o.pnl > c.pnl ? "opponent" : "tie";
      changed = true;
    }

    const s = score(d);
    if (s.challenger >= f.toWin || s.opponent >= f.toWin || d.rounds.length >= f.maxRounds) {
      if (s.challenger === s.opponent) {
        const pnl = (side: Side) => d.rounds.reduce((sum, x) => sum + (x.results?.[side]?.pnl ?? 0), 0);
        const pc = pnl("challenger"), po = pnl("opponent");
        finish(d, { winner: pc > po ? "challenger" : po > pc ? "opponent" : "draw", score: s, reason: "Tied on rounds, decided by total round profit" });
      } else {
        finish(d, { winner: s.challenger > s.opponent ? "challenger" : "opponent", score: s });
      }
      return true;
    }

    d.rounds.push({ n: r.n + 1, pickOpensAt: now, pickClosesAt: now + PICK_WINDOW_MS, picks: {} });
    changed = true;
  }
  return changed;
}

// What a player is allowed to see: the other side's pick stays hidden until the round locks.
export function publicDuel(d: Duel, viewer: Side | null): Duel {
  return {
    ...d,
    challengerPractice: undefined,
    opponentPractice: undefined,
    rounds: d.rounds.map((r) => {
      if (r.lockedAt !== undefined) return r;
      const picks: Round["picks"] = {};
      if (viewer && r.picks[viewer]) picks[viewer] = r.picks[viewer];
      return { ...r, picks, hasPicked: { challenger: !!r.picks.challenger, opponent: !!r.picks.opponent } } as Round;
    }),
  };
}

export function validMultiplier(x: number, max: number) {
  return MULTIPLIERS.includes(x) && x <= max;
}

export const roundPayout = (multiplier: number) => payoutIfWin(ROUND_AMOUNT, multiplier);
