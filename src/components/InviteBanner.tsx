"use client";

import { useEffect, useState } from "react";
import { FORMATS } from "@/lib/duels";
import type { ChogData } from "@/lib/chog";
import ChogAvatar from "./ChogAvatar";
import { fetchChog } from "./MyChogs";
import { duelAction, type MyDuel } from "./useDuels";

// Pops up when someone challenges you.
export default function InviteBanner({ invites, onChanged }: { invites: MyDuel[]; onChanged: () => void }) {
  const d = invites[0];
  const [from, setFrom] = useState<ChogData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setFrom(null);
    setErr(null);
    if (d) fetchChog(d.challengerToken).then(setFrom).catch(() => {});
  }, [d?.id, d?.challengerToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!d) return null;
  const left = Math.max(0, Math.ceil((d.createdAt + 60000 - now) / 1000));

  async function answer(action: "accept" | "decline") {
    setErr(null);
    try {
      await duelAction(d.id, { action });
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-4 z-50 mx-auto w-[min(92vw,560px)] rounded-2xl border-2 border-[var(--purple)] bg-[var(--panel)] p-4 shadow-2xl">
      <div className="flex items-center gap-3">
        <div className="h-14 w-14 shrink-0">
          <ChogAvatar image={from?.image ?? null} name={from?.name ?? ""} size="sm" />
        </div>
        <div className="flex-1 text-sm">
          <p className="font-bold">⚔️ {from?.name ?? "A Chog"} challenges you!</p>
          <p className="text-[var(--muted)]">
            {FORMATS[d.format].label}{FORMATS[d.format].kind === "rounds" ? ` on ${d.market}` : ""} · stake ${d.stake} each · winner takes ${d.stake * 2}
          </p>
          <p className="text-xs text-[var(--muted)]">{d.mode === "league" ? "League duel" : "Practice duel"} · {left}s to answer</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => answer("accept")} className="rounded-lg bg-[var(--green)] py-2 font-bold text-black">Accept</button>
        <button onClick={() => answer("decline")} className="rounded-lg border border-[var(--line)] py-2">Decline</button>
      </div>
      {err && <p className="mt-2 text-sm text-[var(--red)]">{err}</p>}
    </div>
  );
}
