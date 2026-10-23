# Chog League — context for Claude Code

Chogathon 2026 entry (chogathon.chog.xyz). Hackathon rule: the Chog NFT must be essential.
Judging: Novelty 30%, Fun 20%, Retention 20%, Clarity 15%, Execution 15%, $CHOG bonus.

## The game (inspired by Manic.trade's up/down trading)
- A Chog is a trading account. Holder picks market (BTC/ETH/SOL/MON), HIGHER or LOWER,
  duration (1/2/3/5 min), amount (presets $10–$100 or any whole $1–$500) and a payout multiplier
  (presets or any 1-decimal value 1x–5x, capped by level; target uses zFor(m) = invNorm(m/(1+m))).
- Bigger multiplier = bigger payout, but the target price is further away. Targets are set so
  win chance ≈ 1/(1+multiplier), using each market's recent 1-minute volatility (fair game).
- Cash out (`/api/trade/cashout`, `cashOutValue` in game.ts): close a live call early for chance-of-winning × payout × 0.98
  (sigma taken from the call's own target), not in the last 10 s, not in duels. Status 'cashed' = neither win nor loss.
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
- $CHOG shop + weekly prize (`src/lib/shop.ts` holds every price and address): titles 250, frames 500,
  victory animations 1,000 $CHOG, looks only, saved per token ID (tables purchases + loadouts).
  Buyer sends $CHOG to TREASURY 0x87F4…6ee5; `src/lib/payments.ts` checks the Transfer log on-chain
  (from = signed-in wallet, to = treasury, amount ≥ price); each tx hash buys one item once.
  Weekly prize = 2,000 + 70% of that week's sales; 30% burned by Guzman when paying. He records
  payments in the Supabase `payouts` table (week = Monday date, paid_tx, burn_tx) → "Paid ✓"/"burned ✓"
  links in the Hall of Champions. Trading and duels stay demo money; never add real-money wagering.
- Chip in (`/api/chipin`, table chipins): any signed-in wallet sends $CHOG to TREASURY; 100% added to that
  week's prize. Tip the champion (`/api/tips`, table tips): $CHOG goes straight to the reigning champion
  Chog's current owner. Each tx hash counts once across purchases/chipins/tips (`paymentUsed`).
- Holders (owner wallet ≥ 10,000 $CHOG): 💜 badge on their Chogs + 20% off shop items (server re-checks
  balance + amount paid). Constants in `src/lib/shop.ts`. Champions logic lives in `src/lib/champions.ts`.
- Background music: 🎵 button (off by default), original loop `public/music/chog-loop.wav` made by
  `npx tsx scripts/make-music.ts`; player in `src/lib/sound.ts` (Web Audio, seamless loop, pauses when tab hidden).
- Local testing without network: `CHOG_FAKE_PRICES=1` makes up prices (ignored on Vercel).
- `src/middleware.ts` sets the practice cookie on first page load (prevents duplicate practice IDs).
- Practice mode: anyone, any Chog, no wallet; never counts toward records or the league.
  Practice board: `/api/leaderboard/practice` (per practice ID + Chog, min 3 finished calls, shown as "Player <hash>"
  or a nickname from `/api/practice/name`, table practice_names, always with its #hash tag),
  League | Practice switch in Leaderboard.tsx (opens on Practice while the league is empty).
- Duels (`src/lib/duels.ts`): Quick/Bo3/Bo5 rounds (hidden picks, 20s window, $100-scored picks)
  and Arena 15m/1h/24h ($1,000 bankroll). Equal stakes from weekly/practice balance, winner takes all,
  max stake = half balance, max 3 league duels/week per pair, bot duels practice-only.
  Lobby = `presence` table. Duels advance lazily on read with a version check.

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
- APIs: `/api/shop`, `/api/loadouts`, `/api/chipin`, `/api/tips`, `/api/champions`, `/api/trade`, `/api/chog/[id]/stats`, `/api/leaderboard`, `/api/price`, `/api/auth`,
  `/api/duels`, `/api/duels/[id]`, `/api/presence`
- UI: `src/components/*`, page in `src/app/page.tsx`

## Collection facts (verified on-chain Oct 14)
- 1,969 Chogs. Metadata on IPFS; Pinata gateway works, public gateways often return 429.
- Art is shuffled: token ID 1 → `1462.json` → name "CHOG #1462". Show name and token ID.

## Rules
- Before any trade, re-check `ownerOf(tokenId)` equals the signed-in wallet (done in /api/trade).
- Never trust prices or limits from the browser.
