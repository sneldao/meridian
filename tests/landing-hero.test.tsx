import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { LandingHero } from "../src/components/LandingHero";
import { TripEntryScreen } from "../src/components/TripEntryScreen";

describe("LandingHero (round-31 landing, SSR)", () => {
  const h = renderToStaticMarkup(createElement(LandingHero));

  test("headline, primary CTA and the demo link", () => {
    // The hero line is the promise, not the brand — the chrome already
    // carries "Arrive better adjusted" once.
    expect(h).toContain("Land on their clock.");
    expect(h).not.toContain("Arrive better adjusted.");
    expect(h).toContain('href="#trip-entry"');
    expect(h).toContain("Start with your trip");
    expect(h).toContain('href="/demo"');
  });

  test("the explorable example day is present and honestly tagged", () => {
    expect(h).toContain("Explore an example day");
    expect(h).toContain("Example trip — not your plan.");
    expect(h).toContain("iday-timeline");
  });

  test("the example day sits in its instrument frame and the sun rests until seen", () => {
    expect(h).toContain("landing-iday-frame");
    expect(h).toContain("landing-iday-bar");
    expect(h).toContain("lh-sun");
    expect(h).toContain('data-peek="no"');
  });

  test("the sun rides a measured orbit to the day frame", () => {
    // The orbit wrapper carries the scroll descent; the glyph inside keeps
    // the one-shot peek. The frame it perches on is in the same render.
    expect(h).toContain("lh-sun-orbit");
  });

  test("the ambient depth hangs behind the page, generated not authored", () => {
    expect(h).toContain("landing-depth");
    expect(h).toContain("ld-sky");
    expect(h).toContain("ld-motes-far");
    expect(h).toContain("ld-ridge-far");
    expect(h).toContain("ld-grain");
    // Pure chrome — hidden from the read, seeded geometry in the markup.
    expect(h).toMatch(/class="landing-depth"[^>]*aria-hidden="true"/);
    expect(h).toContain("<circle");
  });

  test("no pinned stage", () => {
    expect(h).not.toContain("ls-track");
  });
});

describe("TripEntryScreen (round 30)", () => {
  test("the form is the hero CTA's target", () => {
    const h = renderToStaticMarkup(
      createElement(TripEntryScreen, {
        initialDate: "2026-11-04",
        onContinue: () => {},
        onExploreExample: () => {},
      }),
    );
    expect(h).toContain('id="trip-entry"');
    // One "start" per page: the anchor above owns the words, the form's own
    // header carries this block.
    expect(h).not.toContain("Start with your trip");
    expect(h).toContain("Where are you headed?");
  });
});
