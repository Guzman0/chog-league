"use client";

// Tiny sound effects made with the browser's audio engine (no sound files).
// Muted state is remembered per browser; if storage is blocked, it just isn't remembered.

let ctx: AudioContext | null = null;
let muted: boolean | null = null;
const listeners = new Set<(m: boolean) => void>();

export function isMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem("chog-sound") === "off";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setMuted(m: boolean) {
  muted = m;
  try {
    localStorage.setItem("chog-sound", m ? "off" : "on");
  } catch {
    // storage blocked; fine
  }
  listeners.forEach((l) => l(m));
}

export function onMutedChange(fn: (m: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol = 0.18, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export type Sfx = "win" | "lose" | "place" | "invite" | "victory";

export function play(s: Sfx) {
  if (isMuted()) return;
  switch (s) {
    case "win": // bright two-note ding
      tone(880, 0, 0.18, "triangle");
      tone(1320, 0.1, 0.32, "triangle");
      break;
    case "lose": // cartoon bonk
      tone(330, 0, 0.32, "square", 0.12, 110);
      break;
    case "place": // soft click
      tone(600, 0, 0.06, "sine", 0.12);
      break;
    case "invite": // double ping
      tone(990, 0, 0.12, "sine");
      tone(990, 0.18, 0.12, "sine");
      break;
    case "victory": // little fanfare
      [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.3, "triangle", 0.16));
      break;
  }
}
