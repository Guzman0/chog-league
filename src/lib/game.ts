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

import type { PowerId } from "./identity";

export const MARKETS = ["BTC", "ETH", "SOL", "MON"] as const;
export type Market = (typeof MARKETS)[number];

export const DURATIONS_MIN = [1, 2, 3, 5];
export const AMOUNTS = [10, 25, 50, 100]; // quick-pick buttons; any whole amount in range is allowed
export const MULTIPLIERS = [1, 1.5, 2, 3, 4, 5]; // quick-pick buttons; any 1-decimal value in range is allowed
export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 500;
export const MIN_MULTIPLIER = 1;
export const MAX_MULTIPLIER = 5;

// Typed-in values: whole dollars, and multipliers with at most one decimal (e.g. 2.7x).
export function isValidAmount(a: number) {
  return Number.isInteger(a) && a >= MIN_AMOUNT && a <= MAX_AMOUNT;
}
export function isValidMultiplier(x: number, max = MAX_MULTIPLIER) {
  return Number.isFinite(x) && x >= MIN_MULTIPLIER && x <= max && Math.abs(x * 10 - Math.round(x * 10)) < 1e-9;
}
export const WEEKLY_BALANCE = 1000;
export const WEEK_MS = 7 * 86400000;
export const DAY_MS = 86400000;
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
// Chosen so the chance of winning is 1 / (1 + multiplier), which keeps every
// multiplier fair: higher payout, lower chance. (1x = 50%, 2x = 1 in 3, 5x = 1 in 6.)
// zFor(m) is the bell-curve point with that much chance above it.
export function zFor(multiplier: number) {
  return inverseNormal(multiplier / (1 + multiplier));
}

