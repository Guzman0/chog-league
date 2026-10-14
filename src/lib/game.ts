// =============================================================================
// CHOG LEAGUE GAME RULES
//
// Each trade: pick a market, HIGHER or LOWER, a duration, an amount and a
// payout multiplier. A bigger multiplier pays more, but the target price is
// further away, so it's harder to hit (same idea as Manic's risk/reward).
//
// Your Chog earns bigger multipliers by levelling up. Level = wins minus
// losses across the Chog's whole career, so lucky streaks get cancelled out
// and only consistent skill climbs. Everything is stored against the Chog's
// token ID, so a levelled-up Chog keeps its level when it's sold.
//
// Every Chog gets a fresh weekly demo balance. The leaderboard ranks Chogs by
// that balance, and it resets every Monday 00:00 UTC.
// =============================================================================

export const MARKETS = ["BTC", "ETH", "SOL", "MON"] as const;
export type Market = (typeof MARKETS)[number];

export const DURATIONS_MIN = [1, 2, 3, 5];
export const AMOUNTS = [10, 25, 50, 100];
export const MULTIPLIERS = [1, 1.5, 2, 3, 4, 5];
export const WEEKLY_BALANCE = 1000;
export const MAX_OPEN_TRADES = 5;

// Level thresholds: net wins (wins minus losses) needed, and the biggest multiplier unlocked.
export const LEVELS = [
  { level: 1, netWins: 0, maxMultiplier: 1.5, title: "Rookie" },
  { level: 2, netWins: 5, maxMultiplier: 2, title: "Trader" },
  { level: 3, netWins: 15, maxMultiplier: 3, title: "Sharp" },
  { level: 4, netWins: 30, maxMultiplier: 4, title: "Shark" },
  { level: 5, netWins: 50, maxMultiplier: 5, title: "Legend" },
];

// A win pays back amount × (1 + multiplier). At 1x that's double your money.
export function payoutIfWin(amount: number, multiplier: number) {
  return round2(amount * (1 + multiplier));
}

// How far the target sits from the entry price, in "typical moves".
// Chosen so the chance of winning is about 1 / (1 + multiplier), which keeps
// every multiplier roughly fair: higher payout, lower chance.
const Z_BY_MULTIPLIER: Record<string, number> = { "1": 0, "1.5": 0.2533, "2": 0.4307, "3": 0.6745, "4": 0.8416, "5": 0.9674 };

// sigmaPerMin = the market's typical 1-minute move (e.g. 0.0006 = 0.06%), measured from recent prices.
export function targetPrices(entry: number, multiplier: number, sigmaPerMin: number, minutes: number) {
  const z = Z_BY_MULTIPLIER[String(multiplier)] ?? 0;
  const move = z * sigmaPerMin * Math.sqrt(minutes);
  return { up: entry * (1 + move), down: entry * (1 - move) };
}

export function levelFor(netWins: number) {
  const n = Math.max(0, netWins);
  let current = LEVELS[0];
  for (const l of LEVELS) if (n >= l.netWins) current = l;
  const next = LEVELS.find((l) => l.netWins > n) || null;
  return { ...current, next };
}

// Monday 00:00 UTC of the week containing `ms`.
export function weekStart(ms: number) {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
}

// Trades settle on a whole minute, so the closing price can be checked later
// against the exchange's 1-minute candles. If the next minute is under 30s
// away, we skip to the one after, so a "1 minute" trade lasts 1 to 1.5 minutes.
export function expiryFor(nowMs: number, minutes: number) {
  let next = Math.ceil(nowMs / 60000) * 60000;
  if (next - nowMs < 30000) next += 60000;
  return next + (minutes - 1) * 60000;
}

export type Direction = "up" | "down";
export type TradeStatus = "open" | "won" | "lost" | "push";

