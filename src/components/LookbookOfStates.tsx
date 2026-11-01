"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { gsap } from "gsap";
import { SunSelf } from "@/components/SunSelf";
import type { LookbookWindow } from "@/domain/lookbook";
import { demoLookbook } from "@/domain/lookbook";

/* The lookbook of states (round 29) — the traveller's meridian as a portrait
 *  gallery. Five windows, each holding one computed state (asleep, drained,
 *  lifting, half-lit, adjusted); the takeover reveals the face that state
 *  produces. Grammar from the Codrops lookbook: the reveal crosses the
 *  window along a jagged edge, never a plain wipe — a clip-path polygon
 *  whose points land staggered, then settle. Clip-path is in the paint-only
 *  allowance (design.md), transform/opacity elsewhere, reduced motion skips
 *  the choreography and shows the face outright.
 *
 *  The written read comes first (Rule 2): each window names its hour and its
 *  state in words, and the caption carries the read's own honest line — the
 *  takeover is the enhancement, not the fact.
 *
 *  Input model: hover is transient (fine pointers only); click pins or
 *  unpins — the deliberate path that serves touch and keyboard alike
 *  (Enter/Space fire the click). revealed = hovered OR pinned, so a pinned
 *  window stays open after the pointer leaves. */

/** The jagged leading edge: points land at varied heights before settling. */
const EDGE_DOWN = "polygon(0% 102%, 14% 102%, 28% 102%, 42% 102%, 57% 102%, 71% 102%, 85% 102%, 100% 102%, 100% 102%, 0% 102%)";
const EDGE_JAG = "polygon(0% 6%, 14% 12%, 28% 3%, 42% 10%, 57% 4%, 71% 11%, 85% 5%, 100% 9%, 100% 102%, 0% 102%)";
const EDGE_FULL = "polygon(0% 0%, 14% 0%, 28% 0%, 42% 0%, 57% 0%, 71% 0%, 85% 0%, 100% 0%, 100% 102%, 0% 102%)";

function useCanHover() {
  // Lazy init reads the media query once (SSR defaults to hover-capable);
  // the effect only subscribes to changes, never sets state synchronously.
  const [canHover, setCanHover] = useState(
    () => typeof window === "undefined" || window.matchMedia("(hover: hover) and (pointer: fine)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const onChange = (e: MediaQueryListEvent) => setCanHover(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return canHover;
}

function LookbookPane({
  win,
  revealed,
  reduced,
}: {
  win: LookbookWindow;
  revealed: boolean;
  reduced: boolean;
}) {
  const overRef = useRef<HTMLDivElement>(null);
  const tween = useRef<gsap.core.Timeline | null>(null);

  // The takeover crosses on a jagged edge, then settles. GSAP interpolates
  // the polygon points; a reversed reveal plays the same path back.
  useEffect(() => {
    const el = overRef.current;
    if (!el) return;
    tween.current?.kill();
    if (reduced) {
      el.style.clipPath = revealed ? EDGE_FULL : EDGE_DOWN;
      return;
    }
    if (revealed) {
      tween.current = gsap
        .timeline()
        .fromTo(el, { clipPath: EDGE_DOWN }, { clipPath: EDGE_JAG, duration: 0.32, ease: "power2.out" })
        .to(el, { clipPath: EDGE_FULL, duration: 0.26, ease: "power2.inOut" });
    } else {
      tween.current = gsap
        .timeline()
        .fromTo(el, { clipPath: EDGE_FULL }, { clipPath: EDGE_JAG, duration: 0.22, ease: "power2.in" })
        .to(el, { clipPath: EDGE_DOWN, duration: 0.3, ease: "power2.out" });
    }
    return () => {
      tween.current?.kill();
    };
  }, [revealed, reduced]);

  return (
    <div className="lookbook-over" ref={overRef} aria-hidden={!revealed}>
      <SunSelf read={win.read} size={88} tone="paper" />
      <span className="lookbook-state">{win.state}</span>
    </div>
  );
}

export function LookbookOfStates({ windows = demoLookbook() }: { windows?: LookbookWindow[] }) {
  const reduced = useReducedMotion() ?? false;
  const canHover = useCanHover();
  // Two independent sources of truth: hover is transient (fine pointers),
  // pin is deliberate (a click). revealed = hovered OR pinned.
  const [hovered, setHovered] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  return (
    <div className="lookbook-wrap">
      <p className="lookbook-eyebrow">The traveller&apos;s meridian</p>
      <p className="lookbook-lede">Five states one body clock passes through — the face each hour earns.</p>
      <div className="lookbook" aria-label="The traveller's meridian, in five states">
      {windows.map((win) => {
        const revealed = hovered === win.id || pinned === win.id;
        return (
          <button
            key={win.id}
            type="button"
            className="lookbook-window"
            data-open={revealed ? "yes" : "no"}
            aria-expanded={revealed}
            aria-label={`${win.when} — ${win.state}. ${win.read.line}`}
            onMouseEnter={canHover && !reduced ? () => setHovered(win.id) : undefined}
            onMouseLeave={canHover && !reduced ? () => setHovered((h) => (h === win.id ? null : h)) : undefined}
            onClick={() => setPinned((p) => (p === win.id ? null : win.id))}
          >
            <span className="lookbook-when">{win.when}</span>
            <span className="lookbook-caption">{win.read.line}</span>
            <LookbookPane win={win} revealed={revealed} reduced={reduced} />
          </button>
        );
      })}
      </div>
    </div>
  );
}
