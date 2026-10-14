"use client";

import { useEffect, useRef, useState } from "react";
import { useConnect } from "wagmi";

// Phone browsers (Chrome, Safari) have no wallet inside them, so "Connect wallet"
// can't work there. Instead we offer to reopen this page inside a wallet app's
// own browser, where connecting works just like on desktop.

function hasBrowserWallet() {
  return typeof window !== "undefined" && typeof (window as { ethereum?: unknown }).ethereum !== "undefined";
}

function isPhone() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function walletLinks(url: string) {
  const noScheme = url.replace(/^https?:\/\//, "");
  return [
    { name: "MetaMask", href: `https://metamask.app.link/dapp/${noScheme}` },
    { name: "Phantom", href: `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}` },
    { name: "OKX Wallet", href: `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}` },
  ];
}

// Turn wallet errors into plain words.
function friendly(message: string) {
  if (/reject|denied|cancel/i.test(message)) return "Connection cancelled.";
  if (/provider not found/i.test(message)) return "No wallet found in this browser.";
  return message.split("\n")[0];
}

export default function ConnectButton({ className, onPractice }: { className: string; onPractice?: () => void }) {
  const { connect, connectors, isPending, error } = useConnect();
  const [sheet, setSheet] = useState(false);

  const onClick = () => {
    if (!hasBrowserWallet() || !connectors[0]) return setSheet(true);
    connect({ connector: connectors[0] }, { onError: (e) => /provider not found/i.test(e.message) && setSheet(true) });
  };

  return (
    <>
      <button type="button" onClick={onClick} disabled={isPending} className={className}>
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {error && !/provider not found/i.test(error.message) && <span className="text-xs text-[var(--red)]">{friendly(error.message)}</span>}
      <NoWalletSheet open={sheet} onClose={() => setSheet(false)} onPractice={onPractice} />
    </>
  );
}

function NoWalletSheet({ open, onClose, onPractice }: { open: boolean; onClose: () => void; onPractice?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState("https://chog-league.vercel.app/");
  const phone = isPhone();

  useEffect(() => {
    setUrl(window.location.href);
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked: the link is shown on screen anyway */
    }
  };

  return (
    <dialog ref={ref} onClose={onClose} className="panel m-auto w-[min(94vw,460px)] text-left text-[var(--text)] backdrop:bg-black/60">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-2xl">{phone ? "Open in your wallet app" : "No wallet found"}</h3>
        <button type="button" className="btn btn-ghost h-9 w-9" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {phone ? (
        <>
          <p className="mb-4 text-sm text-[var(--muted)]">
            Phone browsers can&apos;t hold a wallet. Tap your wallet below and Chog League opens inside its built-in browser, where you can connect.
          </p>
          <div className="mb-4 grid gap-2">
            {walletLinks(url).map((w) => (
              <a key={w.name} href={w.href} className="btn btn-primary flex w-full justify-center py-3 text-center">Open in {w.name}</a>
            ))}
          </div>
          <p className="label">Another wallet?</p>
          <p className="mb-2 text-sm text-[var(--muted)]">Copy this link and paste it into your wallet app&apos;s browser.</p>
          <button type="button" onClick={copy} className="btn btn-ghost mb-4 w-full py-2.5 text-sm">
            {copied ? "Copied ✓" : `Copy ${url.replace(/^https?:\/\//, "").replace(/\/$/, "")}`}
          </button>
        </>
      ) : (
        <p className="mb-4 text-sm text-[var(--muted)]">
          Install a browser wallet such as{" "}
          <a className="font-extrabold text-[var(--sky)] underline" href="https://metamask.io/download" target="_blank" rel="noreferrer">MetaMask</a> or{" "}
          <a className="font-extrabold text-[var(--sky)] underline" href="https://rabby.io" target="_blank" rel="noreferrer">Rabby</a>, then refresh this page.
        </p>
      )}

      <p className="rounded-xl border-2 border-[var(--ink)] bg-[var(--panel-2)] p-3 text-sm">
        No wallet? You can still play practice with any Chog.
        {onPractice && (
          <button type="button" className="btn btn-banana mt-3 w-full py-2.5" onClick={() => { onClose(); onPractice(); }}>
            🎲 Play practice
          </button>
        )}
      </p>
    </dialog>
  );
}
