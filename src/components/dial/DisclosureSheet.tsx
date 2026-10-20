"use client";

// The disclosure.
//
// "What Meridian is, and is not" is not a footnote. It says the medical
// boundary, what the papers do and do not support, and what happens to the
// traveller's data — in plain words, before the first plan.
//
// It lives here, on its own, because it has to be reachable from everywhere:
// a traveller who never opens the five-step setup must still be able to read
// it, so the app's menu opens this sheet too.

import { useEffect, useRef } from "react";
import { useFocusTrap } from "@/lib/a11y";

export interface DisclosureSheetProps {
  open: boolean;
  onClose: () => void;
}

export function DisclosureSheet({ open, onClose }: DisclosureSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="sheet-backdrop"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(12, 10, 8, 0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 61,
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="What Meridian is, and is not"
        className="dial"
        style={{ maxWidth: 520, width: "100%", maxHeight: "85vh", overflow: "auto" }}
      >
        <h3 className="dial-title">What Meridian is, and is not</h3>
        <div className="dac-evidence">
          <p>
            <b>What it is.</b> A deterministic circadian timing planner. It reads
            your sleep baseline, your calendar and the literature, and places
            the light and the dark so your body clock has somewhere to go. Every
            number it shows is computed by a model, and the model is the same
            one the crew&apos;s plans are judged against.
          </p>
          <p>
            <b>What it is not.</b> Not a medical device. It does not diagnose
            anything, it does not measure your melatonin phase directly, and it
            never recommends a supplement, a medicine or a dose — the crew
            advises on <i>when</i>, never on <i>how much</i>. It cannot tell you
            whether you are fit to drive.
          </p>
          <p>
            <b>What the papers mean.</b> The studies behind each step support
            the mechanism. They do not validate Meridian&apos;s own arithmetic,
            and the number on the dial is an estimate with an uncertainty band,
            not a measurement.
          </p>
          <p>
            <b>What happens to your data.</b> Your trip, calendar and answers are
            kept in this browser so your plan is there when you come back. If
            the deployment has persistence configured, the plan and your
            check-ins are also stored in the project&apos;s database. The
            wearable import is simulated in this build — nothing is read from a
            wearable.
          </p>
        </div>
        <div className="dial-actions">
          <button type="button" className="dial-btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
