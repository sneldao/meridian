import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { LandingHero } from "../src/components/LandingHero";
import { TripEntryScreen } from "../src/components/TripEntryScreen";
import { routeGapRead, routeGapHeadline } from "../src/domain/route-gap";

/* Design reset Phase 1 — the Statement hero: type first, the form is the
 * action, no sun, no orbit, no instrument frame (the example day moved to
 * LandingExampleDay). */

describe("LandingHero (Phase 1 statement, SSR)", () => {
  const h = renderToStaticMarkup(createElement(LandingHero));

  test("fallback headline is one h1, word-grouped, full text in aria-label", () => {
    expect(h).toContain('aria-label="Land on their clock."');
    expect((h.match(/<h1/g) ?? []).length).toBe(1);
    // Words are wrapped so a word never breaks letter-by-letter.
    expect(h).toContain("lh-word");
    expect(h).toContain("lh-char");
    expect(h).not.toContain("Arrive better adjusted.");
  });

  test("one quiet anchor to the form and one to the demo — no second CTA button", () => {
    expect(h).toContain('href="#trip-entry"');
    expect(h).toContain("Start with your trip");
    // The landing tells Diego's story — crate, dispatch, example day — so
    // its demo link opens his. /demo's own default stays the Tokyo story.
    expect(h).toContain('href="/demo?s=diego"');
    expect(h).toContain("Watch the example");
    expect(h).not.toContain("landing-tease-cta");
    expect(h).not.toContain("<button");
  });

  test("no sun, no orbit, no observers, no instrument frame", () => {
    for (const gone of ["lh-sun", "sunself", "lh-sun-orbit", "data-peek", "landing-iday", "landing-depth", "IntersectionObserver"]) {
      expect(h).not.toContain(gone);
    }
  });

  test("no pinned stage", () => {
    expect(h).not.toContain("ls-track");
  });

  test("the two-pillar rubric names WHEN and WHAT under the lede", () => {
    // The film's end card, carried into the product: the lede sells the
    // body-clock half; the rubric names the taste half so the landing
    // never promises only one pillar.
    expect(h).toContain("lh-rubric");
    expect(h.toLowerCase()).toContain("the crew decides when");
    expect(h.toLowerCase()).toContain("qloo decides what");
    // It is the thesis, not a provenance mark — no stamp chrome.
    expect(h.indexOf("lh-rubric")).toBeGreaterThan(h.indexOf("lh-lede"));
  });
});

describe("LandingHero — resolved visitor gap", () => {
  test("a resolved draft renders the routeGapHeadline plainly, one h1", () => {
    const gap = routeGapRead({ origin: "LHR", dest: "NRT", date: "2026-11-07" })!;
    const h = renderToStaticMarkup(createElement(LandingHero, { visitor: { gap, covPct: 62 } }));
    expect(h).toContain(routeGapHeadline(gap));
    expect(h).toContain("lh-title--resolved");
    // Resolved headline is plain text — no per-character show while typing.
    expect(h).not.toContain("lh-char");
    expect((h.match(/<h1/g) ?? []).length).toBe(1);
  });
});

describe("TripEntryScreen (Phase 1)", () => {
  test("the form carries its own heading on the landing surface", () => {
    const h = renderToStaticMarkup(
      createElement(TripEntryScreen, {
        initialDate: "2026-11-04",
        onContinue: () => {},
        onExploreExample: () => {},
      }),
    );
    expect(h).toContain('id="trip-entry"');
    expect(h).toContain("Where are you headed?");
    expect(h).toContain('id="entry-heading"');
    // The landing RoutePicker surface: mono cells + resolved city names.
    expect(h).toContain("rp-picker--landing");
    // No mascot, no sample tiles inside the form, no hero CTA words.
    expect(h).not.toContain("sunself");
    expect(h).not.toContain("sample-journeys");
    expect(h).not.toContain("Start with your trip");
    // Privacy link and the example action stay.
    expect(h).toContain("/privacy");
    expect(h).toContain("Explore an example");
  });

  test("the entry offers the taste crates, unselected, Diego first", () => {
    const h = renderToStaticMarkup(
      createElement(TripEntryScreen, {
        initialDate: "2026-11-04",
        onContinue: () => {},
        onExploreExample: () => {},
      }),
    );
    expect(h).toContain("entry-crate");
    expect(h).toContain("Pack a taste crate");
    // Story order: the film's dispatch leads, then the two recorded crates.
    expect(h.indexOf("Diego&#x27;s crate")).toBeGreaterThan(-1);
    expect(h.indexOf("Diego&#x27;s crate")).toBeLessThan(h.indexOf("Björk"));
    expect(h.indexOf("Björk")).toBeLessThan(h.indexOf("Luke Combs"));
    // Optional, not a gate: every pill starts unpressed.
    expect(h).not.toContain('aria-pressed="true"');
    // The note and the one-tap route fill only appear once a crate is chosen.
    expect(h).not.toContain("entry-crate-note");
    expect(h).not.toContain("entry-crate-route");
  });
});
