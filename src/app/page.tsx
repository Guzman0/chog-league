"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { CHOG_SUPPLY, type ChogData } from "@/lib/chog";
import { monad } from "@/lib/wagmi";
import WalletButton from "@/components/WalletButton";
import MyChogs, { fetchChog } from "@/components/MyChogs";
import ChogCard from "@/components/ChogCard";
import TradePanel from "@/components/TradePanel";
import Positions from "@/components/Positions";
import Leaderboard from "@/components/Leaderboard";
import { useSession } from "@/components/useSession";
import { useChogStats } from "@/components/useChogStats";
import DuelLobby from "@/components/DuelLobby";
import DuelScreen from "@/components/DuelScreen";
import InviteBanner from "@/components/InviteBanner";
import { useDuels, usePresence } from "@/components/useDuels";

type Mode = "league" | "practice";

export default function Home() {
  const { address, isConnected, chainId } = useAccount();
  const session = useSession();
  const [tokenId, setTokenId] = useState("");
  const [chog, setChog] = useState<ChogData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const [mode, setMode] = useState<Mode>("practice");
  const [leaderId, setLeaderId] = useState<string | null>(null);

  const isMine = !!(chog && address && chog.owner.toLowerCase() === address.toLowerCase());
  const onMonad = isConnected && chainId === monad.id;

  // Owners default to the real league; everyone else can only practice.
  useEffect(() => {
    setMode(isMine ? "league" : "practice");
  }, [isMine, chog?.tokenId]);

  const league = useChogStats(chog?.tokenId);
  const practice = useChogStats(chog?.tokenId, true);
  const active = mode === "practice" ? practice : league;

  // Duels: you can duel in practice with any Chog, or in the league with your own (signed in).
  const canDuel = !!chog && (mode === "practice" || (isMine && session.signedIn));
  const duels = useDuels(true);
  usePresence(chog, mode, canDuel);
  const [shownDuel, setShownDuel] = useState<string | null>(null);
  useEffect(() => {
    if (duels.active) setShownDuel(duels.active.id);
  }, [duels.active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = duels.duels.find((d) => d.id === shownDuel);
  const duelMaxMult = shown?.mode === "league" ? league.stats?.summary.level.maxMultiplier ?? 1.5 : 5;

  async function load(id: string) {
    setLoading(true);
    setErr(null);
    try {
      setChog(await fetchChog(id));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setChog(null);
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function randomChog() {
    load(String(1 + Math.floor(Math.random() * CHOG_SUPPLY)));
  }

  function select(c: ChogData) {
    setChog(c);
    setErr(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function traded() {
    active.refresh();
    if (mode === "league") setBoardKey((k) => k + 1);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Chog League</h1>
          <p className="text-sm text-[var(--muted)]">Your Chog is the trader. Its record lives with the NFT.</p>
        </div>
        <WalletButton />
      </header>

      {shownDuel && (
        <DuelScreen
          key={shownDuel}
          duelId={shownDuel}
          maxMultiplier={duelMaxMult}
          onClose={() => {
            setShownDuel(null);
            league.refresh();
            practice.refresh();
            setBoardKey((k) => k + 1);
          }}
        />
      )}

      {!chog && (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5 text-sm">
          <p className="mb-2 font-semibold">How it works</p>
          <ol className="list-decimal space-y-1 pl-5 text-[var(--muted)]">
            <li>Connect the wallet that holds your Chog.</li>
            <li>Call HIGHER or LOWER on BTC, ETH, SOL or MON with demo money, using live prices.</li>
            <li>Win and your Chog levels up, unlocking bigger multipliers. Its record stays with the NFT, even if you sell it.</li>
            <li>Top the weekly league. Every Chog starts each week with $1,000.</li>
          </ol>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button onClick={randomChog} disabled={loading} className="rounded-lg bg-[var(--purple)] px-4 py-2 font-semibold disabled:opacity-60">
              {loading ? "Loading…" : "🎲 No Chog? Practice with a random one"}
            </button>
            <span className="text-xs text-[var(--muted)]">No wallet needed for practice.</span>
          </div>
        </section>
      )}

      {onMonad && address && <MyChogs address={address} selectedId={chog?.tokenId} onSelect={select} leaderId={leaderId} />}

      {chog && (
        <ChogCard
          chog={chog}
          isMine={isMine}
          summary={league.stats?.summary}
          moodFrom={active.stats?.summary}
          lastSettled={active.stats?.history[0]}
          crowned={leaderId === chog.tokenId}
          duelRecord={league.stats?.duels}
        />
      )}

      {chog && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex rounded-lg border border-[var(--line)] p-1 text-sm">
            <Tab on={mode === "league"} disabled={!isMine} onClick={() => setMode("league")} title={isMine ? undefined : "Only this Chog's owner can trade in the league"}>
              League{!isMine && " 🔒"}
            </Tab>
            <Tab on={mode === "practice"} onClick={() => setMode("practice")}>Practice</Tab>
          </div>
          <button onClick={randomChog} disabled={loading} className="text-sm text-[var(--muted)] underline disabled:opacity-60">
            🎲 Random Chog
          </button>
        </div>
      )}

      {chog && mode === "practice" && <TradePanel practice tokenId={chog.tokenId} summary={practice.stats?.summary} onTraded={traded} />}

      {chog && mode === "league" && isMine && (
        session.signedIn ? (
          <TradePanel tokenId={chog.tokenId} summary={league.stats?.summary} onTraded={traded} />
        ) : (
          <section className="rounded-2xl border border-[var(--purple)] bg-[var(--panel)] p-6 text-center">
            <p className="mb-3 text-sm text-[var(--muted)]">Sign a message to prove this wallet is yours. It&apos;s free and sends no transaction.</p>
            <button onClick={session.signIn} disabled={session.busy} className="rounded-lg bg-[var(--purple)] px-5 py-3 font-semibold disabled:opacity-60">
              {session.busy ? "Check your wallet…" : "Sign in to trade"}
            </button>
            {session.error && <p className="mt-2 text-sm text-[var(--red)]">{session.error}</p>}
          </section>
        )
      )}

      {canDuel && chog && !duels.active && (
        <DuelLobby chog={chog} mode={mode} balance={active.stats?.summary.weekBalance ?? 0} outgoing={duels.outgoing} onChanged={duels.refresh} />
      )}

      {chog && active.stats && <Positions practice={mode === "practice"} open={active.stats.open} history={active.stats.history} />}

      <Leaderboard onSelect={select} refreshKey={boardKey} onLeader={setLeaderId} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (tokenId.trim()) load(tokenId.trim());
        }}
      >
        <label className="mb-2 block text-sm uppercase tracking-wide text-[var(--muted)]">Look up any Chog by token ID</label>
        <div className="flex gap-2">
          <input
            value={tokenId}
            onChange={(e) => setTokenId(e.target.value.replace(/\D/g, ""))}
            placeholder={`1 to ${CHOG_SUPPLY}`}
            inputMode="numeric"
            className="flex-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3 outline-none focus:border-[var(--purple)]"
          />
          <button disabled={loading} className="rounded-lg bg-[var(--purple)] px-5 py-3 font-semibold disabled:opacity-60">
            {loading ? "Loading…" : "Load Chog"}
          </button>
        </div>
        {err && <p className="mt-3 rounded-lg border border-[var(--red)] p-3 text-sm text-[var(--red)]">{err}</p>}
      </form>
      <InviteBanner invites={duels.invites} onChanged={duels.refresh} />
    </main>
  );
}

function Tab({ on, disabled, onClick, children, title }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} className={`rounded-md px-4 py-1.5 ${on ? "bg-[var(--purple)] font-semibold" : ""} disabled:opacity-50`}>
      {children}
    </button>
  );
}
