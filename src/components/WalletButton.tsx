"use client";

import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { monad } from "@/lib/wagmi";
import ConnectButton from "./ConnectButton";

export function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function WalletButton() {
  const { address, isConnected, chainId } = useAccount();
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
      <button onClick={() => disconnect()} className="btn btn-ghost whitespace-nowrap px-2.5 py-2 text-[13px] sm:px-4 sm:text-sm" title="Disconnect">
        {short(address)}
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <ConnectButton className="btn btn-primary whitespace-nowrap px-2.5 py-2 text-[13px] sm:px-4 sm:text-sm" />
    </div>
  );
}
