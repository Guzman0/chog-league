"use client";

// The shop for one Chog: what it owns and wears, this week's prize pot, and
// buying with real $CHOG (one wallet payment, then the server checks it on Monad).
import { useCallback, useEffect, useState } from "react";
import { useAccount, useReadContract, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "@wagmi/core";
import { erc20Abi, formatUnits, parseUnits } from "viem";
import { CHOG_TOKEN_ADDRESS } from "@/lib/chog";
import { monad, wagmiConfig } from "@/lib/wagmi";
import { HOLDER_BADGE_MIN, TREASURY, holderPrice, itemById, type Loadout, type ShopItem, type Slot } from "@/lib/shop";

export type Pot = {
  base: number; sales: number; chips: number; prize: number; burn: number; weekStart: number; endsAt: number;
  topChippers?: { wallet: string; amount: number }[];
};
type ShopState = { owned: string[]; loadout: Loadout; pot: Pot; decimals: number | null };
type Pending = { hash: `0x${string}`; tokenId: string; itemId: string };

const PENDING_KEY = "chog_pending_purchase";
function readPending(): Pending | null {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? "null");
  } catch {
    return null;
  }
}
function writePending(p: Pending | null) {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
}

// Wallet errors in plain words.
function plain(e: unknown) {
  const m = e instanceof Error ? e.message : String(e);
  if (/user rejected|denied|rejected the request/i.test(m)) return "You cancelled in your wallet. Nothing was charged.";
  if (/insufficient funds|gas/i.test(m)) return "Your wallet needs a little MON to pay the network fee.";
  if (/exceeds balance|transfer amount/i.test(m)) return "Not enough $CHOG in this wallet.";
  return m.split("\n")[0].slice(0, 160);
}

/** This week's prize pot only (for the league screen and the landing page). */
export function usePot(refreshKey = 0) {
  const [pot, set] = useState<Pot | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/shop", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d?.pot && set(d.pot))
        .catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [refreshKey]);
  return pot;
}

export function useShop(tokenId: string | undefined) {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [state, setState] = useState<ShopState | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // item id being bought / equipped
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const balance = useReadContract({
    address: CHOG_TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: monad.id,
    query: { enabled: !!address },
  });

  // Decimals straight from the chain in the browser (the server's copy is a fallback).
  const chainDecimals = useReadContract({ address: CHOG_TOKEN_ADDRESS, abi: erc20Abi, functionName: "decimals", chainId: monad.id });

  const load = useCallback(async () => {
    if (!tokenId) return;
    const d = await fetch(`/api/shop?tokenId=${tokenId}`, { cache: "no-store" }).then((r) => r.json());
    setState((prev) => ({ owned: d.owned ?? [], loadout: d.loadout ?? {}, pot: d.pot, decimals: d.decimals ?? prev?.decimals ?? null }));
  }, [tokenId]);

  useEffect(() => {
    setState(null);
    setError(null);
    load().catch(() => {});
    const p = readPending();
    setPending(p && p.tokenId === tokenId ? p : null);
  }, [tokenId, load]);

  const post = useCallback(
    async (body: object) => {
      const r = await fetch("/api/shop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tokenId, ...body }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Something went wrong");
      setState((s) => (s ? { ...s, owned: d.owned ?? s.owned, loadout: d.loadout ?? s.loadout } : s));
      return d;
    },
    [tokenId],
  );

  // Step 2 of buying (also used to finish a purchase after a reload).
  const finish = useCallback(
    async (p: Pending) => {
      setBusy(p.itemId);
      setError(null);
      try {
        setStep("Confirming your payment on Monad…");
        await waitForTransactionReceipt(wagmiConfig, { hash: p.hash, chainId: monad.id, timeout: 90000 }).catch(() => null);
        await post({ action: "buy", itemId: p.itemId, txHash: p.hash });
        writePending(null);
        setPending(null);
        balance.refetch();
        load().catch(() => {});
        return true;
      } catch (e) {
        setError(plain(e));
        return false;
      } finally {
        setBusy(null);
        setStep(null);
      }
    },
    [post, load, balance],
  );

  const buy = useCallback(
    async (item: ShopItem) => {
      if (!tokenId || !state) return false;
      setError(null);
      const decimals = state.decimals ?? chainDecimals.data ?? null;
      if (decimals === null) {
        setError("Couldn't reach Monad to price this. Try again in a moment.");
        return false;
      }
      // Holders (10,000+ $CHOG) pay 20% less. The server checks this again.
      const holder = balance.data !== undefined && Number(formatUnits(balance.data, decimals)) >= HOLDER_BADGE_MIN;
      const price = holder ? holderPrice(item.price) : item.price;
      const amount = parseUnits(String(price), decimals);
      if (balance.data !== undefined && balance.data < amount) {
        setError(`Not enough $CHOG. This costs ${price.toLocaleString("en-US")} and this wallet has ${Math.floor(Number(formatUnits(balance.data, decimals))).toLocaleString("en-US")}.`);
        return false;
      }
      setBusy(item.id);
      try {
        if (chainId !== monad.id) {
          setStep("Switch your wallet to Monad…");
          await switchChainAsync({ chainId: monad.id });
        }
        setStep("Approve the payment in your wallet…");
        const hash = await writeContractAsync({ address: CHOG_TOKEN_ADDRESS, abi: erc20Abi, functionName: "transfer", args: [TREASURY, amount], chainId: monad.id });
        const p = { hash, tokenId, itemId: item.id };
        writePending(p); // if the page closes now, the purchase can still be finished
        setPending(p);
      } catch (e) {
        setError(plain(e));
        setBusy(null);
        setStep(null);
        return false;
      }
      return finish(readPending()!);
    },
    [tokenId, state, chainDecimals.data, balance.data, chainId, switchChainAsync, writeContractAsync, finish],
  );

  const equip = useCallback(
    async (slot: Slot, itemId: string | null) => {
      setBusy(itemId ?? slot);
      setError(null);
      try {
        await post({ action: "equip", slot, itemId });
      } catch (e) {
        setError(plain(e));
      } finally {
        setBusy(null);
      }
    },
    [post],
  );

  const dec = state?.decimals ?? chainDecimals.data ?? null;
  const chogBalance = balance.data !== undefined && dec !== null ? Math.floor(Number(formatUnits(balance.data, dec))) : null;
  const holder = chogBalance !== null && chogBalance >= HOLDER_BADGE_MIN;
  return { ...state, ready: !!state, chogBalance, holder, busy, step, error, pending, pendingItem: itemById(pending?.itemId), buy, equip, finish, reload: load };
}
