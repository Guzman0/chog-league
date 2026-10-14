"use client";

import { useEffect, useState } from "react";
import type { ChogData } from "@/lib/chog";
import ChogAvatar from "./ChogAvatar";

export async function fetchChog(id: string): Promise<ChogData> {
  const res = await fetch(`/api/chog/${id}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

export default function MyChogs({ address, selectedId, onSelect, leaderId }: { address: string; selectedId?: string; onSelect: (c: ChogData) => void; leaderId?: string | null }) {
  const [chogs, setChogs] = useState<ChogData[] | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    setChogs(null);
    setStatus("Finding your Chogs… (the first check can take up to a minute)");
    (async () => {
      try {
        const res = await fetch(`/api/owned/${address}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const ids: string[] = data.tokenIds;
        if (cancelled) return;
        if (ids.length === 0) return setChogs([]);
        setStatus(`Loading ${ids.length} Chog${ids.length > 1 ? "s" : ""}…`);
        const loaded = await Promise.all(ids.map((id) => fetchChog(id).catch(() => null)));
        if (cancelled) return;
        const list = loaded.filter((c): c is ChogData => c !== null);
        setChogs(list);
        if (list.length === 1) onSelect(list[0]);
      } catch (e) {
        if (!cancelled) setStatus(e instanceof Error ? e.message : "Couldn't load your Chogs");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  return (
    <section className="mb-5">
      <p className="label">Your Chogs</p>
      {chogs === null ? (
        <p className="text-sm text-[var(--muted)]">{status}</p>
      ) : chogs.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No Chogs in this wallet. Practice with a random one below, or open any Chog to spectate.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {chogs.map((c) => (
            <button
              key={c.tokenId}
              onClick={() => onSelect(c)}
              className={`rounded-2xl p-1 text-left ${selectedId === c.tokenId ? "bg-[var(--banana)] text-[var(--ink)]" : ""}`}
            >
              <ChogAvatar image={c.image} name={c.name} size="sm" crowned={leaderId === c.tokenId} />
              <p className="truncate px-1 pt-1 text-xs font-extrabold">{c.name}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
