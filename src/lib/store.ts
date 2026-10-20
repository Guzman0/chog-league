// Trade storage. Two backends with the same functions:
//  - Supabase (online database), used when SUPABASE_URL and SUPABASE_SECRET_KEY are set.
//  - A local file (data/chog-league.json), used otherwise, for running on your laptop.
import fs from "fs/promises";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Trade } from "./game";
import type { Duel, DuelStatus } from "./duels";
import { isPowerId } from "./identity";
import type { ChipIn, Loadout, Payout, Purchase, Tip } from "./shop";

export type TradeFilter = {
  tokenId?: string;
  tokenIds?: string[];
  // undefined = any trade · null = league trades only · string = that practice player's trades
  practiceId?: string | null;
  since?: number; // openedAt >= since
  dueBefore?: number; // open trades with expiresAt <= dueBefore
  duelId?: string;
};

export type TradePatch = Partial<Pick<Trade, "status" | "settlePrice" | "payout" | "pnl">>;

// ---------------------------------------------------------------- Supabase
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
export const usingSupabase = !!(SB_URL && SB_KEY);

let sb: SupabaseClient | null = null;
export function supabase(): SupabaseClient {
  if (!usingSupabase) throw new Error("Supabase is not configured");
  sb ??= createClient(SB_URL!, SB_KEY!, { auth: { persistSession: false } });
  return sb;
}

type Row = {
  id: string; token_id: string; wallet: string; practice_id: string | null; duel_id: string | null;
  market: string; direction: string; amount: number; multiplier: number; entry_price: number; target_price: number;
  opened_at: number; expires_at: number; status: string; settle_price: number | null; payout: number | null; pnl: number | null;
  power?: string | null;
};

function toRow(t: Trade): Row {
  return {
    id: t.id, token_id: t.tokenId, wallet: t.wallet, practice_id: t.practiceId ?? null, duel_id: t.duelId ?? null,
    market: t.market, direction: t.direction, amount: t.amount, multiplier: t.multiplier,
    entry_price: t.entryPrice, target_price: t.targetPrice, opened_at: t.openedAt, expires_at: t.expiresAt,
    status: t.status, settle_price: t.settlePrice ?? null, payout: t.payout ?? null, pnl: t.pnl ?? null,
    // Only sent when used, so databases without the "power" column still accept normal trades.
    ...(t.power ? { power: t.power } : {}),
  };
}

function fromRow(r: Row): Trade {
  const t: Trade = {
    id: r.id, tokenId: r.token_id, wallet: r.wallet, market: r.market as Trade["market"], direction: r.direction as Trade["direction"],
    amount: Number(r.amount), multiplier: Number(r.multiplier), entryPrice: Number(r.entry_price), targetPrice: Number(r.target_price),
    openedAt: Number(r.opened_at), expiresAt: Number(r.expires_at), status: r.status as Trade["status"],
  };
  if (r.practice_id) t.practiceId = r.practice_id;
  if (r.duel_id) t.duelId = r.duel_id;
  if (r.settle_price !== null) t.settlePrice = Number(r.settle_price);
  if (r.payout !== null) t.payout = Number(r.payout);
  if (r.pnl !== null) t.pnl = Number(r.pnl);
  if (r.power && isPowerId(r.power)) t.power = r.power;
  return t;
}

async function sbList(f: TradeFilter): Promise<Trade[]> {
  const out: Trade[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase().from("trades").select("*").order("opened_at", { ascending: true }).range(from, from + PAGE - 1);
    if (f.tokenId) q = q.eq("token_id", f.tokenId);
    if (f.tokenIds) q = q.in("token_id", f.tokenIds.length ? f.tokenIds : ["-"]);
    if (f.practiceId === null) q = q.is("practice_id", null);
    else if (typeof f.practiceId === "string") q = q.eq("practice_id", f.practiceId);
    if (f.since !== undefined) q = q.gte("opened_at", f.since);
    if (f.dueBefore !== undefined) q = q.eq("status", "open").lte("expires_at", f.dueBefore);
    if (f.duelId) q = q.eq("duel_id", f.duelId);
    const { data, error } = await q;
    if (error) throw new Error(`Database error: ${error.message}`);
    out.push(...(data as Row[]).map(fromRow));
    if (!data || data.length < PAGE) return out;
  }
}

