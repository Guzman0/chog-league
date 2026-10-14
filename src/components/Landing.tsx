"use client";

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

      <div className="mx-auto mt-12 grid max-w-4xl gap-5 sm:grid-cols-3">
        <Feature tilt="-1.5deg" title="Call it" emoji="📈">Higher or lower in 1 to 5 minutes. Bigger multiplier, bigger win, harder target.</Feature>
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
