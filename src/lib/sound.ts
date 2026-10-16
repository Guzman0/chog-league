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
  if (!m) {
    unlock();
    play("win"); // so you hear that sound is on
  }
}

export function onMutedChange(fn: (m: boolean) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch {
    return null;
  }
}

// Browsers only let a page make sound after the player taps or clicks
// something. On the first tap anywhere, switch the audio engine on (and play
// a silent blip, which iPhones need). Later sounds, like a call settling on
// its own, then work.
let unlocked = false;
function unlock() {
  if (unlocked) return;
  const a = audio();
  if (!a) return;
  try {
    // iPhone/iPad: play even when the silent switch is on, like a game.
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) nav.audioSession.type = "playback";
  } catch {}
  void a.resume().then(() => {
    if (a.state === "running") {
      unlocked = true;
      ["pointerdown", "touchend", "keydown"].forEach((e) => window.removeEventListener(e, unlock, true));
    }
  });
  try {
    const b = a.createBuffer(1, 1, 22050);
    const src = a.createBufferSource();
    src.buffer = b;
    src.connect(a.destination);
    src.start(0);
  } catch {}
}
if (typeof window !== "undefined") {
  ["pointerdown", "touchend", "keydown"].forEach((e) => window.addEventListener(e, unlock, { capture: true, passive: true }));
}

type Tone = [freq: number, start: number, dur: number, type: OscillatorType, vol?: number, slideTo?: number];

function tones(list: Tone[]) {
  const a = audio();
  if (!a) return;
  const go = () => {
    for (const [freq, start, dur, type, vol = 0.18, slideTo] of list) {
      const t0 = a.currentTime + 0.01 + start;
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
  };
  // If the engine is paused (e.g. the tab was in the background), wake it first,
  // so the sound isn't scheduled in the past and lost.
  if (a.state !== "running") void a.resume().then(go, () => {});
  else go();
}

export type Sfx = "win" | "lose" | "place" | "invite" | "victory";

export function play(s: Sfx) {
  if (isMuted()) return;
  switch (s) {
    case "win": // bright two-note ding
      return tones([[880, 0, 0.18, "triangle"], [1320, 0.1, 0.32, "triangle"]]);
    case "lose": // cartoon bonk
      return tones([[330, 0, 0.32, "square", 0.12, 110]]);
    case "place": // soft click
      return tones([[600, 0, 0.06, "sine", 0.12]]);
    case "invite": // double ping
      return tones([[990, 0, 0.12, "sine"], [990, 0.18, 0.12, "sine"]]);
    case "victory": // little fanfare
      return tones([523, 659, 784, 1047].map((f, i) => [f, i * 0.11, 0.3, "triangle", 0.16] as Tone));
  }
}
