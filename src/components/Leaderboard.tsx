"use client";

import { useEffect, useRef, useState } from "react";
import type { ChogData } from "@/lib/chog";
import type { ChogSummary } from "@/lib/game";
import { fetchChog } from "./MyChogs";
import { Framed, ChogTitle, useLoadouts } from "./Cosmetics";
import { usePot } from "./useShop";
import { ChipIn, TipChampion } from "./Support";
import { fmtChog, txUrl } from "@/lib/shop";
import { short } from "./WalletButton";

type Board = { resetsAt: number; rows: ChogSummary[] };
type PracticeRow = { tokenId: string; player: string; isMe: boolean; weekBalance: number; wins: number; losses: number };
type PracticeBoard = { rows: PracticeRow[]; players: number; minCalls: number; me: (PracticeRow & { rank: number }) | null };
export type Champion = {
  weekStart: number; tokenId: string; balance: number; wins: number; losses: number; players: number;
  prize: number; burn: number; chips: number; paidTx?: string; burnTx?: string; owner?: string;
  tipTotal?: number; tippers?: number;
};

// Past weekly winners (newest first). Loaded once; finished weeks don't change.
export function useChampions() {
  const [champions, set] = useState<Champion[] | null>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/champions", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => set(d?.champions ?? []))
        .catch(() => set((c) => c ?? []));
    load();
    // A tip was sent: show the new total.
    window.addEventListener("chog:champions", load);
    return () => window.removeEventListener("chog:champions", load);
  }, []);
  return champions;
}
const reloadChampions = () => window.dispatchEvent(new Event("chog:champions"));

export const crownsFor = (champions: Champion[] | null, tokenId: string) => champions?.filter((c) => c.tokenId === tokenId).length ?? 0;

// "2d 04:12:09" until the Monday reset, ticking every second.
function useCountdown(to: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (to === null) return null;
  const s = Math.max(0, Math.floor((to - now) / 1000));
  const d = Math.floor(s / 86400);
  const hms = [Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, "0")).join(":");
  return d > 0 ? `${d}d ${hms}` : hms;
}

const weekLabel = (ms: number) => new Date(ms).toLocaleDateString([], { day: "numeric", month: "short", timeZone: "UTC" });

