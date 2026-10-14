"use client";

import { useCallback, useEffect, useState } from "react";
import type { Duel, Side } from "@/lib/duels";

export type MyDuel = Duel & { side: Side };

// Your duels: incoming invites, waiting challenges, the live duel and recent results.
export function useDuels(enabled: boolean) {
  const [duels, setDuels] = useState<MyDuel[]>([]);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/duels", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setDuels((await r.json()).duels);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
    const id = setInterval(refresh, 3000);
    return () => clearInterval(id);
  }, [enabled, refresh]);

  return {
    duels,
    refresh,
    invites: duels.filter((d) => d.status === "pending" && d.side === "opponent"),
    outgoing: duels.filter((d) => d.status === "pending" && d.side === "challenger"),
    active: duels.find((d) => d.status === "active") ?? null,
  };
}

// Tells the lobby you're online with this Chog, every 15 seconds.
export function usePresence(chog: { tokenId: string; name: string; image: string | null } | null, mode: "league" | "practice", enabled: boolean) {
  useEffect(() => {
    if (!enabled || !chog) return;
    const beat = () =>
      fetch("/api/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenId: chog.tokenId, mode, name: chog.name, image: chog.image }),
      }).catch(() => {});
    beat();
    const id = setInterval(beat, 15000);
    return () => clearInterval(id);
  }, [chog, mode, enabled]);
}

export async function duelAction(id: string, body: Record<string, unknown>) {
  const r = await fetch(`/api/duels/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || "Something went wrong");
  return d;
}
