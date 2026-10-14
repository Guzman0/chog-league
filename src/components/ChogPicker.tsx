"use client";

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { CHOG_SUPPLY, type ChogData } from "@/lib/chog";
import { monad } from "@/lib/wagmi";
import MyChogs from "./MyChogs";

// Pick which Chog to play with: one of yours, a random one, or any token ID.
export default function ChogPicker({
  open, onClose, onSelect, onLoadId, leaderId, loading, error,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (c: ChogData) => void;
  onLoadId: (id: string) => void;
  leaderId: string | null;
  loading: boolean;
  error: string | null;
}) {
  const { address, isConnected, chainId } = useAccount();
  const [id, setId] = useState("");
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} onClose={onClose} className="panel m-auto w-[min(94vw,640px)] text-[var(--text)] backdrop:bg-black/60">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-2xl">Pick a Chog</h3>
        <button type="button" className="btn btn-ghost h-9 w-9" onClick={onClose} aria-label="Close">✕</button>
      </div>

      {isConnected && chainId === monad.id && address ? (
        <MyChogs address={address} onSelect={onSelect} leaderId={leaderId} />
      ) : (
        <p className="mb-5 text-sm text-[var(--muted)]">Connect the wallet that holds your Chog to see it here.</p>
      )}

      <button type="button" className="btn btn-banana mb-5 w-full py-3" disabled={loading} onClick={() => onLoadId(String(1 + Math.floor(Math.random() * CHOG_SUPPLY)))}>
        🎲 Random Chog for practice
      </button>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (id) onLoadId(id);
        }}
      >
        <label htmlFor="chog-id" className="label block">Or open any Chog by token ID</label>
        <div className="flex gap-2">
          <input
            id="chog-id"
            value={id}
            onChange={(e) => setId(e.target.value.replace(/\D/g, ""))}
            placeholder={`1 to ${CHOG_SUPPLY}`}
            inputMode="numeric"
            className="min-w-0 flex-1 rounded-xl border-2 border-[var(--ink)] bg-[var(--panel-2)] px-4 py-2.5 font-extrabold outline-none focus:border-[var(--sky)]"
          />
          <button className="btn btn-primary px-5" disabled={loading || !id}>{loading ? "Opening…" : "Open"}</button>
        </div>
        {error && <p className="mt-3 text-sm font-extrabold text-[var(--red)]">{error}</p>}
      </form>
    </dialog>
  );
}
