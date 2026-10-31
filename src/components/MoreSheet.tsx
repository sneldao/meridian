"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { DisclosureSheet } from "@/components/dial/DisclosureSheet";
import { useMorphTransition } from "@/lib/use-morph-transition";

/* The surfaces outside the two tabs — grouped by what they are, so the nav
 *  reads as a story instead of a feature list. One shared structure for the
 *  phone's More sheet, the desktop headers and the home Menu: every surface
 *  gets exactly one name and one entry.
 *
 *  "Rate my trip" is deliberately not here — the payoff lives on the trip it
 *  belongs to: the Trips surface links each journey to its arrival report,
 *  and Today surfaces it the morning after landing. */
export interface Place { href: string; label: string; note: string }
export interface PlaceGroup { label: string; places: readonly Place[] }

export const PLACE_GROUPS: readonly PlaceGroup[] = [
  {
    label: "Inside Meridian",
    places: [{ href: "/crew", label: "AI at work", note: "watch the crew build the plan" }],
  },
  {
    label: "The same engine, other lives",
    places: [
      { href: "/shift", label: "Shift work", note: "a week of nights, not a flight" },
      { href: "/team", label: "Team view", note: "twelve crews, one stream" },
    ],
  },
];

/** Flat form, for consumers that just need the destinations. */
export const PLACES = PLACE_GROUPS.flatMap((g) => g.places);

export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [disclosure, setDisclosure] = useState(false);

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
    <>
      <div
        className="more-sheet-backdrop"
        role="presentation"
        onClick={onClose}
      />
      <div role="dialog" aria-modal="true" aria-label="More" className="more-sheet vt-morph-more">
        <nav aria-label="More places">
          {PLACE_GROUPS.map((g) => (
            <div key={g.label}>
              <p className="more-sheet-label">{g.label}</p>
              {g.places.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  transitionTypes={["nav-forward"]}
                  data-place={p.href.slice(1)}
                  className="more-sheet-item"
                >
                  <span>{p.label}</span>
                  <small>{p.note}</small>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <button
          type="button"
          className="more-sheet-item"
          onClick={() => setDisclosure(true)}
        >
          <span>What Meridian is, and is not</span>
        </button>
        <p className="more-sheet-note">Timing guidance, not medical advice.</p>
      </div>
      <DisclosureSheet open={disclosure} onClose={() => setDisclosure(false)} />
    </>
  );
}

/** A button that opens the shared More sheet. Secondary pages render it in
 *  their header — hidden on the phone, where the tab bar's More tab does the
 *  same job — so no page is stranded on the desktop. */
export function MoreNav({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const morph = useMorphTransition();
  return (
    <>
      <button
        type="button"
        className={`${className ?? ""}${open ? "" : " vt-morph-more"}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => morph(() => setOpen((v) => !v))}
      >
        {children ?? "More"}
      </button>
      <MoreSheet open={open} onClose={() => morph(() => setOpen(false))} />
    </>
  );
}
