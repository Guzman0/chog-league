"use client";

import { useEffect, useRef, useState } from "react";
import type { ChogData } from "@/lib/chog";
import type { ChogSummary } from "@/lib/game";
import { fetchChog } from "./MyChogs";

type Board = { resetsAt: number; rows: ChogSummary[] };
export type Champion = { weekStart: number; tokenId: string; balance: number; wins: number; losses: number; players: number };

// Past weekly winners (newest first). Loaded once; finished weeks don't change.
export function useChampions() {
  const [champions, set] = useState<Champion[] | null>(null);
  useEffect(() => {
    fetch("/api/champions", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => set(d?.champions ?? []))
      .catch(() => set([]));
  }, []);
  return champions;
}

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
  const [names, setNames] = useState<Record<string, ChogData>>({});

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
    [...(board?.rows.map((r) => r.tokenId) ?? []), ...(champions?.map((c) => c.tokenId) ?? [])].forEach((id) => {
      if (requested.current.has(id)) return;
      requested.current.add(id);
      fetchChog(id).then((c) => setNames((n) => ({ ...n, [id]: c }))).catch(() => {});
    });
  }, [board, champions]);

  const left = useCountdown(board?.resetsAt ?? null);
  const reigning = champions?.[0];

  return (
    <section className="panel">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-2xl">This week&apos;s league</h3>
          <p className="text-xs font-extrabold text-[var(--muted)]">Highest demo balance at the reset wears the crown. Everyone restarts at $1,000.</p>
        </div>
        <div className="rounded-xl border-2 border-[var(--ink)] bg-[var(--panel-2)] px-3 py-1 text-right">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--muted)]">Crown decided in</p>
          <p className="display num text-xl text-[var(--banana)]" aria-live="off">{left ?? "…"}</p>
        </div>
      </div>
      {!board ? (
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
                  {c?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt="" className="h-10 w-10 rounded-lg border-2 border-[var(--ink)] object-cover" />
                  ) : (
                    <span className="h-10 w-10 rounded-lg border-2 border-[var(--ink)] bg-[var(--line)]" />
                  )}
                  <span className="flex-1">
                    <b>{c?.name ?? `Token ${r.tokenId}`}</b>
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
            {champions.length > 1 && (
              <ol className="space-y-1.5 text-sm">
                {champions.slice(1).map((c) => (
                  <li key={c.weekStart}>
                    <button type="button" onClick={() => names[c.tokenId] && onSelect(names[c.tokenId])} className="panel-flat flex w-full items-center justify-between gap-2 px-3 py-2 text-left">
                      <span><span className="text-[var(--muted)]">Week of {weekLabel(c.weekStart)}</span> · <b>{names[c.tokenId]?.name ?? `Token ${c.tokenId}`}</b></span>
                      <span className="num font-black text-[var(--banana)]">${c.balance.toLocaleString()}</span>
                    </button>
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
