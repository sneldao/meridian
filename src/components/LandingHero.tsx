"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { InteractiveDay } from "@/components/InteractiveDay";
import { LandingDepth } from "@/components/LandingDepth";
import { SunSelf } from "@/components/SunSelf";
import { buildDayScene } from "@/domain/day-scene";
import { buildDemoScenario } from "@/domain/demo-scenarios";
import { routeGapHeadline, type RouteGapRead } from "@/domain/route-gap";
import { sunSelfRead } from "@/domain/sun-self";

/* Round 31 landing: engagement first — a stable hero, then the example day
 * the visitor can touch. No pinned stage; the choreographed story stays one
 * click away on /demo. Extracted so the landing surface is SSR-testable.
 *
 * Stagecraft, in rising order of commitment:
 *  - the traveller's sun peeks in once when the hero first enters view (an
 *    IntersectionObserver writes data-peek; CSS does the performance;
 *    reduced motion meets it already resting);
 *  - the ambient depth behind the page is LandingDepth's layered sky,
 *    evolving on the page's own scroll var (--lp);
 *  - the sun then makes the descent it promised: as the visitor scrolls it
 *    leaves the poster and settles on the example day's top edge — a
 *    measured perch, written as one transform on the orbit wrapper so the
 *    inner glyph's peek animation is never fought. The copy is positioned
 *    above the orbit's layer, so the traveller passes *behind* words and
 *    never over them; reduced motion never arms the trip;
 *  - the example day sits in an instrument frame — a hairline border, a
 *    labelled head bar, the honesty tag stamped in the chrome rather than
 *    floating under it — and its top edge peeks up into the hero's bottom
 *    padding to invite the scroll. */

const demo = buildDemoScenario("miles", "2026-11-04");
const scene = buildDayScene({ ...demo, dayIndex: demo.event.dayIndex })!;

// The hero face reads the same numbers the example day below it computes —
// a character on the poster, never a made-up mood.
const heroFace = sunSelfRead({
  owedMin: Math.abs(Math.round(scene.bodyOffsetMin)),
  deliveredMin: Math.max(
    0,
    Math.round(Math.abs(demo.trip.requiredShiftMin)) - Math.abs(Math.round(scene.bodyOffsetMin)),
  ),
  requiredMin: Math.max(1, Math.round(Math.abs(demo.trip.requiredShiftMin))),
  direction: demo.trip.direction,
});

export function LandingHero({
  visitor,
}: {
  visitor?: { gap: RouteGapRead; covPct: number | null } | null;
}) {
  const heroRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [peeked, setPeeked] = useState(false);

  // Once, on first real visibility — never a loop, never on repeat views.
  // Without an observer the sun simply rests seated; nothing is lost.
  useEffect(() => {
    const el = heroRef.current;
    if (!el || peeked || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([en]) => {
        if (en.isIntersecting) {
          setPeeked(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [peeked]);

  // The descent: the sun leaves the poster and settles on the example day's
  // top edge — the trip coming to it. The perch is measured live (the
  // rect read happens with the transform cleared, so a mid-flight measure
  // never feeds back), progress is the scroll up to the moment the frame's
  // edge reaches reading height, and the whole trip is one transform on
  // the orbit — translate, a gentle settle-scale, nothing else. Reduced
  // motion never arms it; the sun stays on its poster.
  useEffect(() => {
    const orbit = orbitRef.current;
    const frame = frameRef.current;
    if (!orbit || !frame) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const apply = () => {
      orbit.style.transform = "";
      const s = orbit.getBoundingClientRect();
      const f = frame.getBoundingClientRect();
      const dx = f.left + f.width / 2 - (s.left + s.width / 2);
      const dy = f.top - (s.top + s.height / 2);
      const end = Math.max(240, f.top + window.scrollY - window.innerHeight * 0.5);
      const q = Math.min(1, Math.max(0, window.scrollY / end));
      const e = q * q * (3 - 2 * q);
      orbit.style.transform =
        `translate3d(${(dx * e).toFixed(1)}px, ${(dy * e).toFixed(1)}px, 0) ` +
        `scale(${(1 - 0.34 * e).toFixed(3)})`;
    };
    apply();
    window.addEventListener("scroll", apply, { passive: true });
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("scroll", apply);
      window.removeEventListener("resize", apply);
      orbit.style.transform = "";
    };
  }, []);

  return (
    <>
      <LandingDepth />
      <div className="landing-hero" ref={heroRef} data-peek={peeked ? "yes" : "no"}>
        <div className="lh-sun-orbit" ref={orbitRef}>
          <SunSelf read={heroFace} tone="paper" size={72} className="lh-sun" />
        </div>
        <h2 className="landing-tease-title">Land on their clock.</h2>
        <p className="ls-pain">
          {visitor
            ? routeGapHeadline(visitor.gap)
            : "Your 16:00 Tokyo meeting is 08:30 body time."}
        </p>
        <p className="ls-mech">
          Meridian retimes light, sleep and caffeine across the days around the flight — and scores
          what you banked.
        </p>
        <p className="ls-cta-row">
          <a href="#trip-entry" className="landing-tease-cta">
            Start with your trip
          </a>
          <Link href="/demo" className="ls-cta-ghost" transitionTypes={["nav-forward"]}>
            Watch the ninety-second example
          </Link>
        </p>
      </div>
      <div className="landing-iday">
        <div className="landing-iday-frame" ref={frameRef}>
          <div className="landing-iday-bar">
            <h3 className="landing-iday-title">Explore an example day</h3>
            <p className="landing-iday-sub">Example trip — not your plan.</p>
          </div>
          <InteractiveDay
            scene={scene}
            requiredMin={Math.abs(demo.trip.requiredShiftMin)}
            direction={demo.trip.direction}
            example
          />
        </div>
      </div>
    </>
  );
}
