"use client";

// Shift work — its own door.
//
// A traveller's problem is one flight and a fixed number of days. A shift
// worker's is a rotation: nights, a daytime job, a school pickup, and no way
// to phase-advance a clock that has to be awake at 03:00 tomorrow. It was a
// mode inside the travel view, which made both products look like the same
// product with a different dataset; it has its own surface now.
//
// The clock is the same dial, and the numbers come from the same model — the
// week is a seed (a shift week is a life, not a formula) and the clock is
// computed from it.

import { useState } from "react";
import Link from "next/link";
import { ShiftScreen } from "@/components/dial/ShiftScreen";
import { DisclosureSheet } from "@/components/dial/DisclosureSheet";
import { BottomNav } from "@/components/BottomNav";

export default function ShiftPage() {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <main className="root">
      <div style={{ padding: "18px 0 8px" }}>
        <div className="dial-head">
          <h1 className="page-title" style={{ fontSize: "var(--text-2xl)" }}>
            Meridian for shift work
          </h1>
          <div className="dial-actions">
            <Link href="/" className="dial-btn">
              Travelling instead?
            </Link>
            <button
              type="button"
              className="dial-btn"
              onClick={() => setSheetOpen(true)}
            >
              What Meridian is, and is not
            </button>
          </div>
        </div>
        <p className="dial-sub" style={{ marginTop: 8 }}>
          A week of nights, days and days off. The crew holds a stable anchor
          sleep window rather than trying to flip your clock, and the dial says
          how much of that gap a week of cues can actually close.
        </p>
      </div>
      <ShiftScreen />
      <DisclosureSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <BottomNav />
    </main>
  );
}
