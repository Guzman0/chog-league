"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { getAddress } from "viem";

// Same text the server checks (see lib/session.ts).
function signInMessage(address: string, issuedAt: string) {
  return `Sign in to Chog League\n\nThis only proves you own this wallet. It costs nothing and sends no transaction.\n\nAddress: ${address}\nIssued: ${issuedAt}`;
}

export function useSession() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth").then((r) => r.json()).then((d) => setSessionAddress(d.address)).catch(() => {});
  }, []);

  const signIn = useCallback(async () => {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const wallet = getAddress(address);
      const issuedAt = new Date().toISOString();
      const signature = await signMessageAsync({ message: signInMessage(wallet, issuedAt) });
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address: wallet, issuedAt, signature }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setSessionAddress(d.address);
    } catch (e) {
      setError(e instanceof Error ? e.message.split("\n")[0] : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }, [address, signMessageAsync]);

  const signedIn = !!(address && sessionAddress && sessionAddress === address.toLowerCase());
  return { signedIn, signIn, busy, error };
}
