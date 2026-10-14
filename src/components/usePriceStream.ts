"use client";

import { useEffect, useRef, useState } from "react";
import type { Market } from "@/lib/game";

const PRODUCT: Record<Market, string> = { BTC: "BTC-USD", ETH: "ETH-USD", SOL: "SOL-USD", MON: "MON-USD" };
const WINDOW_MS = 120_000; // the chart shows the last 2 minutes

export type Tick = { t: number; p: number };

// Live price for the chart, straight from Coinbase's public feed in the browser.
// Display only: the server decides every entry and result with its own prices.
// Falls back to asking our server every 2s if the live feed can't connect.
export function usePriceStream(market: Market) {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const buffer = useRef<Tick[]>([]);
  const lastMsg = useRef(0);

  useEffect(() => {
    buffer.current = [];
    setTicks([]);
    lastMsg.current = 0;
    let ws: WebSocket | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let alive = true;

    const push = (p: number, t = Date.now()) => {
      if (!Number.isFinite(p) || p <= 0) return;
      lastMsg.current = Date.now();
      const b = buffer.current;
      const last = b[b.length - 1];
      if (last && t - last.t < 250) last.p = p; // keep at most ~4 points a second
      else b.push({ t, p });
      while (b.length && b[0].t < Date.now() - WINDOW_MS) b.shift();
    };

    const startPolling = () => {
      if (poll) return;
      const load = () =>
        fetch(`/api/price?m=${market}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((d) => alive && push(d.price))
          .catch(() => {});
      load();
      poll = setInterval(load, 2000);
    };

    // Seed the chart with the server's latest price straight away.
    fetch(`/api/price?m=${market}`, { cache: "no-store" }).then((r) => r.json()).then((d) => alive && d.price && push(d.price)).catch(() => {});

    try {
      ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
      ws.onopen = () => ws?.send(JSON.stringify({ type: "subscribe", product_ids: [PRODUCT[market]], channels: ["ticker"] }));
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data);
          if (m.type === "ticker" && m.product_id === PRODUCT[market]) push(Number(m.price));
        } catch {
          // ignore malformed messages
        }
      };
      ws.onerror = () => startPolling();
      ws.onclose = () => alive && startPolling();
    } catch {
      startPolling();
    }

    // If the feed goes quiet (blocked network, sleepy tab), poll instead.
    const watchdog = setInterval(() => {
      if (Date.now() - lastMsg.current > 6000) startPolling();
    }, 3000);

    // Re-render a few times a second, not on every tick.
    const flush = setInterval(() => {
      const b = buffer.current;
      if (b.length) setTicks([...b]);
    }, 300);

    return () => {
      alive = false;
      ws?.close();
      if (poll) clearInterval(poll);
      clearInterval(watchdog);
      clearInterval(flush);
    };
  }, [market]);

  return { ticks, price: ticks.length ? ticks[ticks.length - 1].p : null };
}
