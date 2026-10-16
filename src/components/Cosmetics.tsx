"use client";

// How shop items look: frames around the picture, a title sticker, and the
// victory animations. Looks only: nothing here touches the game.
import { useEffect, useRef, useState } from "react";
import { itemById, type Loadout } from "@/lib/shop";

/** A frame around a Chog picture (or just the picture if no frame). */
export function Framed({ frame, small = false, children }: { frame?: string; small?: boolean; children: React.ReactNode }) {
  if (!frame || !itemById(frame)) return <>{children}</>;
  return (
    <div className={`${frame === "frame-gold" ? "frame-gold" : "frame-neon"} ${small ? "rounded-[11px] p-[3px]" : "rounded-[22px] p-[6px]"}`} title={itemById(frame)!.name}>
      {children}
    </div>
  );
}

/** The Chog's title sticker, e.g. "🌙 Moon Caller". */
export function ChogTitle({ id, small = false }: { id?: string; small?: boolean }) {
  const item = itemById(id);
  if (!item) return null;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-lg border-2 border-[var(--ink)] bg-[var(--pink)] font-black text-[var(--ink)] ${small ? "px-1.5 text-[10px] leading-4" : "-rotate-1 px-2 py-0.5 text-xs"}`}
      title="Chog title, from the $CHOG shop"
    >
      {item.emoji} {item.name}
    </span>
  );
}

/** Plays over the picture when a call wins. Default = confetti. */
export function VictoryFx({ victory, seed }: { victory?: string; seed: string }) {
  if (victory === "win-fireworks") return <Fireworks seed={seed} />;
  if (victory === "win-rocket") return <Rocket />;
  return <Confetti seed={seed} />;
}

const rnd = (seed: string, i: number, n: number) => ((seed.charCodeAt(i % seed.length) * (i + 3) * n) % 100) / 100;

function Confetti({ seed }: { seed: string }) {
  const bits = ["🎉", "✨", "💜", "🟣", "⭐", "🚀"];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {Array.from({ length: 16 }, (_, i) => (
        <span
          key={i}
          className="chog-confetti absolute text-xl"
          style={{ left: `${rnd(seed, i, 7) * 100}%`, animationDelay: `${rnd(seed, i, 13) * 0.5}s`, animationDuration: `${1.4 + rnd(seed, i, 17)}s` }}
        >
          {bits[i % bits.length]}
        </span>
      ))}
    </div>
  );
}

// Three bursts of sparks, one after another.
function Fireworks({ seed }: { seed: string }) {
  const bursts = [
    { x: 28, y: 30, color: "#ffd84d", delay: 0 },
    { x: 72, y: 24, color: "#ff7ac6", delay: 0.35 },
    { x: 50, y: 52, color: "#4fe3a1", delay: 0.7 },
    { x: 30, y: 62, color: "#8b74ff", delay: 1.05 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {bursts.map((b, k) =>
        Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2 + rnd(seed, k, 3);
          const r = 55 + rnd(seed, i + k, 11) * 30;
          return (
            <span
              key={`${k}-${i}`}
              className="chog-spark absolute h-3 w-3 rounded-full"
              style={{
                left: `${b.x}%`, top: `${b.y}%`, background: b.color, boxShadow: `0 0 8px ${b.color}`,
                ["--dx" as string]: `${Math.cos(a) * r}px`, ["--dy" as string]: `${Math.sin(a) * r}px`,
                animationDelay: `${b.delay}s`,
              }}
            />
          );
        }),
      )}
      {bursts.map((b, k) => (
        <span key={`f${k}`} className="chog-flash absolute text-3xl" style={{ left: `${b.x}%`, top: `${b.y}%`, animationDelay: `${b.delay}s` }}>✨</span>
      ))}
    </div>
  );
}

// A rocket blasts off from the bottom, with a trail of smoke.
function Rocket() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      <span className="chog-rocket absolute bottom-0 left-1/2 text-5xl">🚀</span>
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className="chog-smoke absolute bottom-0 text-2xl" style={{ left: `${38 + i * 6}%`, animationDelay: `${0.1 + i * 0.12}s` }}>💨</span>
      ))}
    </div>
  );
}

/** What a few Chogs are wearing, for lists (leaderboard, Hall of Champions). */
export function useLoadouts(ids: string[], refreshKey = 0) {
  const [loadouts, set] = useState<Record<string, Loadout>>({});
  const key = [...new Set(ids)].sort().join(",");
  const last = useRef("");
  useEffect(() => {
    if (!key || last.current === `${key}|${refreshKey}`) return;
    last.current = `${key}|${refreshKey}`;
    fetch(`/api/loadouts?ids=${key}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && set(d.loadouts ?? {}))
      .catch(() => {});
  }, [key, refreshKey]);
  return loadouts;
}
