"use client";

import { useEffect, useRef, useState } from "react";
import type { ChogData } from "@/lib/chog";
import { HOLDER_BADGE_MIN, HOLDER_DISCOUNT, ITEMS, SLOTS, fmtChog, holderPrice, type Loadout, type ShopItem } from "@/lib/shop";
import { play } from "@/lib/sound";
import ChogAvatar, { type Reaction } from "./ChogAvatar";
import { ChogTitle } from "./Cosmetics";
import type { useShop } from "./useShop";

type Shop = ReturnType<typeof useShop>;

export default function ShopPanel({
  chog, shop, isMine, signedIn, onSignIn, signingIn, preview, setPreview,
}: {
  chog: ChogData;
  shop: Shop;
  isMine: boolean;
  signedIn: boolean;
  onSignIn: () => void;
  signingIn: boolean;
  preview: Loadout;
  setPreview: (l: Loadout) => void;
}) {
  const saved = shop.loadout ?? {};
  const look = { ...saved, ...preview };
  const previewing = Object.keys(preview).length > 0;
  const canBuy = isMine && signedIn;

  // "Play win animation" on the preview picture.
  const [demo, setDemo] = useState<Reaction>(null);
  useEffect(() => {
    if (!demo) return;
    const t = setTimeout(() => setDemo(null), 3500);
    return () => clearTimeout(t);
  }, [demo]);
  const playWin = () => {
    play("win");
    setDemo({ kind: "win", text: "LFG! +$150", key: `demo-${Date.now()}` });
  };

  // On phones the preview is above the list, so bring it into view.
  const previewRef = useRef<HTMLDivElement>(null);
  const showPreview = () => {
    if (window.innerWidth < 1024) previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  function tryOn(item: ShopItem) {
    const next = { ...preview };
    if (preview[item.slot] === item.id) delete next[item.slot];
    else next[item.slot] = item.id;
    setPreview(next);
    if (next[item.slot]) showPreview();
    if (item.slot === "victory" && next.victory) setTimeout(playWin, 450);
  }

  async function buy(item: ShopItem) {
    const ok = await shop.buy(item);
    if (ok) {
      const next = { ...preview };
      delete next[item.slot];
      setPreview(next);
      if (item.slot === "victory") setTimeout(playWin, 300);
    }
  }

  return (
    <section className="panel">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <h3 className="text-2xl">✨ Chog Shop</h3>
          <p className="text-sm text-[var(--muted)]">
            Titles, frames and victory animations for your Chog, paid in real <b className="text-[var(--text)]">$CHOG</b>. Looks only: they never change the odds. Everything is saved to the Chog, so it goes with the NFT if you sell it.
          </p>
        </div>
        {shop.chogBalance !== null && (
          <p className="rounded-xl border-2 border-[var(--ink)] bg-[var(--panel-2)] px-3 py-1 text-sm font-extrabold">
            Your wallet: <span className="num text-[var(--banana)]">{fmtChog(shop.chogBalance)}</span>
          </p>
        )}
      </div>

      <div className="panel-flat mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 bg-[var(--banana)] p-3 text-sm font-extrabold text-[var(--ink)]">
        <span className="display text-lg">🏆 Every purchase grows the prize</span>
        <span>70% goes to this week&apos;s prize for the league #1{shop.pot ? ` (now ${fmtChog(shop.pot.prize)})` : ""}, 30% is burned 🔥</span>
      </div>

      <p className="mb-4 text-xs font-extrabold text-[var(--muted)]">
        {shop.holder
          ? `💜 You hold ${HOLDER_BADGE_MIN.toLocaleString("en-US")}+ $CHOG, so everything is ${HOLDER_DISCOUNT * 100}% off.`
          : `💜 Hold ${HOLDER_BADGE_MIN.toLocaleString("en-US")}+ $CHOG to get ${HOLDER_DISCOUNT * 100}% off everything and a holder badge on your Chogs.`}
      </p>

      {shop.pending && shop.pendingItem && (
        <div className="panel-flat mb-4 flex flex-wrap items-center justify-between gap-3 border-[var(--banana)] p-3 text-sm">
          <span className="font-extrabold">You paid for {shop.pendingItem.emoji} {shop.pendingItem.name}, but it isn&apos;t added yet.</span>
          <button type="button" className="btn btn-banana px-4 py-1.5 text-sm" disabled={!!shop.busy || !canBuy} onClick={() => shop.finish(shop.pending!)}>
            Finish purchase
          </button>
        </div>
      )}
      {(shop.step || shop.error) && (
        <p role="status" className={`mb-4 text-sm font-extrabold ${shop.error ? "text-[var(--red)]" : "text-[var(--banana)]"}`}>
          {shop.error ?? shop.step}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div ref={previewRef} className="scroll-mt-4 lg:sticky lg:top-4 lg:self-start">
          <div className="mx-auto max-w-[240px] pt-2">
            <ChogAvatar image={chog.image} name={chog.name} reaction={demo} frame={look.frame} victory={look.victory} size="lg" />
          </div>
          <div className="mt-3 text-center">
            <p className="display truncate text-lg">{chog.name}</p>
            <div className="min-h-6">{look.title ? <ChogTitle id={look.title} /> : <span className="text-xs text-[var(--muted)]">No title yet</span>}</div>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-ghost px-3 py-1.5 text-sm" onClick={playWin}>▶ Play win animation</button>
              {previewing && (
                <button type="button" className="btn btn-ghost px-3 py-1.5 text-sm" onClick={() => setPreview({})}>Stop preview</button>
              )}
            </div>
            {previewing && <p className="mt-2 text-xs font-extrabold text-[var(--pink)]">Previewing. Only you can see this until you buy.</p>}
          </div>
          {!isMine && (
            <p className="panel-flat mt-4 p-3 text-xs text-[var(--muted)]">Only this Chog&apos;s owner can buy for it. Try anything on for free.</p>
          )}
          {isMine && !signedIn && (
            <div className="mt-4 text-center">
              <button type="button" className="btn btn-primary px-4 py-2 text-sm" onClick={onSignIn} disabled={signingIn}>
                {signingIn ? "Check your wallet…" : "Sign in to buy"}
              </button>
            </div>
          )}
        </div>

        <div className="space-y-5">
          {SLOTS.map(({ slot, label, help }) => (
            <div key={slot}>
              <p className="label">{label}</p>
              <p className="mb-2 text-xs text-[var(--muted)]">{help}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {ITEMS.filter((i) => i.slot === slot).map((item) => {
                  const owned = shop.owned?.includes(item.id);
                  const wearing = saved[slot] === item.id;
                  const trying = preview[slot] === item.id;
                  const busy = shop.busy === item.id;
                  return (
                    <div key={item.id} className={`panel-flat flex flex-col gap-2 p-3 ${wearing ? "border-[var(--green)]" : trying ? "border-[var(--pink)]" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black"><span aria-hidden="true">{item.emoji}</span> {item.name}</p>
                        <p className={`display num whitespace-nowrap text-right text-sm ${owned ? "text-[var(--green)]" : "text-[var(--banana)]"}`}>
                          {owned ? "Owned" : shop.holder ? (
                            <>
                              <s className="text-xs text-[var(--muted)]">{item.price.toLocaleString("en-US")}</s> {fmtChog(holderPrice(item.price))}
                            </>
                          ) : fmtChog(item.price)}
                        </p>
                      </div>
                      <p className="text-xs text-[var(--muted)]">{item.blurb}</p>
                      <div className="mt-auto flex flex-wrap gap-2">
                        {owned ? (
                          <button type="button" className={`btn flex-1 px-3 py-1.5 text-sm ${wearing ? "btn-up" : "btn-banana"}`} disabled={!canBuy || !!shop.busy} onClick={() => shop.equip(slot, wearing ? null : item.id)}
                            title={!canBuy ? "Sign in as the owner to change what this Chog wears" : undefined}>
                            {busy ? "…" : wearing ? (canBuy ? "Wearing ✓ (take off)" : "Wearing ✓") : canBuy ? "Wear" : "Owned"}
                          </button>
                        ) : (
                          <>
                            <button type="button" aria-pressed={trying} className={`btn px-3 py-1.5 text-sm ${trying ? "btn-banana" : "btn-ghost"}`} onClick={() => tryOn(item)}>
                              {trying ? "Trying on" : "Try on"}
                            </button>
                            {canBuy && (
                              <button type="button" className="btn btn-primary flex-1 px-3 py-1.5 text-sm" disabled={!!shop.busy || !shop.ready} onClick={() => buy(item)}>
                                {busy ? "Buying…" : `Buy · ${(shop.holder ? holderPrice(item.price) : item.price).toLocaleString("en-US")} $CHOG`}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-xs text-[var(--muted)]">
            Paying sends $CHOG from your wallet to the Chog League wallet on Monad, plus a small MON network fee. Chog League checks the payment on-chain before adding the item. Trading and duels still use demo money only.
          </p>
        </div>
      </div>
    </section>
  );
}
