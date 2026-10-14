"use client";

import { useEffect, useRef, useState } from "react";
import type { ChogData } from "@/lib/chog";
import type { ChogSummary } from "@/lib/game";
import { fetchChog } from "./MyChogs";

type Board = { resetsAt: number; rows: ChogSummary[] };

export default function Leaderboard({ onSelect, refreshKey, onLeader }: { onSelect: (c: ChogData) => void; refreshKey: number; onLeader?: (tokenId: string | null) => void }) {
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
    board?.rows.forEach((r) => {
      if (requested.current.has(r.tokenId)) return;
      requested.current.add(r.tokenId);
      fetchChog(r.tokenId).then((c) => setNames((n) => ({ ...n, [r.tokenId]: c }))).catch(() => {});
    });
  }, [board]);

  const daysLeft = board ? Math.max(0, Math.ceil((board.resetsAt - Date.now()) / 86400000)) : null;

  return (
    <section className="panel">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-2xl">This week&apos;s league</h3>
        {daysLeft !== null && <p className="text-xs font-extrabold text-[var(--muted)]">Resets in {daysLeft} day{daysLeft === 1 ? "" : "s"}. Everyone starts at $1,000.</p>}
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
    </section>
  );
}
