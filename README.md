# Chog League

A paper-trading league where your Chog is the trader and its track record lives with the NFT.

Built for Chogathon 2026.

## What works right now

- Connect a browser wallet (MetaMask, Rabby, Backpack) on Monad mainnet and see your Chogs
- Sign in once (free signature) and trade with your Chog: HIGHER or LOWER on BTC, ETH, SOL or MON,
  1–5 minutes, $10–$100 demo, 1x–5x payout multiplier, live prices
- Trades settle automatically at the exchange's closing price
- Your Chog levels up with net wins and unlocks bigger multipliers; its record stays with the NFT
- Weekly league: every Chog starts the week with $1,000; leaderboard resets Monday 00:00 UTC
- Spectate any Chog by token ID

Trades are saved in the `data` folder on your computer for now.

## Run it on your computer (Windows)

1. Install **Node.js LTS** from https://nodejs.org (accept the defaults).
2. Unzip this folder somewhere easy, e.g. `Documents\chog-league`.
3. In VS Code: **File → Open Folder** → pick the `chog-league` folder.
4. Open the terminal: **Terminal → New Terminal**.
5. Run these two commands, one at a time:

   ```
   npm install
   npm run dev
   ```

6. Open http://localhost:3000 in your browser.
7. Type a Chog token ID and press **Load Chog**.

To stop the app, click in the terminal and press `Ctrl + C`.

## Settings (optional)

Copy `.env.example` to a new file called `.env.local` to change the RPC or the Chog contract address.

## Project map

| File | What it does |
| --- | --- |
| `src/lib/game.ts` | Game rules: markets, multipliers, levels, weekly balance |
| `src/lib/prices.ts` | Live and closing prices (Coinbase) |
| `src/lib/chog.ts` | Contract addresses and Chog types |
| `src/app/api/*` | Server endpoints: trade, stats, leaderboard, sign-in |
| `src/components/*` | Screens: trade panel, Chog card, positions, leaderboard |
| `src/app/page.tsx` | The home screen |

## Next up

- Move storage to an online database (Supabase) and put the app online (Vercel)
- $CHOG entry/prize for the bonus
- Chog vs Chog duels
