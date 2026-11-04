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
    expect(h).toContain('href="/demo"');
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
});
