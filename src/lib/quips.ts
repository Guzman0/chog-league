// Funny one-liners for share cards. Picked from the trade ID, so the same
// card always shows the same line.
import type { Trade } from "./game";

const WIN = ["Called it.", "Chog sees the future.", "Too easy.", "Printing (demo) money.", "Big brain Chog.", "Read the chart like a book."];
const LOSS = ["Got rekt.", "Rekt. Shake it off.", "The chart said no.", "Paper hands, paper money.", "Chog needs a nap.", "Wrong way, Chog."];
const PUSH = ["Dead even. Chog shrugs."];

function pick(list: string[], seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

export function quipFor(t: Pick<Trade, "id" | "status">) {
  return pick(t.status === "won" ? WIN : t.status === "lost" ? LOSS : PUSH, t.id);
}

// "+$80", "-$300", "$0"
export function pnlText(t: Pick<Trade, "status" | "pnl" | "amount">) {
  const pnl = t.pnl ?? (t.status === "lost" ? -t.amount : 0);
  return pnl > 0 ? `+$${pnl.toLocaleString()}` : pnl < 0 ? `-$${Math.abs(pnl).toLocaleString()}` : "$0";
}
