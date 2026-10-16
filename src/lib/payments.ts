// Checks a $CHOG payment on Monad before the shop hands over an item.
// The browser only sends a transaction hash; everything else is read from the chain.
import { erc20Abi, formatUnits, parseEventLogs, parseUnits } from "viem";
import { publicClient } from "./chain";
import { CHOG_TOKEN_ADDRESS } from "./chog";
import { TREASURY } from "./shop";

let decimalsCache: number | null = null;
export async function chogDecimals(): Promise<number> {
  decimalsCache ??= Number(await publicClient.readContract({ address: CHOG_TOKEN_ADDRESS, abi: erc20Abi, functionName: "decimals" }));
  return decimalsCache;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Confirms `hash` is a successful transaction in which `from` sent at least
 * `min` $CHOG to `to`. Returns how much was sent (whole $CHOG). Throws a
 * plain-words error if not.
 */
export async function verifyChogTransfer(hash: `0x${string}`, from: string, to: string, min: number): Promise<number> {
  // The browser waits for the transaction first, but the RPC can lag a little.
  let receipt = null;
  for (let i = 0; i < 5 && !receipt; i++) {
    receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
    if (!receipt) await sleep(1500);
  }
  if (!receipt) throw new Error("Couldn't find that payment on Monad yet. Wait a few seconds and try again.");
  if (receipt.status !== "success") throw new Error("That payment failed on Monad, so nothing was sent. Try again.");

  const decimals = await chogDecimals();
  const paid = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs })
    .filter(
      (l) =>
        l.address.toLowerCase() === CHOG_TOKEN_ADDRESS.toLowerCase() &&
        l.args.from.toLowerCase() === from.toLowerCase() &&
        l.args.to.toLowerCase() === to.toLowerCase(),
    )
    .reduce((n, l) => n + l.args.value, BigInt(0));

  if (paid === BigInt(0)) throw new Error("That transaction isn't a $CHOG payment from your wallet to the right place.");
  if (paid < parseUnits(String(min), decimals)) throw new Error(`That payment is less than ${min.toLocaleString("en-US")} $CHOG.`);
  return Math.floor(Number(formatUnits(paid, decimals)));
}

/** A shop payment: at least `price` $CHOG from `wallet` to the Chog League wallet. */
export async function verifyChogPayment(hash: `0x${string}`, wallet: string, price: number): Promise<void> {
  await verifyChogTransfer(hash, wallet, TREASURY, price);
}

/** Whole $CHOG a wallet holds right now. */
export async function chogBalance(wallet: string): Promise<number> {
  const [raw, decimals] = await Promise.all([
    publicClient.readContract({ address: CHOG_TOKEN_ADDRESS, abi: erc20Abi, functionName: "balanceOf", args: [wallet as `0x${string}`] }),
    chogDecimals(),
  ]);
  return Math.floor(Number(formatUnits(raw, decimals)));
}
