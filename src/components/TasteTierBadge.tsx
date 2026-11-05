"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { TasteTier } from "@/domain/taste";
import { tasteTierExplainer, tasteTierLabel } from "@/lib/taste-tier";

export interface TasteTierBadgeProps {
  /** The ladder rung that answered — the badge names it, never dresses it up. */
  tier: TasteTier;
  /** Epoch ms the answering data dates from — renders as "· HH:MM" on the
   *  tiers with an honest timestamp (live, cached). */
  resolvedAt?: number;
  /** The live rung was tried and fell — the badge says so inline. */
  liveUnavailable?: boolean;
  /** A real re-load path (the card's update action) — the live tier offers
   *  a refresh only when one exists, never a dead button. */
  onRefresh?: () => void;
}

/* §4b — the interactive tier badge. One tag naming which rung answered,
 *  pressable for the one-line explainer of what that rung means; Esc,
 *  click-away or a second press dismisses it. */
export function TasteTierBadge({
  tier,
  resolvedAt,
  liveUnavailable,
  onRefresh,
}: TasteTierBadgeProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <span className="tier-badge" data-tier={tier} ref={wrapRef}>
      <button
        type="button"
        className="tier-badge-btn"
        aria-expanded={open}
        aria-controls={popId}
        onClick={() => setOpen((v) => !v)}
      >
        {tasteTierLabel(tier, resolvedAt, liveUnavailable)}
      </button>
      {tier === "live" && onRefresh && (
        <button
          type="button"
          className="tier-badge-refresh"
          aria-label="Refresh this answer"
          onClick={onRefresh}
        >
          ↻
        </button>
      )}
      {open && (
        <span className="tier-badge-pop" id={popId} role="status">
          {tasteTierExplainer(tier, resolvedAt)}
        </span>
      )}
    </span>
  );
}