// ---------------------------------------------------------------- Local file
const DIR = path.join(process.cwd(), "data");
const FILE = path.join(DIR, "chog-league.json");
type FileDB = { trades: Trade[] };

async function load(): Promise<FileDB> {
  try {
    const db = JSON.parse(await fs.readFile(FILE, "utf8"));
    return { ...db, trades: Array.isArray(db.trades) ? db.trades : [] };
  } catch {
    return { trades: [] };
  }
}
async function save(db: FileDB) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(FILE + ".tmp", JSON.stringify(db, null, 2));
  await fs.rename(FILE + ".tmp", FILE);
}
let queue: Promise<unknown> = Promise.resolve();
export function withFile<T>(fn: (db: FileDB) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const r = await fn(db);
    await save(db);
    return r;
  });
  queue = run.catch(() => undefined);
  return run;
}
export async function readFile(): Promise<FileDB> {
  await queue;
  return load();
}

function matches(t: Trade, f: TradeFilter) {
  if (f.tokenId && t.tokenId !== f.tokenId) return false;
  if (f.tokenIds && !f.tokenIds.includes(t.tokenId)) return false;
  if (f.practiceId === null && t.practiceId) return false;
  if (typeof f.practiceId === "string" && t.practiceId !== f.practiceId) return false;
  if (f.since !== undefined && t.openedAt < f.since) return false;
  if (f.dueBefore !== undefined && !(t.status === "open" && t.expiresAt <= f.dueBefore)) return false;
  if (f.duelId && t.duelId !== f.duelId) return false;
  return true;
}

// ---------------------------------------------------------------- Public API
export async function listTrades(f: TradeFilter = {}): Promise<Trade[]> {
  if (usingSupabase) return sbList(f);
  return (await readFile()).trades.filter((t) => matches(t, f)).sort((a, b) => a.openedAt - b.openedAt);
}

export async function getTrade(id: string): Promise<Trade | null> {
  if (usingSupabase) {
    const { data, error } = await supabase().from("trades").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`Database error: ${error.message}`);
    return data ? fromRow(data as Row) : null;
  }
  return (await readFile()).trades.find((t) => t.id === id) ?? null;
}

export async function insertTrade(t: Trade): Promise<void> {
  if (usingSupabase) {
    const { error } = await supabase().from("trades").insert(toRow(t));
    if (error && t.power && /power/i.test(error.message)) {
      throw new Error("Chog powers need a one-time database update (see supabase/schema.sql). Trade without the power for now.");
    }
    if (error) throw new Error(`Database error: ${error.message}`);
    return;
  }
  await withFile((db) => {
    db.trades.push(t);
  });
}

// Only updates trades that are still open, so a trade can't be settled twice.
export async function settleTrades(updates: { id: string; patch: TradePatch }[]): Promise<void> {
  if (updates.length === 0) return;
  if (usingSupabase) {
    await Promise.all(
      updates.map(async ({ id, patch }) => {
        const { error } = await supabase()
          .from("trades")
          .update({ status: patch.status, settle_price: patch.settlePrice, payout: patch.payout, pnl: patch.pnl })
          .eq("id", id)
          .eq("status", "open");
        if (error) throw new Error(`Database error: ${error.message}`);
      }),
    );
    return;
  }
  const byId = new Map(updates.map((u) => [u.id, u.patch]));
  await withFile((db) => {
    for (const t of db.trades) {
      const p = byId.get(t.id);
      if (p && t.status === "open") Object.assign(t, p);
    }
  });
}

