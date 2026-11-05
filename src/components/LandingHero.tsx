"use client";

import Link from "next/link";
import { Fragment } from "react";
import { routeGapHeadline, type RouteGapRead } from "@/domain/route-gap";

/* Design reset Phase 1 — the Statement hero: one line of type, the
 * visitor's own number, quiet links. The sun, the orbit, the observers
 * and the instrument frame are gone — the form is the hero's action and
 * the example day is its own section below (LandingExampleDay).
 *
 * Fallback: "Land on their clock." arrives per character — words are
 * wrapped so a word never breaks letter-by-letter; the full sentence sits
 * in aria-label so the split is decoration, not the text. Resolved: once
 * the draft route computes, the headline becomes the visitor's own gap
 * (routeGapHeadline), rendered plainly — a route being typed should never
 * trigger a per-letter show. Reduced motion meets the fallback seated. */

const FALLBACK = "Land on their clock.";
const FALLBACK_WORDS = FALLBACK.split(" ");

export function LandingHero({
  visitor,
}: {
  visitor?: { gap: RouteGapRead; covPct: number | null } | null;
}) {
  const resolved = visitor?.gap ? routeGapHeadline(visitor.gap) : null;
  return (
    <div className="landing-hero">
      {resolved ? (
        <h1 className="lh-title lh-title--resolved">{resolved}</h1>
      ) : (
        <h1 className="lh-title" aria-label={FALLBACK}>
          <span aria-hidden="true">
            {FALLBACK_WORDS.map((word, wi) => (
              <Fragment key={wi}>
                <span className="lh-word">
                  {[...word].map((ch, i) => (
                    <span key={i} className="lh-char">
                      {ch}
                    </span>
                  ))}
                </span>
                {wi < FALLBACK_WORDS.length - 1 ? " " : null}
              </Fragment>
            ))}
          </span>
        </h1>
      )}
      <p className="lh-lede">
        A daily plan for light, sleep and caffeine, timed to your trip.
      </p>
      {/* The product's two pillars, straight from the film's end card: the
          lede above sells WHEN; the rubric names WHAT so the landing never
          promises only half the product. */}
      <p className="lh-rubric">The crew decides when · Qloo decides what</p>
      <p className="lh-links">
        <a href="#trip-entry" className="lh-link lh-link--start">
          Start with your trip
        </a>
        {/* The example day below this hero is Diego's dispatch, and the
            crate at the door is his — so the demo the link opens is his
            too. /demo's own default stays the Tokyo story it was cut
            around (and the one its social card describes); the landing
            does not have to send a visitor to a different traveller's
            story than the one it just showed them. */}
        <Link href="/demo?s=diego" className="lh-link lh-link--quiet" transitionTypes={["nav-forward"]}>
          Watch the example
        </Link>
      </p>
    </div>
  );
}
