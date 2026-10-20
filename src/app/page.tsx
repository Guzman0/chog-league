"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { CHOG_SUPPLY, type ChogData } from "@/lib/chog";
import { monad } from "@/lib/wagmi";
import { identityFor } from "@/lib/identity";
import WalletButton from "@/components/WalletButton";
import { fetchChog } from "@/components/MyChogs";
import { ChogBar, ChogRecord } from "@/components/ChogCard";
import TradePanel from "@/components/TradePanel";
import Leaderboard, { crownsFor, useChampions } from "@/components/Leaderboard";
import Landing from "@/components/Landing";
import ChogPicker from "@/components/ChogPicker";
import DuelLobby from "@/components/DuelLobby";
import DuelScreen from "@/components/DuelScreen";
import InviteBanner from "@/components/InviteBanner";
import { MusicToggle, SoundToggle } from "@/components/ui";
import { useSession } from "@/components/useSession";
import { useChogStats } from "@/components/useChogStats";
import { useDuels, usePresence } from "@/components/useDuels";
import ShopPanel from "@/components/Shop";
import { useShop } from "@/components/useShop";
import type { Loadout } from "@/lib/shop";

type Mode = "league" | "practice";
type Tab = "trade" | "duel" | "league" | "shop";

export default function Home() {
  const { address, isConnected, chainId } = useAccount();
  const session = useSession();
  const [chog, setChog] = useState<ChogData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [boardKey, setBoardKey] = useState(0);
  const [mode, setMode] = useState<Mode>("practice");
  const [tab, setTab] = useState<Tab>("trade");
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const champions = useChampions();
  const shop = useShop(chog?.tokenId);
  const [preview, setPreview] = useState<Loadout>({}); // shop "try on", never saved
  useEffect(() => setPreview({}), [chog?.tokenId]);

  const isMine = !!(chog && address && chog.owner.toLowerCase() === address.toLowerCase());
  const onMonad = isConnected && chainId === monad.id;

  // Owners default to the real league (unless they picked practice); everyone else can only practice.
  const wantMode = useRef<Mode | null>(null);
  useEffect(() => {
    setMode(isMine ? wantMode.current ?? "league" : "practice");
  }, [isMine, chog?.tokenId]);
  const changeMode = (m: Mode) => {
    wantMode.current = m;
    setMode(m);
  };

  // Remember the open Chog, tab and mode in the web address, so a refresh
  // (or a shared link) comes straight back here: /?chog=1462&tab=shop
  const restored = useRef(false);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const id = q.get("chog");
    const t = q.get("tab") as Tab | null;
    if (q.get("mode") === "practice") wantMode.current = "practice";
    if (id && /^\d+$/.test(id) && Number(id) >= 1 && Number(id) <= CHOG_SUPPLY) {
      load(id, t && ["trade", "duel", "league", "shop"].includes(t) ? t : "trade").finally(() => (restored.current = true));
    } else restored.current = true;
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    const q = new URLSearchParams(window.location.search);
    ["chog", "tab", "mode"].forEach((k) => q.delete(k));
    if (chog) {
      q.set("chog", chog.tokenId);
      if (tab !== "trade") q.set("tab", tab);
      if (isMine && mode === "practice") q.set("mode", "practice");
    }
    const url = `${window.location.pathname}${q.toString() ? `?${q}` : ""}${window.location.hash}`;
    if (url !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", url);
  }, [chog, tab, mode, isMine]);

  // Connecting a wallet with no Chog picked yet opens the Chog picker.
  useEffect(() => {
    if (onMonad && !chog) setPicker(true);
  }, [onMonad]); // eslint-disable-line react-hooks/exhaustive-deps

  // Who wears the crown (league #1), for every screen.
  useEffect(() => {
    let alive = true;
    const load = () => fetch("/api/leaderboard", { cache: "no-store" }).then((r) => r.json()).then((d) => alive && setLeaderId(d.rows?.[0]?.tokenId ?? null)).catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [boardKey]);

  const league = useChogStats(chog?.tokenId);
  const practice = useChogStats(chog?.tokenId, true);
  const active = mode === "practice" ? practice : league;

  // Duels: practice with any Chog, or the league with your own (signed in).
  const canPlayLeague = isMine && session.signedIn;
  const canDuel = !!chog && (mode === "practice" || canPlayLeague);
  const duels = useDuels(true);
  usePresence(chog, mode, canDuel);
  const [shownDuel, setShownDuel] = useState<string | null>(null);
  useEffect(() => {
    if (duels.active) {
      setShownDuel(duels.active.id);
      setTab("duel");
    }
  }, [duels.active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = duels.duels.find((d) => d.id === shownDuel);
  // Home market + power, read from the Chog's own traits.
  const identity = chog ? identityFor(chog.tokenId, chog.traits) : null;
  const duelMaxMult = shown?.mode === "league" ? league.stats?.summary.level.maxMultiplier ?? 1.5 : 5;

  async function load(id: string, openTab: Tab = "trade") {
    setLoading(true);
    setErr(null);
    try {
      setChog(await fetchChog(id));
      setPicker(false);
      setTab(openTab);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function select(c: ChogData) {
    wantMode.current = null;
    setChog(c);
    setErr(null);
    setPicker(false);
    setTab("trade");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function refreshAll() {
    active.refresh();
    if (mode === "league") setBoardKey((k) => k + 1);
  }

  const signInCard = (
    <section className="panel text-center">
      <h3 className="mb-2 text-2xl">Sign in to play the league</h3>
      <p className="mx-auto mb-4 max-w-md text-sm text-[var(--muted)]">Sign a short message to prove this wallet owns the Chog. It&apos;s free and sends no transaction.</p>
      <button type="button" onClick={session.signIn} disabled={session.busy} className="btn btn-primary px-6 py-3 text-lg">
        {session.busy ? "Check your wallet…" : "Sign in with wallet"}
      </button>
      {session.error && <p className="mt-3 text-sm font-extrabold text-[var(--red)]">{session.error}</p>}
    </section>
  );

  const duelBadge = duels.invites.length > 0 || !!duels.active;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-5 sm:pt-7">
      <header className="mb-6 flex items-center justify-between gap-2">
        <button type="button" onClick={() => setChog(null)} className="wordmark whitespace-nowrap text-[1.2rem] min-[380px]:text-[1.4rem] sm:text-4xl" aria-label="Chog League home">
          Chog League
        </button>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <MusicToggle />
          <SoundToggle />
          <WalletButton />
        </div>
      </header>

      {!chog ? (
        <div className="space-y-12">
          <Landing onPractice={() => load(String(1 + Math.floor(Math.random() * CHOG_SUPPLY)))} loading={loading} />
          {err && <p className="text-center text-sm font-extrabold text-[var(--red)]">{err}</p>}
          <div className="mx-auto max-w-2xl">
            <Leaderboard onSelect={select} refreshKey={boardKey} champions={champions} />
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <ChogBar
            chog={chog}
            identity={identity!}
            powerUsed={active.stats?.summary.powerUsedToday}
            crowns={crownsFor(champions, chog.tokenId)}
            isMine={isMine}
            mode={mode}
            summary={active.stats?.summary}
            lastSettled={active.stats?.history[0]}
            crowned={leaderId === chog.tokenId}
            onSwitch={() => setPicker(true)}
            onMode={changeMode}
            leagueLocked={!isMine}
            loadout={tab === "shop" ? { ...shop.loadout, ...preview } : shop.loadout}
          />

          <nav className="flex gap-1.5 sm:gap-2" aria-label="Sections">
            {([
              ["trade", "📈 Trade"],
              ["duel", "⚔️ Duel"],
              ["league", "👑 League"],
              ["shop", "✨ Shop"],
            ] as [Tab, string][]).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-current={tab === k ? "page" : undefined}
                className={`btn relative flex-1 whitespace-nowrap px-1 py-2.5 text-[13px] sm:flex-none sm:px-7 sm:text-base ${tab === k ? "btn-banana" : "btn-ghost"}`}
              >
                {label}
                {k === "duel" && duelBadge && <span className="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full border-2 border-[var(--ink)] bg-[var(--red)]" aria-label="Duel waiting" />}
              </button>
            ))}
          </nav>

          {tab === "trade" &&
            (mode === "league" && !canPlayLeague ? (
              signInCard
            ) : (
              <TradePanel
                key={`${chog.tokenId}-${mode}`}
                practice={mode === "practice"}
                tokenId={chog.tokenId}
                identity={identity!}
                summary={active.stats?.summary}
                chogImage={chog.image}
                chogName={chog.name}
                open={active.stats?.open ?? []}
                history={active.stats?.history ?? []}
                onTraded={refreshAll}
              />
            ))}

          {tab === "duel" &&
            (shownDuel ? (
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
            ) : canDuel ? (
              <DuelLobby chog={chog} mode={mode} balance={active.stats?.summary.weekBalance ?? 0} outgoing={duels.outgoing} onChanged={duels.refresh} />
            ) : (
              signInCard
            ))}

          {tab === "shop" && (
            <ShopPanel
              chog={chog}
              shop={shop}
              isMine={isMine}
              signedIn={session.signedIn}
              onSignIn={session.signIn}
              signingIn={session.busy}
              preview={preview}
              setPreview={setPreview}
            />
          )}

          {tab === "league" && (
            <div className="grid gap-6 lg:grid-cols-2">
              <ChogRecord chog={chog} identity={identity!} crowns={crownsFor(champions, chog.tokenId)} summary={league.stats?.summary} duelRecord={league.stats?.duels} />
              <Leaderboard onSelect={select} refreshKey={boardKey} onLeader={setLeaderId} champions={champions} />
            </div>
          )}
        </div>
      )}

      <footer className="mt-16 text-center text-xs text-[var(--muted)]">
        Made for Chogathon 2026. Trading and duels use demo money only. The shop and the weekly prize use real $CHOG on Monad.
      </footer>

      <ChogPicker open={picker} onClose={() => setPicker(false)} onSelect={select} onLoadId={load} leaderId={leaderId} loading={loading} error={err} />
      <InviteBanner invites={duels.invites} onChanged={duels.refresh} />
    </main>
  );
}
