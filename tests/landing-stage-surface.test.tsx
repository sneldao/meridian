import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { LandingStage } from "../src/components/LandingStage";
import { TripEntryScreen } from "../src/components/TripEntryScreen";

/* The landing stage (round 30) renders its complete written read on the
 * server — the performance never arms without JS, so the static markup must
 * carry every beat: the gap, the night before, the crossing, the morning.
 * The scroll-scrubbed stage is the enhancement, never the only route. */

describe("LandingStage (SSR) — the written read is complete", () => {
  const h = renderToStaticMarkup(createElement(LandingStage));

  test("unstaged by default: the same markup becomes the stacked read", () => {
    expect(h).toContain('data-staged="no"');
  });

  test("the gap: pain once, mechanism once, two ways in", () => {
    expect(h).toContain("Arrive better adjusted");
    expect(h).toContain("Your 16:00 Tokyo meeting is 07:00 body time.");
    expect(h).toContain("retimes light, sleep and caffeine");
    expect(h).toContain('href="#trip-entry"');
    expect(h).toContain("Start with your trip");
    expect(h).toContain("Watch the ninety-second example");
  });

  test("every beat names its moment", () => {
    expect(h).toContain("D-5 · the night before");
    expect(h).toContain("Mid-crossing");
    expect(h).toContain("The first morning, honestly scored");
  });

  test("the crew transcript is in the markup — not gated behind scroll state", () => {
    expect(h).toContain("crew-perf");
    expect(h).toContain("daylight · light avoidance · sleep windows · caffeine cutoffs");
  });

  test("the morning carries the honest artifacts, not promises", () => {
    expect(h).toContain("banked of");
    expect(h).toContain("doing nothing would owe");
    expect(h).toContain("Arrival scorecard");
    expect(h).toContain("Shareable passport");
  });

  test("the traveller's face rides the stage — a computed read, labelled", () => {
    expect(h).toContain("stage-sun");
    expect(h).toContain("The traveller&#x27;s meridian — drained");
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
  });
});

describe("LandingStage with a visitor route (phase 3)", () => {
  const visitor = {
    gap: {
      originName: "San Francisco",
      destName: "New York",
      direction: "west" as const,
      gapMin: 180,
      signedShiftMin: 180,
      destLat: 40.7,
      destLon: -74,
      localMin: 420,
      bodyMin: 600,
    },
    covPct: 60,
  };
  const hv = renderToStaticMarkup(createElement(LandingStage, { visitor }));

  test("the pain line and the dawn tags become theirs", () => {
    expect(hv).toContain("New York is 10:00 body time");
    expect(hv).toContain("New York&#x27;s dawn");
  });

  test("west routes draw the ghost on the far side", () => {
    expect(hv).toContain("ls-dawns west");
  });

  test("the tally names their shift, not the demo's", () => {
    expect(hv).toContain("banked of 3.0h needed");
  });
});