export type Trade = {
  id: string;
  tokenId: string;
  wallet: string;
  market: Market;
  direction: Direction;
  amount: number;
  multiplier: number;
  entryPrice: number;
  targetPrice: number;
  openedAt: number;
  expiresAt: number;
  status: TradeStatus;
  settlePrice?: number;
  payout?: number;
  pnl?: number;
  // Set on Practice trades only. Practice trades never count toward the
  // Chog's real record or the league; they belong to one practice player.
  practiceId?: string;
  // Set on trades made inside a duel (Arena). Duel trades don't count toward
  // the Chog's level or weekly balance; the duel stake does.
  duelId?: string;
};

export function settleOutcome(t: Trade, settlePrice: number): Pick<Trade, "status" | "settlePrice" | "payout" | "pnl"> {
  const hit = t.direction === "up" ? settlePrice > t.targetPrice : settlePrice < t.targetPrice;
  const exact = settlePrice === t.targetPrice;
  if (exact) return { status: "push", settlePrice, payout: t.amount, pnl: 0 };
  const payout = hit ? payoutIfWin(t.amount, t.multiplier) : 0;
  return { status: hit ? "won" : "lost", settlePrice, payout, pnl: round2(payout - t.amount) };
}

export type ChogSummary = {
  tokenId: string;
  wins: number;
  losses: number;
  pushes: number;
  netWins: number;
  hitRate: number | null; // 0..1
  totalTrades: number;
  bestWin: number;
  level: ReturnType<typeof levelFor>;
  weekStart: number;
  weekBalance: number;
  weekPnl: number;
  weekTrades: number;
  openTrades: number;
  lastResult: TradeStatus | null;
  streak: number; // positive = win streak, negative = loss streak
  duelDelta: number; // balance change from duels this week (stakes held or won/lost)
};

// The real record of a Chog (practiceId omitted), or one player's practice
// record with that Chog (practiceId given). The two never mix.
export function inScope(t: Trade, tokenId: string, practiceId?: string | null) {
  if (t.duelId) return false; // duel trades are scored inside their duel
  return t.tokenId === tokenId && (practiceId ? t.practiceId === practiceId : !t.practiceId);
}

export function summarize(tokenId: string, trades: Trade[], nowMs = Date.now(), practiceId?: string | null, duelDelta = 0): ChogSummary {
  const mine = trades.filter((t) => inScope(t, tokenId, practiceId)).sort((a, b) => a.expiresAt - b.expiresAt);
  const settled = mine.filter((t) => t.status !== "open");
  const wins = settled.filter((t) => t.status === "won").length;
  const losses = settled.filter((t) => t.status === "lost").length;
  const pushes = settled.filter((t) => t.status === "push").length;
  const ws = weekStart(nowMs);
  const week = mine.filter((t) => t.openedAt >= ws);
  const weekPnl = round2(week.filter((t) => t.status !== "open").reduce((s, t) => s + (t.pnl || 0), 0));
  const openStake = week.filter((t) => t.status === "open").reduce((s, t) => s + t.amount, 0);

  let streak = 0;
  for (let i = settled.length - 1; i >= 0; i--) {
    const s = settled[i].status;
    if (s === "push") continue;
    if (streak === 0) streak = s === "won" ? 1 : -1;
    else if ((streak > 0 && s === "won") || (streak < 0 && s === "lost")) streak += streak > 0 ? 1 : -1;
    else break;
  }

  return {
    tokenId,
    wins,
    losses,
    pushes,
    netWins: wins - losses,
    hitRate: wins + losses > 0 ? wins / (wins + losses) : null,
    totalTrades: mine.length,
    bestWin: settled.reduce((m, t) => Math.max(m, t.pnl || 0), 0),
    level: levelFor(wins - losses),
    weekStart: ws,
    weekBalance: round2(WEEKLY_BALANCE + weekPnl - openStake + duelDelta),
    weekPnl,
    weekTrades: week.length,
    openTrades: mine.filter((t) => t.status === "open").length,
    lastResult: settled.length ? settled[settled.length - 1].status : null,
    streak,
    duelDelta,
  };
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export function formatPrice(n: number) {
  if (n >= 1000) return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(3);
  return n.toFixed(6);
}
