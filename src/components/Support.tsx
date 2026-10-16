"use client";

// Real-$CHOG extras around the league: chip in to the weekly prize, tip the
// champion, and the 💜 holder badge. Trading itself stays demo money.
import { useCallback, useEffect, useState } from "react";
import { useAccount, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { CHOG_TOKEN_ADDRESS } from "@/lib/chog";
import { monad, wagmiConfig } from "@/lib/wagmi";
import { CHIP_PRESETS, HOLDER_BADGE_MIN, MAX_CHIP, MIN_CHIP, TIP_PRESETS, TREASURY, fmtChog } from "@/lib/shop";
import { useSession } from "./useSession";
import { short } from "./WalletButton";
import ConnectButton from "./ConnectButton";

const DECIMALS = 18; // read from the chain below; this is only the starting guess

/** $CHOG balance of any wallet (whole tokens), read in the browser. */
export function useChogBalance(wallet: string | undefined | null) {
  const decimals = useReadContract({ address: CHOG_TOKEN_ADDRESS, abi: erc20Abi, functionName: "decimals", chainId: monad.id });
  const bal = useReadContract({
    address: CHOG_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: wallet ? [wallet as `0x${string}`] : undefined,
    chainId: monad.id,
    query: { enabled: !!wallet && /^0x[0-9a-fA-F]{40}$/.test(wallet) },
  });
  const d = decimals.data ?? DECIMALS;
  return {
    balance: bal.data !== undefined && decimals.data !== undefined ? Math.floor(Number(formatUnits(bal.data, d))) : null,
    decimals: decimals.data ?? null,
    refetch: bal.refetch,
  };
}

/** 💜 shown on a Chog whose owner holds 10,000+ $CHOG. */
export function HolderBadge({ owner }: { owner: string | undefined }) {
  const { balance } = useChogBalance(owner);
  if (balance === null || balance < HOLDER_BADGE_MIN) return null;
  return (
    <span
      className="rounded-lg border-2 border-[var(--ink)] bg-[var(--purple)] px-2 py-0.5 text-[var(--text)]"
      title={`This Chog's owner holds ${HOLDER_BADGE_MIN.toLocaleString("en-US")}+ $CHOG. Holders get 20% off in the shop.`}
    >
      💜 $CHOG holder
    </span>
  );
}

function plain(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/user rejected|denied|rejected the request/i.test(m)) return "You cancelled in your wallet. Nothing was sent.";
  if (/insufficient funds|gas/i.test(m)) return "Your wallet needs a little MON to pay the network fee.";
  if (/exceeds balance|transfer amount/i.test(m)) return "Not enough $CHOG in this wallet.";
  return m.split("\n")[0].slice(0, 160);
}

/**
 * Send $CHOG from the connected wallet, wait for Monad to confirm it, then
 * tell our server (which re-checks it on-chain). Remembers an unfinished
 * payment so a reload can finish it.
 */
function useChogSend(kind: "chipin" | "tip") {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const { balance, decimals, refetch } = useChogBalance(address);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const key = `chog_pending_${kind}`;
  const [pending, setPending] = useState<{ hash: `0x${string}`; body: object } | null>(null);
  useEffect(() => {
    try {
      setPending(JSON.parse(localStorage.getItem(key) ?? "null"));
    } catch {}
  }, [key]);
  const remember = (p: typeof pending) => {
    setPending(p);
    try {
      if (p) localStorage.setItem(key, JSON.stringify(p));
      else localStorage.removeItem(key);
    } catch {}
  };

  const report = useCallback(
    async (p: { hash: `0x${string}`; body: object }) => {
      setError(null);
      try {
        setStep("Confirming on Monad…");
        await waitForTransactionReceipt(wagmiConfig, { hash: p.hash, chainId: monad.id, timeout: 90000 }).catch(() => null);
        const r = await fetch(kind === "chipin" ? "/api/chipin" : "/api/tips", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...p.body, txHash: p.hash }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Something went wrong");
        remember(null);
        refetch();
        return true;
      } catch (e) {
        setError(plain(e));
        return false;
      } finally {
        setStep(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, refetch],
  );

  const send = useCallback(
    async (to: string, amount: number, body: object) => {
      setError(null);
      setDone(null);
      if (decimals === null) return setError("Couldn't reach Monad. Try again in a moment."), false;
      if (balance !== null && balance < amount) return setError(`Not enough $CHOG. This wallet has ${fmtChog(balance)}.`), false;
      try {
        if (chainId !== monad.id) {
          setStep("Switch your wallet to Monad…");
          await switchChainAsync({ chainId: monad.id });
        }
        setStep("Approve in your wallet…");
        const hash = await writeContractAsync({
          address: CHOG_TOKEN_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [to as `0x${string}`, parseUnits(String(amount), decimals)], chainId: monad.id,
        });
        const p = { hash, body };
        remember(p);
        const ok = await report(p);
        if (ok) setDone(`Sent ${fmtChog(amount)}. Thank you! 💜`);
        return ok;
      } catch (e) {
        setError(plain(e));
        setStep(null);
        return false;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [decimals, balance, chainId, switchChainAsync, writeContractAsync, report],
  );

  return { address, balance, step, error, done, pending, send, finish: report, busy: !!step };
}

/** Amount picker: presets plus "type your own". */
function AmountPicker({ presets, value, onChange }: { presets: number[]; value: number; onChange: (n: number) => void }) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-wrap gap-2">
      {presets.map((n) => (
        <button key={n} type="button" className="pill" aria-pressed={!text && value === n} onClick={() => (setText(""), onChange(n))}>
          {n.toLocaleString("en-US")}
        </button>
      ))}
      <label className="pill flex items-center" aria-pressed={!!text}>
        <input
          value={text}
          inputMode="numeric"
          placeholder="Custom"
          aria-label="Custom amount of $CHOG"
          className="w-20 bg-transparent text-inherit outline-none placeholder:text-[var(--muted)]"
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            setText(raw);
            onChange(raw ? Number(raw) : presets[0]);
          }}
        />
      </label>
    </div>
  );
}

