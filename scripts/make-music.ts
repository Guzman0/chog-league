// Background music for the site: an original, chill 16-bar loop in F major,
// synthesised from scratch (nothing to license). Same style as the demo video.
// The end wraps into the start, so it loops with no gap or click.
// Run: npx tsx scripts/make-music.ts  →  public/music/chog-loop.wav
import fs from "fs";
import path from "path";

const SR = 22050; // background music: half rate keeps the file small
const BPM = 100;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 16;
const LEN = Math.round(BARS * BAR * SR);
const out = new Float32Array(LEN);

let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// Adds a sound at `start` seconds; anything past the end wraps to the start (seamless loop).
function add(start: number, dur: number, gen: (t: number) => number, gain: number) {
  const s0 = Math.round(start * SR);
  const n = Math.round(dur * SR);
  for (let i = 0; i < n; i++) out[(((s0 + i) % LEN) + LEN) % LEN] += gen(i / SR) * gain;
}
const env = (t: number, a: number, d: number) => (t < a ? t / a : Math.exp(-(t - a) / d));

// Chords: Fmaj7 · Am7 · Bbmaj7 · C9sus, one per bar.
const CHORDS = [
  { root: 41, notes: [57, 60, 64, 65] }, // F  (A C E F)
  { root: 45, notes: [57, 60, 64, 67] }, // Am7
  { root: 46, notes: [57, 62, 65, 69] }, // Bbmaj7
  { root: 48, notes: [55, 60, 62, 65] }, // C9sus
];

for (let bar = 0; bar < BARS; bar++) {
  const t0 = bar * BAR;
  const c = CHORDS[bar % 4];
  const full = bar >= 4; // first 4 bars: keys + bass only
  const arp = bar >= 8;

  // Electric-piano style keys: on beat 1 and the "and" of 2.
  for (const at of [0, 1.5]) {
    for (const n of c.notes) {
      const f = midi(n);
      add(t0 + at * BEAT, 2.2, (t) => (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t * 6)) * env(t, 0.008, 0.7), 0.05);
    }
  }
  // Warm bass: root on 1, fifth on the "and" of 3.
  for (const [at, semis, dur] of [[0, 0, 1.4], [2.5, 7, 0.9], [3.5, 12, 0.4]] as const) {
    const f = midi(c.root + semis - 12);
    add(t0 + at * BEAT, dur * BEAT + 0.2, (t) => (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * env(t, 0.01, 0.35), 0.22);
  }
  if (full) {
    // Soft kick on 1 and 3.
    for (const at of [0, 2]) add(t0 + at * BEAT, 0.35, (t) => Math.sin(2 * Math.PI * (48 * t + 30 * (1 - Math.exp(-t * 30)))) * Math.exp(-t * 9), 0.45);
    // Light snap on 2 and 4.
    for (const at of [1, 3]) {
      let lp = 0;
      add(t0 + at * BEAT, 0.18, (t) => {
        const x = rnd();
        lp += 0.35 * (x - lp);
        return (x - lp) * Math.exp(-t * 28);
      }, 0.11);
    }
    // Swung 8th-note hats.
    for (let e = 0; e < 8; e++) {
      const swing = e % 2 ? 0.08 * BEAT : 0;
      let lp = 0;
      add(t0 + e * 0.5 * BEAT + swing, 0.06, (t) => {
        const x = rnd();
        lp += 0.6 * (x - lp);
        return (x - lp) * Math.exp(-t * 70);
      }, e % 2 ? 0.035 : 0.05);
    }
  }
  if (arp) {
    // Sparkly pluck arpeggio, an octave up, with a soft echo.
    const pattern = [0, 2, 1, 3, 2, 1, 3, 0];
    pattern.forEach((k, i) => {
      if (i === 7 && bar % 2) return;
      const f = midi(c.notes[k] + 12);
      const pluck = (t: number) => (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * f * t)) * env(t, 0.004, 0.18);
      add(t0 + i * 0.5 * BEAT, 0.9, pluck, 0.045);
      add(t0 + i * 0.5 * BEAT + 0.75 * BEAT, 0.9, pluck, 0.018); // echo (dotted 8th)
    });
  }
}

// Gentle limiter + normalise.
let peak = 0;
for (let i = 0; i < LEN; i++) {
  out[i] = Math.tanh(out[i] * 1.2);
  peak = Math.max(peak, Math.abs(out[i]));
}
const g = 0.8 / peak;

const buf = Buffer.alloc(44 + LEN * 2);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + LEN * 2, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(1, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 2, 28);
buf.writeUInt16LE(2, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(LEN * 2, 40);
for (let i = 0; i < LEN; i++) buf.writeInt16LE(Math.round(out[i] * g * 32767), 44 + i * 2);
const file = path.join(__dirname, "..", "public", "music", "chog-loop.wav");
fs.writeFileSync(file, buf);
console.log(`${file}: ${(LEN / SR).toFixed(1)}s, ${(buf.length / 1e6).toFixed(2)} MB`);
