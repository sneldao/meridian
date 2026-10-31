"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { DisclosureSheet } from "@/components/dial/DisclosureSheet";

/* The surfaces outside the three tabs — the app's back rooms. One list,
 *  shared by the phone's More tab and the desktop secondary pages, so no
 *  page needs to remember what the others are called, and every surface is
 *  one hop from every other instead of funneling back through Today. */
const PLACES = [
  { href: "/crew", label: "AI at work", note: "watch the crew build the plan" },
  { href: "/shift", label: "Shift work", note: "a week of nights, not a flight" },
  { href: "/team", label: "Team view", note: "twelve crews, one stream" },
  { href: "/arrival", label: "Rate my trip", note: "the morning after, scored" },
] as const;

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
      <div role="dialog" aria-modal="true" aria-label="More" className="more-sheet">
        <nav aria-label="More places">
          {PLACES.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              transitionTypes={["nav-forward"]}
              onClick={onClose}
              className="more-sheet-item"
            >
              <span>{p.label}</span>
              <small>{p.note}</small>
            </Link>
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
  return (
    <>
      <button
        type="button"
        className={className}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        {children ?? "More"}
      </button>
      <MoreSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