/** Wallet connected + signed in, or the button to get there. */
function Gate({ children }: { children: React.ReactNode }) {
  const { isConnected } = useAccount();
  const session = useSession();
  if (!isConnected) return <ConnectButton className="btn btn-primary px-4 py-2 text-sm" />;
  if (!session.signedIn)
    return (
      <div>
        <button type="button" className="btn btn-primary px-4 py-2 text-sm" onClick={session.signIn} disabled={session.busy}>
          {session.busy ? "Check your wallet…" : "Sign in to send $CHOG"}
        </button>
        <p className="mt-1 text-xs text-[var(--muted)]">A free signature, so we know the payment is yours.</p>
        {session.error && <p className="mt-1 text-xs font-extrabold text-[var(--red)]">{session.error}</p>}
      </div>
    );
  return <>{children}</>;
}

function Status({ s }: { s: ReturnType<typeof useChogSend> }) {
  return (
    <>
      {s.pending && !s.busy && (
        <p className="mt-2 text-xs font-extrabold">
          A payment hasn&apos;t been counted yet.{" "}
          <button type="button" className="underline" onClick={() => s.finish(s.pending!)}>Finish it</button>
        </p>
      )}
      {(s.step || s.error || s.done) && (
        <p role="status" className={`mt-2 text-xs font-extrabold ${s.error ? "text-[var(--red)]" : ""}`}>{s.error ?? s.step ?? s.done}</p>
      )}
    </>
  );
}

/** "Chip in" to this week's prize. Everything chipped in goes to the prize (no burn). */
export function ChipIn({ topChippers, onDone }: { topChippers?: { wallet: string; amount: number }[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(CHIP_PRESETS[0]);
  const s = useChogSend("chipin");
  const ok = amount >= MIN_CHIP && amount <= MAX_CHIP;
  return (
    <div className="mt-2">
      {!open ? (
        <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(true)}>💜 Chip in $CHOG</button>
      ) : (
        <div className="rounded-xl border-2 border-[var(--ink)] bg-[var(--panel)] p-3 text-[var(--text)]">
          <p className="mb-2 text-xs font-extrabold">Add $CHOG to this week&apos;s prize. All of it goes to the winner.</p>
          <Gate>
            <AmountPicker presets={CHIP_PRESETS} value={amount} onChange={setAmount} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="btn btn-banana px-4 py-1.5 text-sm"
                disabled={!ok || s.busy}
                onClick={async () => (await s.send(TREASURY, amount, {})) && onDone()}
              >
                {s.busy ? "Sending…" : `Chip in ${fmtChog(amount)}`}
              </button>
              {s.balance !== null && <span className="text-xs text-[var(--muted)]">You have {fmtChog(s.balance)}</span>}
            </div>
            {!ok && <p className="mt-1 text-xs font-extrabold text-[var(--red)]">From {MIN_CHIP} to {MAX_CHIP.toLocaleString("en-US")} $CHOG</p>}
            <Status s={s} />
          </Gate>
        </div>
      )}
      {!!topChippers?.length && (
        <p className="mt-2 text-xs font-extrabold">
          Top chippers: {topChippers.map((c) => `${short(c.wallet)} ${c.amount.toLocaleString("en-US")}`).join(" · ")}
        </p>
      )}
    </div>
  );
}

/** Tip the reigning champion. Goes straight to the wallet that owns the Chog. */
export function TipChampion({ tokenId, owner, tipTotal = 0, tippers = 0, onDone }: { tokenId: string; owner?: string; tipTotal?: number; tippers?: number; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(TIP_PRESETS[1]);
  const s = useChogSend("tip");
  const self = !!(s.address && owner && s.address.toLowerCase() === owner.toLowerCase());
  return (
    <div className="mt-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {tipTotal > 0 && (
          <span className="font-extrabold">💝 Tipped {fmtChog(tipTotal)} by {tippers} player{tippers === 1 ? "" : "s"}</span>
        )}
        {!open && owner && (
          <button type="button" className="btn btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(true)}>💝 Tip the champion</button>
        )}
      </div>
      {open && owner && (
        <div className="mt-2 rounded-xl border-2 border-[var(--ink)] bg-[var(--panel)] p-3">
          <p className="mb-2 font-extrabold">Send $CHOG straight to the champion&apos;s owner ({short(owner)}).</p>
          <Gate>
            {self ? (
              <p className="font-extrabold">This is your Chog, congrats! 👑 You can&apos;t tip yourself.</p>
            ) : (
              <>
                <AmountPicker presets={TIP_PRESETS} value={amount} onChange={setAmount} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-banana px-4 py-1.5 text-sm"
                    disabled={amount < MIN_CHIP || s.busy}
                    onClick={async () => (await s.send(owner, amount, { tokenId })) && onDone()}
                  >
                    {s.busy ? "Sending…" : `Tip ${fmtChog(amount)}`}
                  </button>
                  {s.balance !== null && <span className="text-[var(--muted)]">You have {fmtChog(s.balance)}</span>}
                </div>
                {amount < MIN_CHIP && <p className="mt-1 font-extrabold text-[var(--red)]">At least {MIN_CHIP} $CHOG</p>}
                <Status s={s} />
              </>
            )}
          </Gate>
        </div>
      )}
    </div>
  );
}
