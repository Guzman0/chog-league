"use client";

import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import ConnectButton from "./ConnectButton";

// A pile of real Chog art straight from the collection's IPFS folder
// (loaded directly from the Pinata gateway, which is fast and cached).
const ART_CID = "bafybeihau2egcccbdxymeckmmbrqytbfor5gkt3en6d5fsbueymdbq7g6e";
const art = (n: number) => `https://gateway.pinata.cloud/ipfs/${ART_CID}/${n}.webp`;

// Hand-picked Chogs (first three also show on phones). Check the art before adding one:
// some caps carry slogans you don't want on a landing page.
const PILE = [
  { n: 1462, left: "2%", top: 40, w: 150, r: "-9deg", z: 2 },
  { n: 777, left: "17%", top: 0, w: 170, r: "5deg", z: 3 },
  { n: 42, left: "34%", top: 54, w: 190, r: "-3deg", z: 5 },
  { n: 1, left: "53%", top: 4, w: 165, r: "8deg", z: 4 },
  { n: 1969, left: "69%", top: 48, w: 150, r: "-6deg", z: 3 },
  { n: 1234, left: "84%", top: 10, w: 130, r: "10deg", z: 2 },
];

export default function Landing({ onPractice, loading }: { onPractice: () => void; loading: boolean }) {
  const { isConnected } = useAccount();

  return (
    <section className="pt-2 sm:pt-6">
      {/* Sticker pile */}
      <div className="relative mx-auto mb-8 hidden h-[270px] max-w-4xl sm:block" aria-hidden="true">
        {PILE.map((s, i) => (
          <div
            key={s.n}
            className="sticker absolute"
            style={{ left: s.left, top: s.top, width: s.w, zIndex: s.z, ["--r" as string]: s.r, animationDelay: `${i * 90}ms` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={art(s.n)} alt="" className="block aspect-square w-full object-cover" />
          </div>
        ))}
      </div>
      <div className="mb-6 grid grid-cols-3 gap-3 sm:hidden" aria-hidden="true">
        {PILE.slice(0, 3).map((s, i) => (
          <div key={s.n} className="sticker" style={{ ["--r" as string]: s.r, animationDelay: `${i * 90}ms` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={art(s.n)} alt="" className="block aspect-square w-full object-cover" />
          </div>
        ))}
      </div>

      <div className="mx-auto max-w-2xl text-center">
        <h1 className="mb-3 text-5xl leading-[1.02] sm:text-7xl">Call it with your Chog.</h1>
        <p className="mx-auto mb-7 max-w-xl text-lg text-[var(--muted)]">
          Pick higher or lower on live crypto prices. Win and your Chog levels up. Duel other holders for their balance. Demo money only, so the only thing you can lose is pride.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button type="button" onClick={onPractice} disabled={loading} className="btn btn-banana px-6 py-3.5 text-lg">
            {loading ? "Finding a Chog…" : "🎲 Play with a random Chog"}
          </button>
          {!isConnected && (
            <ConnectButton className="btn btn-primary px-6 py-3.5 text-lg" onPractice={onPractice} />
          )}
        </div>
        <p className="mt-3 text-sm text-[var(--muted)]">No wallet needed to play practice. Chog holders connect to play the league.</p>
      </div>

      <HowToPlay />

      <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Feature tilt="-1.5deg" title="Call it" emoji="📈">Higher or lower in 1 to 5 minutes. Bigger multiplier, bigger win, harder target.</Feature>
        <Feature tilt="1.5deg" title="No two Chogs alike" emoji="🧬">Its traits give it a home market and a daily power: Shield, Double Up or Parachute. Same fair odds, different play.</Feature>
        <Feature tilt="1deg" title="Duel a Chog" emoji="⚔️">Challenge anyone online. You both stake the same amount and the winner takes the pot.</Feature>
        <Feature tilt="-1deg" title="Wear the crown" emoji="👑">Every Chog starts Monday with $1,000. Finish the week on top and your Chog wears the crown.</Feature>
      </div>
    </section>
  );
}

function Feature({ title, emoji, tilt, children }: { title: string; emoji: string; tilt: string; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ transform: `rotate(${tilt})` }}>
      <p className="mb-1 text-3xl" aria-hidden="true">{emoji}</p>
      <h3 className="mb-1 text-2xl">{title}</h3>
      <p className="text-sm text-[var(--muted)]">{children}</p>
    </div>
  );
}

// A 47-second how-to clip (the demo video at 1.5x speed). Plays muted on a loop; tap for sound.
function HowToPlay() {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  const toggleSound = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
    setMuted(v.muted);
  };

  return (
    <div className="mx-auto mt-10 max-w-3xl">
      <h2 className="mb-1 text-center text-3xl sm:text-4xl">How to play</h2>
      <p className="mb-4 text-center text-sm text-[var(--muted)]">
        Pick a Chog → call higher or lower → win to level up → duel and climb the weekly league.
      </p>
      <div className="panel relative overflow-hidden !p-0" style={{ transform: "rotate(-0.6deg)" }}>
        <video
          ref={ref}
          src="/demo/how-to-play.mp4"
          poster="/demo/how-to-play.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className="block aspect-video w-full"
          aria-label="Short video showing how to play Chog League"
        />
        <button
          type="button"
          onClick={toggleSound}
          className="btn btn-banana absolute bottom-2 right-2 px-2.5 py-1 text-xs sm:bottom-3 sm:right-3 sm:px-3 sm:py-1.5 sm:text-sm"
        >
          {muted ? "🔊 Tap for sound" : "🔇 Mute"}
        </button>
      </div>
      <p className="mt-3 text-center text-sm text-[var(--muted)]">
        Shown at 1.5x speed.{" "}
        <a href="https://youtu.be/-P0y_3-3mhw" target="_blank" rel="noreferrer" className="underline">
          Watch the full 2:40 video
        </a>
      </p>
    </div>
  );
}