// Standard inverse normal (Acklam's approximation, accurate to ~1e-9).
function inverseNormal(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -inverseNormal(1 - p);
  const q = p - 0.5, r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

// sigmaPerMin = the market's typical 1-minute move (e.g. 0.0006 = 0.06%), measured from recent prices.
export function targetPrices(entry: number, multiplier: number, sigmaPerMin: number, minutes: number) {
  const move = zFor(multiplier) * sigmaPerMin * Math.sqrt(minutes);
  return { up: entry * (1 + move), down: entry * (1 - move) };
}

export function levelFor(netWins: number) {
  const n = Math.max(0, netWins);
  let current = LEVELS[0];
  for (const l of LEVELS) if (n >= l.netWins) current = l;
  const next = LEVELS.find((l) => l.netWins > n) || null;
  return { ...current, next };
}

// 00:00 UTC of the day containing `ms` (Chog powers recharge then).
export function dayStart(ms: number) {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
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
export type TradeStatus = "open" | "won" | "lost" | "push" | "cashed";

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
  // The Chog's once-a-day power, if it was used on this call (see identity.ts).
  power?: PowerId;
};

export function settleOutcome(t: Trade, settlePrice: number): Pick<Trade, "status" | "settlePrice" | "payout" | "pnl"> {
  const hit = t.direction === "up" ? settlePrice > t.targetPrice : settlePrice < t.targetPrice;
  const exact = settlePrice === t.targetPrice;
  if (exact) return { status: "push", settlePrice, payout: t.amount, pnl: 0 };
  // Parachute: half the profit on a win, half the stake back on a loss (same odds, smaller swing).
  const payout = hit ? winPayout(t.amount, t.multiplier, t.power) : t.power === "parachute" ? round2(t.amount / 2) : 0;
  return { status: hit ? "won" : "lost", settlePrice, payout, pnl: round2(payout - t.amount) };
}

// What a call pays back if it wins (Parachute halves the profit).
export function winPayout(amount: number, multiplier: number, power?: PowerId) {
  return power === "parachute" ? round2(amount + (amount * multiplier) / 2) : payoutIfWin(amount, multiplier);
}

// How much a settled call moves the Chog's level: +1 for a win, -1 for a loss,
// changed by Shield (a loss counts 0) and Double Up (a win counts 2).
export function levelPoints(t: Trade) {
  if (t.status === "won") return t.power === "double" ? 2 : 1;
  if (t.status === "lost") return t.power === "shield" ? 0 : -1;
  return 0;
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
  powerUsedToday: boolean; // the Chog's once-a-day power (recharges 00:00 UTC)
  dayStreak: number; // days in a row with at least one call
  playedToday: boolean;
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
  const netWins = settled.reduce((n, t) => n + levelPoints(t), 0);
  const ws = weekStart(nowMs);
  const week = mine.filter((t) => t.openedAt >= ws && t.openedAt < ws + WEEK_MS);

  // Daily streak: days in a row (UTC) with at least one call. Still alive if
  // the last call was yesterday, so you have all of today to keep it going.
  const today = dayStart(nowMs);
  const days = new Set(mine.filter((t) => t.openedAt <= nowMs).map((t) => dayStart(t.openedAt)));
  let dayStreak = 0;
  for (let d = days.has(today) ? today : today - DAY_MS; days.has(d); d -= DAY_MS) dayStreak++;
  const weekPnl = round2(week.filter((t) => t.status !== "open").reduce((s, t) => s + (t.pnl || 0), 0));
  const openStake = week.filter((t) => t.status === "open").reduce((s, t) => s + t.amount, 0);

  let streak = 0;
  for (let i = settled.length - 1; i >= 0; i--) {
    const s = settled[i].status;
    if (s === "push" || s === "cashed") continue;
    if (streak === 0) streak = s === "won" ? 1 : -1;
    else if ((streak > 0 && s === "won") || (streak < 0 && s === "lost")) streak += streak > 0 ? 1 : -1;
    else break;
  }

  return {
    tokenId,
    wins,
    losses,
    pushes,
    netWins,
    hitRate: wins + losses > 0 ? wins / (wins + losses) : null,
    totalTrades: mine.length,
    bestWin: settled.reduce((m, t) => Math.max(m, t.pnl || 0), 0),
    level: levelFor(netWins),
    weekStart: ws,
    weekBalance: round2(WEEKLY_BALANCE + weekPnl - openStake + duelDelta),
    weekPnl,
    weekTrades: week.length,
    openTrades: mine.filter((t) => t.status === "open").length,
    lastResult: settled.length ? settled[settled.length - 1].status : null,
    streak,
    duelDelta,
    powerUsedToday: mine.some((t) => t.power && t.openedAt >= dayStart(nowMs)),
    dayStreak,
    playedToday: days.has(today),
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

// ---------------------------------------------------------------- Cash out
// A live call can be closed early for what it's worth right now: its chance of
// winning from here (same bell-curve maths that set the target) times what it
// pays, minus a small exit fee. Cashing out the moment you open gets your stake
// back (less the fee), so it can't be used to dodge risk for free. A cash-out
// counts as neither a win nor a loss for the level.
export const CASHOUT_FEE = 0.02;
export const CASHOUT_CUTOFF_MS = 10_000; // the result is about to be decided

// Standard normal CDF (Abramowitz & Stegun 7.1.26, error < 1.5e-7).
function normalCdf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// The call's length as picked (1, 2, 3 or 5 min); calls end on whole minutes.
export function tradeMinutes(t: Pick<Trade, "openedAt" | "expiresAt">) {
  return Math.max(1, Math.round((t.expiresAt - t.openedAt) / 60000));
}

// The volatility the target was set with (falls back to today's for 1x calls).
function openSigma(t: Trade, fallback: number) {
  const z = zFor(t.multiplier);
  const move = Math.abs(t.targetPrice / t.entryPrice - 1);
  return z > 1e-6 && move > 0 ? move / (z * Math.sqrt(tradeMinutes(t))) : fallback;
}

export function winChanceNow(t: Trade, price: number, sigmaNow: number, nowMs: number) {
  const left = Math.max(0, t.expiresAt - nowMs);
  const minutesLeft = (left / (t.expiresAt - t.openedAt)) * tradeMinutes(t);
  const ahead = t.direction === "up" ? price > t.targetPrice : price < t.targetPrice;
  if (minutesLeft <= 0) return ahead ? 1 : 0;
  const z = (t.targetPrice / price - 1) / (openSigma(t, sigmaNow) * Math.sqrt(minutesLeft));
  return t.direction === "up" ? 1 - normalCdf(z) : normalCdf(z);
}

export function cashOutValue(t: Trade, price: number, sigmaNow: number, nowMs: number) {
  const p = winChanceNow(t, price, sigmaNow, nowMs);
  const ifWin = winPayout(t.amount, t.multiplier, t.power);
  const ifLose = t.power === "parachute" ? t.amount / 2 : 0;
  return Math.max(0, Math.floor((p * ifWin + (1 - p) * ifLose) * (1 - CASHOUT_FEE) * 100) / 100);
}
