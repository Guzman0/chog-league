"use client";

import { useEffect, useState } from "react";
import { isMuted, onMutedChange, setMuted } from "@/lib/sound";

export function Pill({
  on, onClick, children, disabled, title,
}: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean; title?: string }) {
  return (
    <button type="button" className="pill" aria-pressed={on} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

// A small "type your own" box that sits next to the preset pills.
// Reports the number when it's valid, or null while it isn't (so trading is blocked).
export function CustomNumber({
  value, presets, onChange, prefix = "", suffix = "", decimals = 0, min, max, label,
}: {
  value: number | null;
  presets: number[];
  onChange: (n: number | null) => void;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  min: number;
  max: number;
  label: string;
}) {
  const [text, setText] = useState("");
  // Clicking a preset clears the box.
  useEffect(() => {
    if (value !== null && presets.includes(value) && Number(text) !== value) setText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const n = Number(text);
  const tooPrecise = text.includes(".") && (text.split(".")[1]?.length ?? 0) > decimals;
  const invalid = text !== "" && (!Number.isFinite(n) || n < min || n > max || tooPrecise);
  const custom = text !== "" && !invalid && !presets.includes(n);
  const hint = tooPrecise ? (decimals ? `Use up to ${decimals} decimal` : "Whole numbers only") : `${prefix}${min} to ${prefix}${max}${suffix}`;

  return (
    <>
      <label className="pill flex items-center gap-0.5 focus-within:outline-2 focus-within:outline-[var(--sky)]" aria-pressed={custom} style={invalid ? { borderColor: "var(--red)" } : undefined}>
        {prefix && <span aria-hidden="true">{prefix}</span>}
        <input
          value={text}
          onChange={(e) => {
            const raw = e.target.value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, "");
            setText(raw);
            const v = Number(raw);
            const ok = raw !== "" && Number.isFinite(v) && v >= min && v <= max && !(raw.includes(".") && (raw.split(".")[1]?.length ?? 0) > decimals);
            onChange(ok ? v : raw === "" ? presets[0] : null);
          }}
          inputMode={decimals ? "decimal" : "numeric"}
          placeholder="Custom"
          aria-label={label}
          style={{ width: text ? `${text.length + 0.6}ch` : "4.2rem" }}
          className="bg-transparent text-inherit outline-none placeholder:text-[var(--muted)]"
        />
        {suffix && text && <span aria-hidden="true">{suffix}</span>}
      </label>
      {invalid && <span className="w-full text-xs font-extrabold text-[var(--red)]">{hint}</span>}
    </>
  );
}

// A small reminder that a number is play money.
export function Demo() {
  return (
    <span className="ml-1 inline-block rounded-md border-2 border-[var(--ink)] bg-[var(--sky)] px-1 align-middle text-[10px] font-black uppercase leading-4 tracking-wide text-[var(--ink)]" title="Demo money only. No real funds are ever used.">
      demo
    </span>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function SoundToggle() {
  const [muted, set] = useState(false);
  useEffect(() => {
    set(isMuted());
    const off = onMutedChange(set);
    return () => {
      off();
    };
  }, []);
  return (
    <button type="button" className="btn btn-ghost h-10 w-10 text-lg" onClick={() => setMuted(!muted)} aria-label={muted ? "Turn sound on" : "Mute sound"} title={muted ? "Sound off" : "Sound on"}>
      {muted ? "🔇" : "🔊"}
    </button>
  );
}