export default function Leaderboard({
  onSelect, refreshKey, onLeader, champions,
}: { onSelect: (c: ChogData) => void; refreshKey: number; onLeader?: (tokenId: string | null) => void; champions: Champion[] | null }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [practice, setPractice] = useState<PracticeBoard | null>(null);
  const [view, setView] = useState<"league" | "practice">("league");
  const picked = useRef(false); // once someone picks a view, don't switch it for them
  const [names, setNames] = useState<Record<string, ChogData>>({});

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/leaderboard/practice", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => alive && Array.isArray(d.rows) && setPractice(d))
        .catch(() => {});
    load();
    const id = setInterval(load, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshKey]);

  // While nobody has played the league this week, open on the practice board.
  useEffect(() => {
    if (picked.current || !board || !practice) return;
    if (board.rows.length === 0 && practice.rows.length > 0) setView("practice");
  }, [board, practice]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/leaderboard", { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setBoard(d);
          onLeader?.(d.rows?.[0]?.tokenId ?? null);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const requested = useRef(new Set<string>());
  useEffect(() => {
    [...(board?.rows.map((r) => r.tokenId) ?? []), ...(practice?.rows.map((r) => r.tokenId) ?? []), ...(champions?.map((c) => c.tokenId) ?? [])].forEach((id) => {
      if (requested.current.has(id)) return;
      requested.current.add(id);
      fetchChog(id).then((c) => setNames((n) => ({ ...n, [id]: c }))).catch(() => {});
    });
  }, [board, practice, champions]);

  const left = useCountdown(board?.resetsAt ?? null);
  const reigning = champions?.[0];
  const [potKey, setPotKey] = useState(0);
  const pot = usePot(refreshKey + potKey);
  const looks = useLoadouts([...(board?.rows.map((r) => r.tokenId) ?? []), ...(champions?.map((c) => c.tokenId) ?? [])], refreshKey);

  return (
    <section className="panel">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-2xl">{view === "league" ? "This week\u2019s league" : "This week\u2019s practice board"}</h3>
          <p className="text-xs font-extrabold text-[var(--muted)]">
            {view === "league"
              ? "Chog holders only. Highest demo balance at the reset wears the crown and wins the $CHOG prize. Everyone restarts at $1,000."
              : "Just for fun: no crown and no prize. The $CHOG prize is only for Chog holders in the league."}
          </p>
        </div>
        <div className="rounded-xl border-2 border-[var(--ink)] bg-[var(--panel-2)] px-3 py-1 text-right">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--muted)]">{view === "league" ? "Crown decided in" : "Resets in"}</p>
          <p className="display num text-xl text-[var(--banana)]" aria-live="off">{left ?? "…"}</p>
        </div>
      </div>
      <div className="mb-3 flex rounded-xl border-2 border-[var(--ink)] bg-[var(--panel-2)] p-0.5 text-sm" role="tablist" aria-label="Which board">
        {(["league", "practice"] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            onClick={() => {
              picked.current = true;
              setView(v);
            }}
            className={`flex-1 rounded-lg px-3 py-1.5 font-extrabold ${view === v ? "bg-[var(--banana)] text-[var(--ink)]" : ""}`}
          >
            {v === "league" ? `👑 League${board ? ` (${board.rows.length})` : ""}` : `🎲 Practice${practice ? ` (${practice.players})` : ""}`}
          </button>
        ))}
      </div>
      {view === "league" && (
      <div className="panel-flat mb-3 flex items-center gap-3 bg-[var(--banana)] p-3 text-[var(--ink)]">
        <span className="text-3xl" aria-hidden="true">🏆</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-black uppercase tracking-wide">This week&apos;s prize for the league&apos;s #1 Chog holder, in real $CHOG</span>
          <b className="display num block text-2xl">{pot ? fmtChog(pot.prize) : "…"}</b>
          <span className="block text-xs font-extrabold">
            {pot && (pot.sales > 0 || pot.chips > 0)
              ? [fmtChog(pot.base), pot.prize - pot.base - pot.chips > 0 && `${fmtChog(pot.prize - pot.base - pot.chips)} from the shop`, pot.chips > 0 && `${fmtChog(pot.chips)} chipped in`].filter(Boolean).join(" + ")
              : "Grows with every Shop purchase (70% to the prize, 30% burned) and every chip in"}
          </span>
          <ChipIn topChippers={pot?.topChippers} onDone={() => setPotKey((k) => k + 1)} />
        </span>
      </div>
      )}
      {view === "practice" ? (
        <PracticeList board={practice} names={names} onSelect={onSelect} />
      ) : !board ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : board.rows.length === 0 ? (
        <p className="panel-flat p-4 text-center text-sm text-[var(--muted)]">Nobody has played the league this week yet. The first Chog to make a call takes the crown 👑</p>
      ) : (
        <ol className="space-y-2">
          {board.rows.map((r, i) => {
            const c = names[r.tokenId];
            return (
              <li key={r.tokenId}>
                <button onClick={() => c && onSelect(c)} className={`panel-flat flex w-full items-center gap-3 p-2 text-left text-sm ${i === 0 ? "bg-[var(--banana)] text-[var(--ink)]" : ""}`}>
                  <span className="display w-7 text-center text-xl">{i === 0 ? "👑" : i + 1}</span>
                  <Framed frame={looks[r.tokenId]?.frame} small>
                    {c?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.image} alt="" className="block h-10 w-10 rounded-lg border-2 border-[var(--ink)] object-cover" />
                    ) : (
                      <span className="block h-10 w-10 rounded-lg border-2 border-[var(--ink)] bg-[var(--line)]" />
                    )}
                  </Framed>
                  <span className="min-w-0 flex-1">
                    <b>{c?.name ?? `Token ${r.tokenId}`}</b> <ChogTitle id={looks[r.tokenId]?.title} small />
                    <span className={`block text-xs ${i === 0 ? "" : "text-[var(--muted)]"}`}>Level {r.level.level}, {r.wins} won, {r.losses} lost</span>
                  </span>
                  <span className={`display num text-xl ${i === 0 ? "" : r.weekBalance >= 1000 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>${r.weekBalance.toLocaleString()}</span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
      <div className="mt-6">
        <h3 className="mb-1 text-2xl">Hall of Champions</h3>
        {!champions ? (
          <p className="text-sm text-[var(--muted)]">Loading…</p>
        ) : !reigning ? (
          <p className="panel-flat p-4 text-center text-sm text-[var(--muted)]">
            No champion yet. The first crown is handed out when this week ends. It could be yours. 👑
          </p>
        ) : (
          <>
            <button type="button" onClick={() => names[reigning.tokenId] && onSelect(names[reigning.tokenId])} className="panel-flat mb-3 flex w-full items-center gap-4 bg-[var(--banana)] p-3 text-left text-[var(--ink)]">
              <span className="relative shrink-0">
                {names[reigning.tokenId]?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={names[reigning.tokenId]!.image!} alt="" className="h-16 w-16 rounded-xl border-2 border-[var(--ink)] object-cover" />
                ) : (
                  <span className="block h-16 w-16 rounded-xl border-2 border-[var(--ink)] bg-[var(--line)]" />
                )}
                <span className="absolute -right-2 -top-3 rotate-12 text-2xl" aria-hidden="true">👑</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-black uppercase tracking-wide">Reigning champion · week of {weekLabel(reigning.weekStart)}</span>
                <b className="display block truncate text-xl">{names[reigning.tokenId]?.name ?? `Token ${reigning.tokenId}`}</b>
                <span className="block text-xs font-extrabold">
                  Finished on ${reigning.balance.toLocaleString()} · {reigning.wins} won, {reigning.losses} lost · beat {reigning.players - 1} other Chog{reigning.players === 2 ? "" : "s"}
                </span>
              </span>
              <span className="display text-sm">View ›</span>
            </button>
            <PrizeLine c={reigning} />
            <TipChampion tokenId={reigning.tokenId} owner={reigning.owner} tipTotal={reigning.tipTotal} tippers={reigning.tippers} onDone={reloadChampions} />
            {champions.length > 1 && (
              <ol className="mt-3 space-y-1.5 text-sm">
                {champions.slice(1).map((c) => (
                  <li key={c.weekStart}>
                    <div className="panel-flat px-3 py-2">
                      <button type="button" onClick={() => names[c.tokenId] && onSelect(names[c.tokenId])} className="flex w-full items-center justify-between gap-2 text-left">
                        <span><span className="text-[var(--muted)]">Week of {weekLabel(c.weekStart)}</span> · <b>{names[c.tokenId]?.name ?? `Token ${c.tokenId}`}</b></span>
                        <span className="num font-black text-[var(--banana)]">${c.balance.toLocaleString()}</span>
                      </button>
                      <PrizeLine c={c} compact />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </div>
    </section>
  );
}

// The $CHOG prize for a finished week, with links to prove it was paid and burned.
function PrizeLine({ c, compact = false }: { c: Champion; compact?: boolean }) {
  const link = (href: string, label: string) => (
    <a href={txUrl(href)} target="_blank" rel="noreferrer" className="rounded-md border-2 border-[var(--ink)] bg-[var(--green)] px-1.5 font-black text-[var(--ink)] hover:brightness-110">
      {label} ↗
    </a>
  );
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-extrabold ${compact ? "mt-1" : ""}`}>
      <span>🏆 Prize {fmtChog(c.prize)}</span>
      {c.paidTx ? link(c.paidTx, "Paid ✓") : <span className="text-[var(--muted)]">Payment pending{c.owner ? ` to ${short(c.owner)}` : ""}</span>}
      {c.burn > 0 && (c.burnTx ? link(c.burnTx, `${fmtChog(c.burn)} burned ✓`) : <span className="text-[var(--muted)]">{fmtChog(c.burn)} to burn</span>)}
    </p>
  );
}

// The practice board: anyone, any Chog, no wallet. Just for fun.
function PracticeList({ board, names, onSelect }: { board: PracticeBoard | null; names: Record<string, ChogData>; onSelect: (c: ChogData) => void }) {
  if (!board) return <p className="text-sm text-[var(--muted)]">Loading…</p>;
  const row = (r: PracticeRow, rank: number) => {
    const c = names[r.tokenId];
    return (
      <li key={`${r.player}-${r.tokenId}`}>
        <button onClick={() => c && onSelect(c)} className={`panel-flat flex w-full items-center gap-3 p-2 text-left text-sm ${r.isMe ? "outline outline-2 outline-[var(--banana)]" : ""}`}>
          <span className="display w-7 text-center text-xl">{rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}</span>
          {c?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.image} alt="" className="block h-10 w-10 rounded-lg border-2 border-[var(--ink)] object-cover" />
          ) : (
            <span className="block h-10 w-10 rounded-lg border-2 border-[var(--ink)] bg-[var(--line)]" />
          )}
          <span className="min-w-0 flex-1">
            <b>{r.player}</b>
            {r.isMe && <span className="ml-1.5 rounded-md border-2 border-[var(--ink)] bg-[var(--banana)] px-1 text-[11px] font-black text-[var(--ink)]">YOU</span>}
            <span className="block text-xs text-[var(--muted)]">
              with {c?.name ?? `Token ${r.tokenId}`} · {r.wins} won, {r.losses} lost
            </span>
          </span>
          <span className={`display num text-xl ${r.weekBalance >= 1000 ? "text-[var(--green)]" : "text-[var(--red)]"}`}>${r.weekBalance.toLocaleString()}</span>
        </button>
      </li>
    );
  };
  return (
    <div>
      <p className="mb-2 text-xs font-extrabold text-[var(--muted)]">
        Anyone can play Practice with any Chog, no wallet needed. It never counts toward a Chog&apos;s record. You show up after {board.minCalls} finished calls this week. Resets Monday 00:00 UTC.
      </p>
      {board.rows.length === 0 ? (
        <p className="panel-flat p-4 text-center text-sm text-[var(--muted)]">Nobody&apos;s on the practice board yet this week. Tap &quot;🎲 Play with a random Chog&quot; and make {board.minCalls} calls to be first.</p>
      ) : (
        <ol className="space-y-2">
          {board.rows.map((r, i) => row(r, i + 1))}
          {board.me && (
            <>
              <li className="text-center text-xs text-[var(--muted)]" aria-hidden="true">⋯</li>
              {row(board.me, board.me.rank)}
            </>
          )}
        </ol>
      )}
    </div>
  );
}
