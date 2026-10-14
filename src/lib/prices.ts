// Live and historical prices from Coinbase's free public API (no key needed).
// Used only on the server, so players can't fake a price.
import type { Market } from "./game";

const API = "https://api.exchange.coinbase.com";
const PRODUCT: Record<Market, string> = { BTC: "BTC-USD", ETH: "ETH-USD", SOL: "SOL-USD", MON: "MON-USD" };
const HEADERS = { "User-Agent": "chog-league/0.1", Accept: "application/json" };

type Candle = [time: number, low: number, high: number, open: number, close: number, volume: number];

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(API + path, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Price service returned ${res.status}`);
  return res.json();
}

// TEST ONLY: made-up prices for local testing when Coinbase can't be reached.
// Turned on with CHOG_FAKE_PRICES=1 and never on Vercel. The price is a fixed
// wave over time, so entry and settlement always agree.
const FAKE = process.env.CHOG_FAKE_PRICES === "1" && !process.env.VERCEL;
const FAKE_BASE: Record<Market, number> = { BTC: 67000, ETH: 2600, SOL: 150, MON: 0.04 };
function fakePrice(market: Market, ms: number) {
  const t = ms / 1000;
  return FAKE_BASE[market] * (1 + 0.002 * Math.sin(t / 37) + 0.0012 * Math.sin(t / 7.3) + 0.0007 * Math.sin(t / 2.1));
}

const spotCache = new Map<Market, { at: number; price: number }>();

export async function getSpot(market: Market): Promise<number> {
  if (FAKE) return fakePrice(market, Date.now());
  const hit = spotCache.get(market);
  if (hit && Date.now() - hit.at < 1000) return hit.price;
  const t = await getJson<{ price: string }>(`/products/${PRODUCT[market]}/ticker`);
  const price = Number(t.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error("Bad price");
  spotCache.set(market, { at: Date.now(), price });
  return price;
}

async function candles(market: Market, startSec: number, endSec: number): Promise<Candle[]> {
  const q = `granularity=60&start=${new Date(startSec * 1000).toISOString()}&end=${new Date(endSec * 1000).toISOString()}`;
  return getJson<Candle[]>(`/products/${PRODUCT[market]}/candles?${q}`);
}

// The closing price of the 1-minute candle that ends exactly at `expiryMs`.
// Returns null if the exchange hasn't published that candle yet (try again shortly).
const settleCache = new Map<string, number>();
export async function getSettlementPrice(market: Market, expiryMs: number): Promise<number | null> {
  if (FAKE) return Date.now() >= expiryMs + 2000 ? fakePrice(market, expiryMs) : null;
  const key = `${market}:${expiryMs}`;
  const cached = settleCache.get(key);
  if (cached !== undefined) return cached;
  const bucket = Math.floor(expiryMs / 1000) - 60; // candle covering the last minute before expiry
  // End the range at "now" (not at the bucket): Coinbase's CDN caches identical
  // URLs for 5 minutes, so a fixed URL keeps returning a list from before the
  // candle existed. A fresh end time makes every check a new request.
  const list = await candles(market, bucket - 300, Math.max(bucket + 60, Math.floor(Date.now() / 1000)));
  const exact = list.find((c) => c[0] === bucket);
  // A minute with zero trades has no candle; fall back to the latest earlier close.
  const earlier = list.filter((c) => c[0] < bucket).sort((a, b) => b[0] - a[0])[0];
  const price = exact ? exact[4] : Date.now() - expiryMs > 120000 && earlier ? earlier[4] : null;
  if (price !== null) settleCache.set(key, price);
  return price;
}

// Typical 1-minute move, from the last ~30 one-minute candles (standard deviation of returns).
const volCache = new Map<Market, { at: number; sigma: number }>();
export async function getVolatility(market: Market): Promise<number> {
  if (FAKE) return 0.0015;
  const hit = volCache.get(market);
  if (hit && Date.now() - hit.at < 60000) return hit.sigma;
  const now = Math.floor(Date.now() / 1000);
  const list = (await candles(market, now - 35 * 60, now)).sort((a, b) => a[0] - b[0]);
  const rets: number[] = [];
  for (let i = 1; i < list.length; i++) rets.push(Math.log(list[i][4] / list[i - 1][4]));
  const mean = rets.reduce((s, r) => s + r, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  // Floor so quiet markets still have a sensible spread; cap so spikes don't go silly.
  const sigma = Math.min(0.02, Math.max(0.0003, Number.isFinite(sd) ? sd : 0.0005));
  volCache.set(market, { at: Date.now(), sigma });
  return sigma;
}
