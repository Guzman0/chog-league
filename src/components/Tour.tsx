"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

// A step-by-step guide: dims the page, lights up one control at a time and says
// what to do with it. Controls are found by their data-tour="…" attribute.
export type TourStep = { target: string; title: string; body: string; advanceOnClick?: boolean };

const KEY = "chog-tour-trade-v1";

export function tourSeen() {
  try {
    return localStorage.getItem(KEY) === "done";
  } catch {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(KEY, "done");
  } catch {}
}

type Box = { top: number; left: number; width: number; height: number };

export default function Tour({ steps, open, onClose }: { steps: TourStep[]; open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [vw, setVw] = useState(1024);
  const [vh, setVh] = useState(800);
  const step = steps[i];

  const close = useCallback(() => {
    markSeen();
    setI(0);
    onClose();
  }, [onClose]);
  const next = useCallback(() => (i + 1 < steps.length ? setI(i + 1) : close()), [i, steps.length, close]);

  // Bring the control into view, then keep the spotlight on it (layouts move as prices load).
  useLayoutEffect(() => {
    if (!open) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) {
      setBox(null);
      return;
    }
    const mobile = window.innerWidth < 640;
    const r0 = el.getBoundingClientRect();
    // On phones the guide card sits at the bottom, so put the control near the top.
    const want = mobile ? 76 : Math.max(80, (window.innerHeight - r0.height) / 2 - 60);
    window.scrollTo({ top: window.scrollY + r0.top - want, behavior: "smooth" });
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    measure();
    const id = setInterval(measure, 80);
    return () => clearInterval(id);
  }, [open, step]);

  // Some steps move on by themselves when you tap the lit-up control.
  useEffect(() => {
    if (!open || !step.advanceOnClick) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("button, input")) setTimeout(next, 450);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [open, step, next]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, next]);

  if (!open) return null;

  const pad = 6;
  const mobile = vw < 640;
  const cardW = Math.min(360, vw - 24);
  const below = box ? box.top + box.height + pad + 14 : 0;
  const placeBelow = box ? vh - below > 230 : true;
  const cardStyle: React.CSSProperties = mobile || !box
    ? { left: 12, right: 12, bottom: 12 }
    : {
        width: cardW,
        left: Math.min(Math.max(12, box.left), vw - cardW - 12),
        ...(placeBelow ? { top: below } : { bottom: vh - box.top + pad + 14 }),
      };

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" aria-live="polite">
      {/* The dimmed page with a hole over the control. Clicks pass through, so you can use it. */}
      {box ? (
        <div
          className="pointer-events-none fixed rounded-2xl border-[3px] border-[var(--banana)] transition-all duration-300"
          style={{
            top: box.top - pad,
            left: box.left - pad,
            width: box.width + pad * 2,
            height: box.height + pad * 2,
            boxShadow: "0 0 0 9999px rgba(12, 6, 32, 0.66), 0 0 22px rgba(255, 216, 77, 0.6)",
          }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-[rgba(12,6,32,0.66)]" />
      )}

      <div role="dialog" aria-label={step.title} className="panel pointer-events-auto fixed !p-4" style={cardStyle}>
        <p className="mb-1 text-xs font-black uppercase tracking-wide text-[var(--banana)]">
          Step {i + 1} of {steps.length}
        </p>
        <h3 className="mb-1 text-2xl leading-tight">{step.title}</h3>
        <p className="text-sm text-[var(--muted)]">{step.body}</p>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {steps.map((_, n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= i ? "bg-[var(--banana)]" : "bg-[var(--panel-2)]"}`} />
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <button type="button" onClick={close} className="text-xs font-extrabold text-[var(--muted)] underline">
            Skip guide
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="btn btn-ghost px-3 py-1.5 text-sm">
                Back
              </button>
            )}
            <button type="button" onClick={next} className="btn btn-banana px-4 py-1.5 text-sm">
              {i + 1 < steps.length ? "Next" : "Let's go"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
