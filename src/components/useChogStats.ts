"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChogSummary, Trade } from "@/lib/game";

export type ChogStats = { summary: ChogSummary; open: Trade[]; history: Trade[]; now: number; duels?: { wins: number; losses: number; draws: number } | null };

// Loads a Chog's record (or your practice record with it) and keeps it fresh.
// Polls faster while a trade is close to settling so results appear quickly.
export function useChogStats(tokenId: string | undefined, practice = false) {
  const [stats, setStats] = useState<ChogStats | null>(null);

  const refresh = useCallback(async () => {
    if (!tokenId) return;
    const res = await fetch(`/api/chog/${tokenId}/stats${practice ? "?practice=1" : ""}`, { cache: "no-store" });
    if (res.ok) setStats(await res.json());
  }, [tokenId, practice]);

  useEffect(() => {
    setStats(null);
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!tokenId) return;
    const soon = stats?.open.some((t) => t.expiresAt - Date.now() < 15000);
    const id = setInterval(refresh, soon ? 3000 : 15000);
    return () => clearInterval(id);
  }, [tokenId, stats, refresh]);

  return { stats, refresh };
}
