"use client";

import { useEffect, useState } from "react";
import { isMuted, onMutedChange, setMuted } from "@/lib/sound";

export function Pill({
  on, onClick, children, disabled, title,
}: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className="pill" aria-pressed={on} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function SoundToggle() {
  const [muted, set] = useState(false);
  useEffect(() => {
    set(isMuted());
    const off = onMutedChange(set);
    return () => {
      off();
    };
  }, []);
  return (
    <button type="button" className="btn btn-ghost h-10 w-10 text-lg" onClick={() => setMuted(!muted)} aria-label={muted ? "Turn sound on" : "Mute sound"} title={muted ? "Sound off" : "Sound on"}>
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
