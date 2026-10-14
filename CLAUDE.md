# Chog League — context for Claude Code

Chogathon 2026 entry (chogathon.chog.xyz). Hackathon rule: the Chog NFT must be essential.
Judging: Novelty 30%, Fun 20%, Retention 20%, Clarity 15%, Execution 15%, $CHOG bonus.

## The game (inspired by Manic.trade's up/down trading)
- A Chog is a trading account. Holder picks market (BTC/ETH/SOL/MON), HIGHER or LOWER,
  duration (1/2/3/5 min), amount (presets $10–$100 or any whole $1–$500) and a payout multiplier
  (presets or any 1-decimal value 1x–5x, capped by level; target uses zFor(m) = invNorm(m/(1+m))).
- Bigger multiplier = bigger payout, but the target price is further away. Targets are set so
  win chance ≈ 1/(1+multiplier), using each market's recent 1-minute volatility (fair game).
- Level = career net wins (wins − losses). Levels unlock bigger multipliers (L1 1.5x … L5 5x).
- Weekly league: every Chog starts each week (Monday 00:00 UTC) with $1,000 demo; ranked by balance.
- Everything is stored against the Chog's **token ID, never the wallet**, so level and record
  transfer when the NFT is sold.
- The Chog reacts on its picture: bounce + confetti on wins, shake + grey on losses, 🔥/🥶 streaks,
  👑 crown for the weekly league #1.
- Chog identity (`src/lib/identity.ts`, from its own traits): home market from Background colour
  (+1x multiplier cap there) and one power from Eyes, once per UTC day: Shield (loss doesn't drop level),
  Double Up (win counts 2 for level), Parachute (half stake back on loss, half profit on win).
  All EV-neutral; level = sum of levelPoints(). Powers stored in trades.power (Supabase column). Not used in duels.
- League extras: live reset countdown, Hall of Champions (`/api/champions`, #1 of each finished week,
  cached 5 min), 👑×N crowns on the Chog, daily play streak (dayStreak in summarize).
- Local testing without network: `CHOG_FAKE_PRICES=1` makes up prices (ignored on Vercel).
- `src/middleware.ts` sets the practice cookie on first page load (prevents duplicate practice IDs).
- Practice mode: anyone, any Chog, no wallet; never counts toward records or the league.
- Duels (`src/lib/duels.ts`): Quick/Bo3/Bo5 rounds (hidden picks, 20s window, $100-scored picks)
  and Arena 15m/1h/24h ($1,000 bankroll). Equal stakes from weekly/practice balance, winner takes all,
  max stake = half balance, max 3 league duels/week per pair, bot duels practice-only.
  Lobby = `presence` table. Duels advance lazily on read with a version check.

## The builder
Guzman is new to coding. Explain changes in plain words, keep steps small, and give
exact Windows / VS Code terminal commands when he needs to run something.

## Stack
- Next.js 15 (App Router, TypeScript, Tailwind v4), wagmi v2 + viem (browser wallet only)
- Monad mainnet, chain ID 143, RPC https://rpc.monad.xyz
- Chog Genesis NFT: 0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763 · $CHOG: 0x350035555E10d9AfAF1566AaebfCeD5BA6C27777
- Prices: Coinbase public API (server-side only). Entry = ticker; settlement = close of the
  1-minute candle ending at expiry (trades expire on whole minutes). Pyth Hermes now needs a key.
- Storage: Supabase (tables in `supabase/schema.sql`) when SUPABASE_URL + SUPABASE_SECRET_KEY are set;
  otherwise a local file `data/chog-league.json`. Same functions either way (`src/lib/store.ts`).
- Live at https://chog-league.vercel.app (Vercel redeploys on every push to main).
- Coinbase's CDN caches identical candle URLs for 5 min: always end candle ranges at "now".
- Sign-in: wallet signs a message → HMAC cookie (`src/lib/session.ts`). Set SESSION_SECRET in production.

## Where things live
- Rules and numbers: `src/lib/game.ts`
- Prices: `src/lib/prices.ts` · settlement: `src/lib/settle.ts`
- APIs: `/api/trade`, `/api/chog/[id]/stats`, `/api/leaderboard`, `/api/price`, `/api/auth`,
  `/api/duels`, `/api/duels/[id]`, `/api/presence`
- UI: `src/components/*`, page in `src/app/page.tsx`

## Collection facts (verified on-chain Oct 14)
- 1,969 Chogs. Metadata on IPFS; Pinata gateway works, public gateways often return 429.
- Art is shuffled: token ID 1 → `1462.json` → name "CHOG #1462". Show name and token ID.

## Rules
- Before any trade, re-check `ownerOf(tokenId)` equals the signed-in wallet (done in /api/trade).
- Never trust prices or limits from the browser.
