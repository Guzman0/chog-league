"use client";

import { useEffect, useState } from "react";
import type { Trade } from "@/lib/game";
import { pnlText, quipFor } from "@/lib/quips";

const SITE = "https://chog-league.vercel.app";

// "📸 Share" button → a pop-up with the result card image, ready to share, save or post.
export default function ShareCard({ trade, chogName, className = "", label = "📸 Share" }: { trade: Trade; chogName?: string; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  if (trade.status === "open" || trade.duelId) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`btn btn-ghost px-2.5 py-1 text-xs ${className}`} aria-label="Share this result as an image" title="Share this result as an image">
        {label}
      </button>
      {open && <ShareModal trade={trade} chogName={chogName} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareModal({ trade, chogName, onClose }: { trade: Trade; chogName?: string; onClose: () => void }) {
  const src = `/api/card/${trade.id}`;
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const won = trade.status === "won";
  const who = chogName || `My Chog`;
  const text = `${who}: ${quipFor(trade)} ${pnlText(trade)} calling ${trade.market} ${trade.direction === "up" ? "higher" : "lower"} at ${trade.multiplier}x${won ? " 😎" : " 😭"}\n\nCall it with your Chog 👇\n${SITE}`;
  const fileName = `chog-${trade.tokenId}-${won ? "win" : trade.status === "lost" ? "rekt" : "push"}.png`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function file() {
    const blob = await (await fetch(src)).blob();
    return new File([blob], fileName, { type: "image/png" });
  }

  async function share() {
    setNote(null);
    try {
      const f = await file();
      if (navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f], text });
        return;
      }
      await download(f);
      setNote("Your device can't share images directly, so the card was saved instead.");
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setNote("Couldn't share the card. Try Save image.");
    }
  }

  async function download(f?: File) {
    const blob = f ?? (await file());
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function postOnX() {
    window.open(`https://x.com/intent/post?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setNote("Tip: save the image first, then attach it to your post.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label="Share your result" onClick={onClose}>
      <div className="panel w-full max-w-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-2xl">{won ? "Show it off" : trade.status === "lost" ? "Own the rekt" : "Share it"}</h3>
          <button type="button" onClick={onClose} className="btn btn-ghost px-2.5 py-1 text-sm" aria-label="Close">✕</button>
        </div>
        <div className="panel-flat relative mb-4 aspect-[1200/630] overflow-hidden !p-0">
          {!loaded && <p className="absolute inset-0 flex items-center justify-center text-sm text-[var(--muted)]">Making your card…</p>}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={`${who}: ${quipFor(trade)} ${pnlText(trade)}`} onLoad={() => setLoaded(true)} className={`block h-full w-full ${loaded ? "" : "opacity-0"}`} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={share} disabled={!loaded} className="btn btn-banana px-2 py-2.5 text-sm">📤 Share</button>
          <button type="button" onClick={() => download()} disabled={!loaded} className="btn btn-primary px-2 py-2.5 text-sm">💾 Save image</button>
          <button type="button" onClick={postOnX} className="btn btn-ghost px-2 py-2.5 text-sm">𝕏 Post</button>
        </div>
        {note && <p className="mt-3 text-center text-xs font-extrabold text-[var(--muted)]">{note}</p>}
      </div>
    </div>
  );
}
