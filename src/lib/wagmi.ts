import { createConfig, http } from "wagmi";
import { defineChain } from "viem";
// Import from @wagmi/core so we only bundle the browser-wallet connector.
import { injected } from "@wagmi/core";
import { MONAD_CHAIN_ID, MONAD_RPC_URL } from "./chog";

export const monad = defineChain({
  id: MONAD_CHAIN_ID,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC_URL] } },
  blockExplorers: { default: { name: "MonadScan", url: "https://monadscan.com" } },
});

export const wagmiConfig = createConfig({
  chains: [monad],
  connectors: [injected()],
  transports: { [monad.id]: http(MONAD_RPC_URL) },
  ssr: true,
});