// Close one open call early (cash out). Returns false if it already ended.
export async function cashOutTrade(id: string, patch: { settlePrice: number; payout: number; pnl: number; closedAt: number }): Promise<boolean> {
  if (usingSupabase) {
    const { data, error } = await supabase()
      .from("trades")
      .update({ status: "cashed", settle_price: patch.settlePrice, payout: patch.payout, pnl: patch.pnl, expires_at: patch.closedAt })
      .eq("id", id)
      .eq("status", "open")
      .select("id");
    if (error && /check constraint|status_check/i.test(error.message)) {
      throw new Error("Cash out needs a one-time database update (see supabase/schema.sql).");
    }
    if (error) throw new Error(`Database error: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }
  return withFile((db) => {
    const t = db.trades.find((x) => x.id === id);
    if (!t || t.status !== "open") return false;
    Object.assign(t, { status: "cashed", settlePrice: patch.settlePrice, payout: patch.payout, pnl: patch.pnl, expiresAt: patch.closedAt });
    return true;
  });
}

// ================================================================ Duels

export type DuelFilter = { id?: string; statuses?: DuelStatus[]; tokenIds?: string[]; wallet?: string; practiceId?: string; acceptedSince?: number };

type DuelRow = {
  id: string; mode: string; format: string; market: string; stake: number;
  challenger_token: string; challenger_wallet: string; challenger_practice: string | null;
  opponent_token: string; opponent_wallet: string; opponent_practice: string | null;
  is_bot: boolean; status: string; created_at: number; accepted_at: number | null; ends_at: number | null;
  winner_token: string | null; rounds: Duel["rounds"]; result: Duel["result"] | null; version: number;
};

function duelToRow(d: Duel): DuelRow {
  return {
    id: d.id, mode: d.mode, format: d.format, market: d.market, stake: d.stake,
    challenger_token: d.challengerToken, challenger_wallet: d.challengerWallet, challenger_practice: d.challengerPractice ?? null,
    opponent_token: d.opponentToken, opponent_wallet: d.opponentWallet, opponent_practice: d.opponentPractice ?? null,
    is_bot: d.isBot, status: d.status, created_at: d.createdAt, accepted_at: d.acceptedAt ?? null, ends_at: d.endsAt ?? null,
    winner_token: d.winnerToken ?? null, rounds: d.rounds, result: d.result ?? null, version: d.version,
  };
}

function duelFromRow(r: DuelRow): Duel {
  const d: Duel = {
    id: r.id, mode: r.mode as Duel["mode"], format: r.format as Duel["format"], market: r.market as Duel["market"], stake: Number(r.stake),
    challengerToken: r.challenger_token, challengerWallet: r.challenger_wallet, opponentToken: r.opponent_token, opponentWallet: r.opponent_wallet,
    isBot: r.is_bot, status: r.status as DuelStatus, createdAt: Number(r.created_at), rounds: r.rounds ?? [], version: Number(r.version ?? 0),
  };
  if (r.challenger_practice) d.challengerPractice = r.challenger_practice;
  if (r.opponent_practice) d.opponentPractice = r.opponent_practice;
  if (r.accepted_at !== null) d.acceptedAt = Number(r.accepted_at);
  if (r.ends_at !== null) d.endsAt = Number(r.ends_at);
  if (r.winner_token) d.winnerToken = r.winner_token;
  if (r.result) d.result = r.result;
  return d;
}

function duelMatches(d: Duel, f: DuelFilter) {
  if (f.id && d.id !== f.id) return false;
  if (f.statuses && !f.statuses.includes(d.status)) return false;
  if (f.tokenIds && !(f.tokenIds.includes(d.challengerToken) || f.tokenIds.includes(d.opponentToken))) return false;
  if (f.wallet && !(d.challengerWallet === f.wallet || d.opponentWallet === f.wallet)) return false;
  if (f.practiceId && !(d.challengerPractice === f.practiceId || d.opponentPractice === f.practiceId)) return false;
  if (f.acceptedSince !== undefined && !(d.acceptedAt !== undefined && d.acceptedAt >= f.acceptedSince)) return false;
  return true;
}

type FileDuels = { duels?: Duel[]; presence?: Presence[] };

export async function listDuels(f: DuelFilter = {}): Promise<Duel[]> {
  if (usingSupabase) {
    let q = supabase().from("duels").select("*").order("created_at", { ascending: false }).limit(500);
    if (f.id) q = q.eq("id", f.id);
    if (f.statuses) q = q.in("status", f.statuses);
    if (f.tokenIds) {
      const list = f.tokenIds.map((t) => `"${t}"`).join(",");
      q = q.or(`challenger_token.in.(${list}),opponent_token.in.(${list})`);
    }
    if (f.wallet) q = q.or(`challenger_wallet.eq.${f.wallet},opponent_wallet.eq.${f.wallet}`);
    if (f.practiceId) q = q.or(`challenger_practice.eq.${f.practiceId},opponent_practice.eq.${f.practiceId}`);
    if (f.acceptedSince !== undefined) q = q.gte("accepted_at", f.acceptedSince);
    const { data, error } = await q;
    if (error) throw new Error(`Database error: ${error.message}`);
    return (data as DuelRow[]).map(duelFromRow);
  }
  const db = (await readFile()) as FileDB & FileDuels;
  return (db.duels ?? []).filter((d) => duelMatches(d, f)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDuel(id: string): Promise<Duel | null> {
  return (await listDuels({ id }))[0] ?? null;
}

export async function insertDuel(d: Duel): Promise<void> {
  if (usingSupabase) {
    const { error } = await supabase().from("duels").insert(duelToRow(d));
    if (error) throw new Error(`Database error: ${error.message}`);
    return;
  }
  await withFile((db) => {
    const x = db as FileDB & FileDuels;
    (x.duels ??= []).push(d);
  });
}

// Saves only if nobody else saved this duel in the meantime (version check).
// Returns false if someone else got there first; the caller just re-reads.
export async function saveDuel(d: Duel, expectedVersion: number): Promise<boolean> {
  const next = { ...d, version: expectedVersion + 1 };
  if (usingSupabase) {
    const { data, error } = await supabase().from("duels").update(duelToRow(next)).eq("id", d.id).eq("version", expectedVersion).select("id");
    if (error) throw new Error(`Database error: ${error.message}`);
    if (data && data.length > 0) {
      d.version = next.version;
      return true;
    }
    return false;
  }
  return withFile((db) => {
    const x = db as FileDB & FileDuels;
    const i = (x.duels ?? []).findIndex((e) => e.id === d.id);
    if (i < 0 || x.duels![i].version !== expectedVersion) return false;
    x.duels![i] = next;
    d.version = next.version;
    return true;
  });
}

// ================================================================ Presence (duel lobby)
export type Presence = {
  playerKey: string; tokenId: string; wallet: string; practiceId?: string; mode: "league" | "practice";
  name?: string; image?: string; lastSeen: number;
};

export async function upsertPresence(p: Presence): Promise<void> {
  if (usingSupabase) {
    const { error } = await supabase().from("presence").upsert({
      player_key: p.playerKey, token_id: p.tokenId, wallet: p.wallet, practice_id: p.practiceId ?? null,
      mode: p.mode, name: p.name ?? null, image: p.image ?? null, last_seen: p.lastSeen,
    });
    if (error) throw new Error(`Database error: ${error.message}`);
    return;
  }
  await withFile((db) => {
    const x = db as FileDB & FileDuels;
    x.presence = (x.presence ?? []).filter((e) => e.playerKey !== p.playerKey && e.lastSeen > Date.now() - 10 * 60000);
    x.presence.push(p);
  });
}

export async function listPresence(since: number): Promise<Presence[]> {
  if (usingSupabase) {
    const { data, error } = await supabase().from("presence").select("*").gte("last_seen", since).limit(200);
    if (error) throw new Error(`Database error: ${error.message}`);
    return (data as { player_key: string; token_id: string; wallet: string; practice_id: string | null; mode: string; name: string | null; image: string | null; last_seen: number }[]).map((r) => ({
      playerKey: r.player_key, tokenId: r.token_id, wallet: r.wallet, practiceId: r.practice_id ?? undefined,
      mode: r.mode as Presence["mode"], name: r.name ?? undefined, image: r.image ?? undefined, lastSeen: Number(r.last_seen),
    }));
  }
  const db = (await readFile()) as FileDB & FileDuels;
  return (db.presence ?? []).filter((p) => p.lastSeen >= since);
}

// ================================================================ Shop ($CHOG cosmetics)
// Purchases and what each Chog wears are saved by token ID, so they go with the NFT.
type FileShop = { purchases?: Purchase[]; loadouts?: Record<string, Loadout>; payouts?: Payout[]; chipins?: ChipIn[]; tips?: Tip[] };
type PurchaseRow = { id: string; token_id: string; item_id: string; price: number; wallet: string; tx_hash: string; created_at: number };

const shopTableHint = (msg: string) =>
  /relation|does not exist|schema cache/i.test(msg) ? "The shop needs a one-time database update (see supabase/schema.sql)." : `Database error: ${msg}`;

export async function listPurchases(f: { tokenId?: string; since?: number; until?: number; txHash?: string } = {}): Promise<Purchase[]> {
  if (usingSupabase) {
    let q = supabase().from("purchases").select("*").order("created_at", { ascending: true }).limit(5000);
    if (f.tokenId) q = q.eq("token_id", f.tokenId);
    if (f.since !== undefined) q = q.gte("created_at", f.since);
    if (f.until !== undefined) q = q.lte("created_at", f.until);
    if (f.txHash) q = q.eq("tx_hash", f.txHash.toLowerCase());
    const { data, error } = await q;
    if (error) throw new Error(shopTableHint(error.message));
    return (data as PurchaseRow[]).map((r) => ({
      id: r.id, tokenId: r.token_id, itemId: r.item_id, price: Number(r.price), wallet: r.wallet, txHash: r.tx_hash, createdAt: Number(r.created_at),
    }));
  }
  const db = (await readFile()) as FileDB & FileShop;
  return (db.purchases ?? []).filter(
    (p) =>
      (!f.tokenId || p.tokenId === f.tokenId) &&
      (f.since === undefined || p.createdAt >= f.since) &&
      (f.until === undefined || p.createdAt <= f.until) &&
      (!f.txHash || p.txHash === f.txHash.toLowerCase()),
  );
}

/** Saves a purchase. Returns false if that payment was already used (each payment buys one item). */
export async function insertPurchase(p: Purchase): Promise<boolean> {
  const row: PurchaseRow = { id: p.id, token_id: p.tokenId, item_id: p.itemId, price: p.price, wallet: p.wallet, tx_hash: p.txHash.toLowerCase(), created_at: p.createdAt };
  if (usingSupabase) {
    const { error } = await supabase().from("purchases").insert(row);
    if (error && /duplicate|unique/i.test(error.message)) return false;
    if (error) throw new Error(shopTableHint(error.message));
    return true;
  }
  return withFile((db) => {
    const x = db as FileDB & FileShop;
    x.purchases ??= [];
    if (x.purchases.some((e) => e.txHash === row.tx_hash)) return false;
    x.purchases.push({ ...p, txHash: row.tx_hash });
    return true;
  });
}

export async function getLoadouts(tokenIds: string[]): Promise<Record<string, Loadout>> {
  if (!tokenIds.length) return {};
  if (usingSupabase) {
    const { data, error } = await supabase().from("loadouts").select("*").in("token_id", tokenIds);
    if (error) {
      // Before the database update, nobody wears anything yet. Don't break the page.
      if (/relation|does not exist|schema cache/i.test(error.message)) return {};
      throw new Error(`Database error: ${error.message}`);
    }
    const out: Record<string, Loadout> = {};
    for (const r of data as { token_id: string; title: string | null; frame: string | null; victory: string | null }[]) {
      out[r.token_id] = { ...(r.title ? { title: r.title } : {}), ...(r.frame ? { frame: r.frame } : {}), ...(r.victory ? { victory: r.victory } : {}) };
    }
    return out;
  }
  const db = (await readFile()) as FileDB & FileShop;
  return Object.fromEntries(tokenIds.filter((id) => db.loadouts?.[id]).map((id) => [id, db.loadouts![id]]));
}

export async function setLoadout(tokenId: string, l: Loadout): Promise<void> {
  if (usingSupabase) {
    const { error } = await supabase()
      .from("loadouts")
      .upsert({ token_id: tokenId, title: l.title ?? null, frame: l.frame ?? null, victory: l.victory ?? null, updated_at: Date.now() });
    if (error) throw new Error(shopTableHint(error.message));
    return;
  }
  await withFile((db) => {
    const x = db as FileDB & FileShop;
    (x.loadouts ??= {})[tokenId] = l;
  });
}

/** Prize payments, entered by the Chog League team (Supabase table "payouts"). */
export async function listPayouts(): Promise<Payout[]> {
  if (usingSupabase) {
    const { data, error } = await supabase().from("payouts").select("*").limit(500);
    if (error) return []; // table not created yet: just show "pending"
    return (data as { week: string; paid_tx: string | null; burn_tx: string | null }[]).map((r) => ({
      week: String(r.week).slice(0, 10),
      ...(r.paid_tx ? { paidTx: r.paid_tx.trim() } : {}),
      ...(r.burn_tx ? { burnTx: r.burn_tx.trim() } : {}),
    }));
  }
  const db = (await readFile()) as FileDB & FileShop;
  return db.payouts ?? [];
}

// ================================================================ Chip in + tips
type ChipRow = { id: string; wallet: string; amount: number; tx_hash: string; created_at: number };
type TipRow = { id: string; token_id: string; week: string; from_wallet: string; to_wallet: string; amount: number; tx_hash: string; created_at: number };

export async function listChipins(f: { since?: number; until?: number; txHash?: string } = {}): Promise<ChipIn[]> {
  if (usingSupabase) {
    let q = supabase().from("chipins").select("*").order("created_at", { ascending: true }).limit(5000);
    if (f.since !== undefined) q = q.gte("created_at", f.since);
    if (f.until !== undefined) q = q.lte("created_at", f.until);
    if (f.txHash) q = q.eq("tx_hash", f.txHash.toLowerCase());
    const { data, error } = await q;
    if (error) throw new Error(shopTableHint(error.message));
    return (data as ChipRow[]).map((r) => ({ id: r.id, wallet: r.wallet, amount: Number(r.amount), txHash: r.tx_hash, createdAt: Number(r.created_at) }));
  }
  const db = (await readFile()) as FileDB & FileShop;
  return (db.chipins ?? []).filter(
    (c) => (f.since === undefined || c.createdAt >= f.since) && (f.until === undefined || c.createdAt <= f.until) && (!f.txHash || c.txHash === f.txHash.toLowerCase()),
  );
}

export async function insertChipin(c: ChipIn): Promise<boolean> {
  const row: ChipRow = { id: c.id, wallet: c.wallet, amount: c.amount, tx_hash: c.txHash.toLowerCase(), created_at: c.createdAt };
  if (usingSupabase) {
    const { error } = await supabase().from("chipins").insert(row);
    if (error && /duplicate|unique/i.test(error.message)) return false;
    if (error) throw new Error(shopTableHint(error.message));
    return true;
  }
  return withFile((db) => {
    const x = db as FileDB & FileShop;
    x.chipins ??= [];
    if (x.chipins.some((e) => e.txHash === row.tx_hash)) return false;
    x.chipins.push({ ...c, txHash: row.tx_hash });
    return true;
  });
}

export async function listTips(f: { tokenId?: string; week?: string; txHash?: string } = {}): Promise<Tip[]> {
  if (usingSupabase) {
    let q = supabase().from("tips").select("*").order("created_at", { ascending: true }).limit(5000);
    if (f.tokenId) q = q.eq("token_id", f.tokenId);
    if (f.week) q = q.eq("week", f.week);
    if (f.txHash) q = q.eq("tx_hash", f.txHash.toLowerCase());
    const { data, error } = await q;
    if (error) throw new Error(shopTableHint(error.message));
    return (data as TipRow[]).map((r) => ({
      id: r.id, tokenId: r.token_id, week: r.week, from: r.from_wallet, to: r.to_wallet, amount: Number(r.amount), txHash: r.tx_hash, createdAt: Number(r.created_at),
    }));
  }
  const db = (await readFile()) as FileDB & FileShop;
  return (db.tips ?? []).filter((t) => (!f.tokenId || t.tokenId === f.tokenId) && (!f.week || t.week === f.week) && (!f.txHash || t.txHash === f.txHash.toLowerCase()));
}

export async function insertTip(t: Tip): Promise<boolean> {
  const row: TipRow = {
    id: t.id, token_id: t.tokenId, week: t.week, from_wallet: t.from, to_wallet: t.to, amount: t.amount, tx_hash: t.txHash.toLowerCase(), created_at: t.createdAt,
  };
  if (usingSupabase) {
    const { error } = await supabase().from("tips").insert(row);
    if (error && /duplicate|unique/i.test(error.message)) return false;
    if (error) throw new Error(shopTableHint(error.message));
    return true;
  }
  return withFile((db) => {
    const x = db as FileDB & FileShop;
    x.tips ??= [];
    if (x.tips.some((e) => e.txHash === row.tx_hash)) return false;
    x.tips.push({ ...t, txHash: row.tx_hash });
    return true;
  });
}

/** True if this payment was already used anywhere (shop, chip in or tip). One payment counts once. */
export async function paymentUsed(txHash: string): Promise<boolean> {
  const [p, c, t] = await Promise.all([
    listPurchases({ txHash }).catch(() => []),
    listChipins({ txHash }).catch(() => []),
    listTips({ txHash }).catch(() => []),
  ]);
  return p.length + c.length + t.length > 0;
}
