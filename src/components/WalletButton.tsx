"use client";

import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { monad } from "@/lib/wagmi";

export function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  if (isConnected && address) {
    if (chainId !== monad.id) {
      return (
        <button onClick={() => switchChain({ chainId: monad.id })} className="btn btn-down px-4 py-2 text-sm">
          Switch to Monad
        </button>
      );
    }
    return (
      <button onClick={() => disconnect()} className="btn btn-ghost whitespace-nowrap px-3 py-2 text-sm sm:px-4" title="Disconnect">
        {short(address)}
      </button>
    );
  }

  const injectedConnector = connectors[0];
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => injectedConnector && connect({ connector: injectedConnector })}
        disabled={isPending}
        className="btn btn-primary whitespace-nowrap px-3 py-2 text-sm sm:px-4"
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {error && <span className="text-xs text-[var(--red)]">{error.message.split("\n")[0]}</span>}
    </div>
  );
}
