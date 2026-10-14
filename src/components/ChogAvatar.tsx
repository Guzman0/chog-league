"use client";

import { useEffect, useRef, useState } from "react";
import type { Trade } from "@/lib/game";
import { play } from "@/lib/sound";

export type Reaction = { kind: "win" | "lose"; text: string; key: string } | null;

const WIN_LINES = ["LFG!", "Called it 😎", "Too easy", "Chog print go brrr", "WAGMI"];
const LOSE_LINES = ["rekt…", "ngmi?", "that hurt", "fwog told me to", "next one"];

function pick<T>(list: T[], seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

// Fires a reaction whenever a new settled trade shows up (not on first load).
export function useReaction(lastSettled: Trade | undefined): Reaction {
  const seen = useRef<string | null | undefined>(undefined);
  const [reaction, setReaction] = useState<Reaction>(null);

  useEffect(() => {
    const id = lastSettled?.id ?? null;
    if (seen.current === undefined) {
      seen.current = id; // first load: remember, don't celebrate old trades
      return;
    }
    if (!lastSettled || id === seen.current || lastSettled.status === "push") {
      seen.current = id;
      return;
    }
    seen.current = id;
    const win = lastSettled.status === "won";
    play(win ? "win" : "lose");
    setReaction({
      kind: win ? "win" : "lose",
      text: win ? `${pick(WIN_LINES, lastSettled.id)} +$${lastSettled.pnl}` : `${pick(LOSE_LINES, lastSettled.id)} -$${lastSettled.amount}`,
      key: lastSettled.id,
    });
    const t = setTimeout(() => setReaction(null), 3500);
    return () => clearTimeout(t);
  }, [lastSettled]);

  return reaction;
}

// The Chog's picture, with its reactions drawn on top.
export default function ChogAvatar({
  image, name, crowned = false, streak = 0, reaction = null, size = "lg",
}: {
  image: string | null;
  name: string;
  crowned?: boolean;
  streak?: number;
  reaction?: Reaction;
  size?: "lg" | "md" | "sm";
}) {
  const anim = reaction?.kind === "win" ? "chog-bounce" : reaction?.kind === "lose" ? "chog-shake" : "";
  const big = size !== "sm";

  return (
    <div className={`relative ${big ? "" : "h-full w-full"}`}>
      <div key={reaction?.key ?? "idle"} className={`${anim} ${streak >= 3 ? "chog-fire" : ""} ${streak <= -3 ? "chog-frost" : ""} overflow-hidden rounded-2xl border-[3px] border-[var(--ink)]`}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={name} className={`w-full ${big ? "" : "aspect-square object-cover"} ${reaction?.kind === "lose" ? "chog-grey" : ""}`} />
        ) : (
          <div className="flex aspect-square items-center justify-center bg-[var(--line)] text-[var(--muted)]">No image</div>
        )}
      </div>

      {crowned && (
        <span className={`chog-crown pointer-events-none absolute left-1/2 ${size === "lg" ? "-top-7 text-5xl" : size === "md" ? "-top-6 text-4xl" : "-top-3 text-xl"}`} title="#1 in this week's league">👑</span>
      )}

      {big && streak >= 3 && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-sm">🔥 {streak}</span>}
      {big && streak <= -3 && <span className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-sm">🥶 {-streak}</span>}

      {reaction && big && (
        <>
          <div key={`b-${reaction.key}`} className={`chog-pop absolute left-1/2 top-4 whitespace-nowrap rounded-full px-4 py-1.5 text-lg font-extrabold text-black shadow-lg ${reaction.kind === "win" ? "bg-[var(--green)]" : "bg-[var(--red)]"}`}>
            {reaction.text}
          </div>
          {reaction.kind === "win" && <Confetti seed={reaction.key} />}
          {reaction.kind === "lose" && <span className="chog-tear pointer-events-none absolute left-[38%] top-[45%] text-3xl">💧</span>}
        </>
      )}
    </div>
  );
}

function Confetti({ seed }: { seed: string }) {
  const bits = ["🎉", "✨", "💜", "🟣", "⭐", "🚀"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {Array.from({ length: 16 }, (_, i) => {
        const r = (n: number) => ((seed.charCodeAt(i % seed.length) * (i + 3) * n) % 100) / 100;
        return (
          <span
            key={i}
            className="chog-confetti absolute text-xl"
            style={{ left: `${r(7) * 100}%`, animationDelay: `${r(13) * 0.5}s`, animationDuration: `${1.4 + r(17)}s` }}
          >
            {bits[i % bits.length]}
          </span>
        );
      })}
    </div>
  );
}
