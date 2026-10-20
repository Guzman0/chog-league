"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChogData } from "@/lib/chog";
import { MARKETS, formatPrice, type Market, type Trade } from "@/lib/game";
import { POWERS } from "@/lib/identity";
import ShareCard from "./ShareCard";

type CallStats = { total: number; won: number; lost: number; hitRate: number | null; net: number; best: number | null; worst: number | null; favMarket: Market | null };
type DuelStats = { total: number; won: number; lost: number; draws: number; net: number };
type DuelItem = {
  id: string; at: number; format: string; arena: boolean; market: Market; stake: number;
  result: "won" | "lost" | "draw"; mine: number | null; theirs: number | null; reason: string | null;
  opponent: { tokenId: string; bot: boolean; name: string; image: string | null };
};

const money = (n: number) => {
  const a = Math.abs(n);
  return `${n < 0 ? "-" : n > 0 ? "+" : ""}$${a.toLocaleString(undefined, Number.isInteger(a) ? {} : { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const when = (ms: number) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

// "📜 History" on the Chog card: every finished call and duel this Chog has played.
export default function HistoryPanel({
  chog, mode, onClose, onOpenDuel,
}: {
  chog: ChogData;
  mode: "league" | "practice";
  onClose: () => void;
  onOpenDuel: (id: string) => void;
}) {
  const [kind, setKind] = useState<"calls" | "duels">("calls");
  const [view, setView] = useState(mode); // anyone can read the league record; practice is your own

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={`${chog.name} history`} onClick={onClose}>
      <div className="panel flex max-h-[92vh] w-full max-w-3xl flex-col !rounded-b-none !p-4 sm:!rounded-b-[1.4rem] sm:!p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-2xl leading-tight sm:text-3xl">📜 {chog.name} history</h3>
            <p className="text-xs text-[var(--muted)]">
              {view === "league" ? "League record. Saved to token " + chog.tokenId + ", so it stays with the Chog if it's sold." : "Your practice games with this Chog. They never count toward its record."}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost px-2.5 py-1 text-sm" aria-label="Close">✕</button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2" role="tablist">
          {(["calls", "duels"] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} onClick={() => setKind(k)} className={`btn flex-1 px-3 py-2 text-sm sm:flex-none sm:px-6 ${kind === k ? "btn-banana" : "btn-ghost"}`}>
              {k === "calls" ? "📈 Calls" : "⚔️ Duels"}
            </button>
          ))}
          <div className="ml-auto flex rounded-xl border-2 border-[var(--ink)] bg-[var(--panel-2)] p-0.5 text-xs" role="group" aria-label="Which record">
            {(["league", "practice"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`rounded-lg px-2.5 py-1 font-extrabold ${view === v ? "bg-[var(--banana)] text-[var(--ink)]" : ""}`}>
                {v === "league" ? "League" : "My practice"}
              </button>
            ))}
          </div>
        </div>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
          {kind === "calls" ? (
            <Calls key={view} tokenId={chog.tokenId} practice={view === "practice"} chogName={chog.name} />
          ) : (
            <Duels key={view} tokenId={chog.tokenId} practice={view === "practice"} onOpen={(id) => { onOpenDuel(id); onClose(); }} />
          )}
        </div>
      </div>
    </div>
  );
}

// Loads pages of history from /api/chog/<id>/history and keeps appending.
function usePaged<T, S>(url: string) {
  const [items, setItems] = useState<T[]>([]);
  const [stats, setStats] = useState<S | null>(null);
  const [next, setNext] = useState<number | null>(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor: number, reset = false) => {
      setBusy(true);
      setError(null);
      try {
        const r = await fetch(`${url}&cursor=${cursor}`, { cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setItems((old) => (reset ? d.items : [...old, ...d.items]));
        setStats(d.stats);
        setNext(d.next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load history");
      } finally {
        setBusy(false);
      }
    },
    [url],
  );

  useEffect(() => {
    setItems([]);
    load(0, true);
  }, [load]);

  return { items, stats, next, busy, error, more: () => next !== null && load(next) };
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="panel-flat !px-3 !py-2">
      <p className="text-[11px] font-black uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`display num text-xl ${tone === "good" ? "text-[var(--green)]" : tone === "bad" ? "text-[var(--red)]" : ""}`}>{value}</p>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`rounded-lg border-2 border-[var(--ink)] px-2.5 py-0.5 text-xs font-black ${on ? "bg-[var(--banana)] text-[var(--ink)]" : "bg-[var(--panel-2)]"}`}>
      {children}
    </button>
  );
}

function Calls({ tokenId, practice, chogName }: { tokenId: string; practice: boolean; chogName: string }) {
  const [result, setResult] = useState<"" | "won" | "lost">("");
  const [market, setMarket] = useState<"" | Market>("");
  const url = `/api/chog/${tokenId}/history?kind=calls${practice ? "&practice=1" : ""}${result ? `&result=${result}` : ""}${market ? `&market=${market}` : ""}`;
  const { items, stats, next, busy, error, more } = usePaged<Trade, CallStats>(url);

  return (
    <div>
      {stats && stats.total > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          <Tile label="Calls" value={String(stats.total)} />
          <Tile label="Hit rate" value={stats.hitRate === null ? "–" : `${stats.hitRate}%`} />
          <Tile label="Net" value={money(stats.net)} tone={stats.net > 0 ? "good" : stats.net < 0 ? "bad" : undefined} />
          <Tile label="Best win" value={stats.best === null ? "–" : money(stats.best)} tone="good" />
          <Tile label="Worst loss" value={stats.worst === null ? "–" : money(stats.worst)} tone="bad" />
          <Tile label="Fave market" value={stats.favMarket ?? "–"} />
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <Chip on={result === ""} onClick={() => setResult("")}>All</Chip>
        <Chip on={result === "won"} onClick={() => setResult("won")}>Wins</Chip>
        <Chip on={result === "lost"} onClick={() => setResult("lost")}>Losses</Chip>
        <span className="mx-1 h-4 w-0.5 bg-[var(--panel-2)]" aria-hidden="true" />
        <Chip on={market === ""} onClick={() => setMarket("")}>Any market</Chip>
        {MARKETS.map((m) => (
          <Chip key={m} on={market === m} onClick={() => setMarket(m)}>{m}</Chip>
        ))}
      </div>

      {error && <p className="text-sm font-extrabold text-[var(--red)]">{error}</p>}
      {!busy && !error && items.length === 0 && (
        <p className="py-6 text-center text-sm text-[var(--muted)]">
          {stats?.total ? "No calls match these filters." : "No finished calls yet. Make one on the Trade tab and it shows up here."}
        </p>
      )}
      <ul className="space-y-2">
        {items.map((t) => (
          <li key={t.id} className="panel-flat flex flex-wrap items-center justify-between gap-x-3 gap-y-1 !p-3 text-sm">
            <span className="min-w-0">
              <span className="mr-2 text-xs font-bold text-[var(--muted)]">{when(t.expiresAt)}</span>
              <b className={t.direction === "up" ? "text-[var(--green)]" : "text-[var(--red)]"}>{t.direction === "up" ? "▲" : "▼"} {t.market}</b>{" "}
              ${t.amount} at {t.multiplier}x
              <span className="block text-xs text-[var(--muted)] sm:inline">
                {" "}· target ${formatPrice(t.targetPrice)}, closed ${formatPrice(t.settlePrice ?? 0)}
                {t.power ? ` · ${POWERS[t.power].emoji} ${POWERS[t.power].name}` : ""}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <b className={t.status === "won" ? "text-[var(--green)]" : t.status === "lost" ? "text-[var(--red)]" : "text-[var(--muted)]"}>
                {t.status === "won" ? `Won ${money(t.pnl ?? 0)}` : t.status === "lost" ? `Lost ${money(Math.abs(t.pnl ?? t.amount)).slice(1)}` : "Push"}
              </b>
              <ShareCard trade={t} chogName={chogName} label="📸" />
            </span>
          </li>
        ))}
      </ul>
      {busy && <p className="py-4 text-center text-sm text-[var(--muted)]">Loading…</p>}
      {!busy && next !== null && (
        <button type="button" onClick={more} className="btn btn-ghost mx-auto mt-3 block px-5 py-2 text-sm">Load more</button>
      )}
    </div>
  );
}

function Duels({ tokenId, practice, onOpen }: { tokenId: string; practice: boolean; onOpen: (id: string) => void }) {
  const url = `/api/chog/${tokenId}/history?kind=duels${practice ? "&practice=1" : ""}`;
  const { items, stats, next, busy, error, more } = usePaged<DuelItem, DuelStats>(url);

  return (
    <div>
      {stats && stats.total > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
          <Tile label="Duels" value={String(stats.total)} />
          <Tile label="Won" value={String(stats.won)} tone="good" />
          <Tile label="Lost" value={String(stats.lost)} tone="bad" />
          <Tile label="Draws" value={String(stats.draws)} />
          <Tile label="Net stakes" value={money(stats.net)} tone={stats.net > 0 ? "good" : stats.net < 0 ? "bad" : undefined} />
        </div>
      )}
      {error && <p className="text-sm font-extrabold text-[var(--red)]">{error}</p>}
      {!busy && !error && items.length === 0 && (
        <p className="py-6 text-center text-sm text-[var(--muted)]">No finished duels yet. Challenge a Chog on the Duel tab.</p>
      )}
      <ul className="space-y-2">
        {items.map((d) => (
          <li key={d.id}>
            <button type="button" onClick={() => onOpen(d.id)} className="panel-flat flex w-full items-center gap-3 !p-3 text-left text-sm transition hover:brightness-110" title="Open this duel">
              <span className="h-11 w-11 shrink-0 overflow-hidden rounded-xl border-2 border-[var(--ink)] bg-[var(--panel-2)] text-center text-2xl leading-[2.4rem]">
                {d.opponent.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={d.opponent.image} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden="true">{d.opponent.bot ? "🤖" : "🐾"}</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-extrabold">
                  vs {d.opponent.name}
                  {!d.opponent.bot && <span className="font-semibold text-[var(--muted)]"> · token {d.opponent.tokenId}</span>}
                </span>
                <span className="block text-xs text-[var(--muted)]">
                  {when(d.at)} · {d.format} · {d.market} · ${d.stake} each
                  {d.mine !== null && d.theirs !== null && (d.arena ? ` · $${Math.round(d.mine).toLocaleString()} vs $${Math.round(d.theirs).toLocaleString()}` : ` · ${d.mine}–${d.theirs}`)}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-lg border-2 border-[var(--ink)] px-2 py-0.5 text-xs font-black text-[var(--ink)] ${d.result === "won" ? "bg-[var(--green)]" : d.result === "lost" ? "bg-[var(--red)]" : "bg-[var(--sky)]"}`}
              >
                {d.result === "won" ? `WON +$${d.stake}` : d.result === "lost" ? `LOST -$${d.stake}` : "DRAW"}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {busy && <p className="py-4 text-center text-sm text-[var(--muted)]">Loading…</p>}
      {!busy && next !== null && (
        <button type="button" onClick={more} className="btn btn-ghost mx-auto mt-3 block px-5 py-2 text-sm">Load more</button>
      )}
    </div>
  );
}
