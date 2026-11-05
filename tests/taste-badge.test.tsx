import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TasteTierBadge } from "../src/components/TasteTierBadge";
import { TasteItineraryCard } from "../src/components/TasteItineraryCard";
import { cachedAnswerLabel, fmtClockHHMM, tasteTierExplainer, tasteTierLabel } from "../src/lib/taste-tier";
import { buildTrip } from "../src/domain/fixtures";
import { buildTasteItinerary } from "../src/domain/taste-itinerary";
import type { TasteContext, TasteItinerary } from "../src/domain/taste";

/* §4b move 3 — the interactive tier badge. Every tier names itself with
 * the same vocabulary the provenance labels already use, and the press is
 * real: aria-expanded opens a one-line explainer, never a dead control.
 * SSR renders the closed state; the open state is verified in-browser. */

const tokyoTrip = buildTrip("LHR", "HND", "2026-11-07");

const ctx = (over: Partial<TasteContext>): TasteContext => ({
  favorites: [{ id: "e1", name: "Björk", type: "artist" }],
  status: "ready",
  tier: "recorded",
  places: [],
  ...over,
});

const itinerary = (over: Partial<TasteContext>): TasteItinerary =>
  buildTasteItinerary(tokyoTrip, [], [], ctx({ status: "unavailable", places: [], ...over }), "replay");

describe("the tier → label vocabulary — the badge forks no strings", () => {
  test("every tier names itself; the fall tail rides only below live", () => {
    expect(tasteTierLabel("recorded")).toBe("Recorded");
    expect(tasteTierLabel("imagined")).toBe("Imagined");
    expect(tasteTierLabel("live")).toBe("Live");
    expect(tasteTierLabel("unavailable")).toBe("Unavailable");
    expect(tasteTierLabel("recorded", undefined, true)).toBe("Recorded · live lookup unavailable");
    expect(tasteTierLabel("imagined", undefined, true)).toBe("Imagined · live lookup unavailable");
    expect(tasteTierLabel("live", undefined, true)).toBe("Live"); // a resolved live rung never fell
  });

  test("the stamped tiers carry HH:MM from resolvedAt", () => {
    const stamp = Date.UTC(2026, 10, 1, 14, 32);
    expect(tasteTierLabel("live", stamp)).toMatch(/^Live · \d{2}:\d{2}$/);
    expect(tasteTierLabel("cached", stamp)).toMatch(/^Cached live answer · \d{2}:\d{2}$/);
    expect(fmtClockHHMM(stamp)).toMatch(/^\d{2}:\d{2}$/);
    expect(cachedAnswerLabel(stamp, true)).toMatch(
      /^Cached live answer · \d{2}:\d{2} · live lookup unavailable$/,
    );
  });

  test("every explainer is one honest line — the rung, not a pitch", () => {
    expect(tasteTierExplainer("live")).toBe("Resolved live from Qloo just now.");
    expect(tasteTierExplainer("recorded")).toContain("recorded Qloo capture");
    expect(tasteTierExplainer("recorded")).toContain("QLOO_API_KEY");
    expect(tasteTierExplainer("recorded")).toContain("not a live lookup");
    expect(tasteTierExplainer("imagined")).toContain("imagined");
    expect(tasteTierExplainer("imagined")).toContain("not a live lookup");
    expect(tasteTierExplainer("cached", Date.UTC(2026, 10, 1, 9, 14))).toContain("saved on this device");
    expect(tasteTierExplainer("unavailable")).toContain("retry");
    // The badge never claims a lookup happened that didn't.
    for (const tier of ["recorded", "imagined", "cached", "unavailable"] as const) {
      expect(tasteTierExplainer(tier).toLowerCase()).not.toContain("resolved live just now");
    }
  });
});

describe("TasteTierBadge (SSR)", () => {
  test("renders the tier tag as a closed, honest button", () => {
    const html = renderToStaticMarkup(createElement(TasteTierBadge, { tier: "recorded" }));
    expect(html).toContain("tier-badge");
    expect(html).toContain('data-tier="recorded"');
    expect(html).toContain("Recorded");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("tier-badge-pop"); // closed: no explainer rendered
  });

  test("a live badge shows its stamp and offers refresh only when a reload path exists", () => {
    const stamp = Date.UTC(2026, 10, 1, 9, 14);
    const html = renderToStaticMarkup(
      createElement(TasteTierBadge, { tier: "live", resolvedAt: stamp, onRefresh: () => {} }),
    );
    expect(html).toMatch(/Live · \d{2}:\d{2}/);
    expect(html).toContain("tier-badge-refresh");
    expect(html).toContain('aria-label="Refresh this answer"');
    // No reload path → no dead button.
    const noPath = renderToStaticMarkup(createElement(TasteTierBadge, { tier: "live", resolvedAt: stamp }));
    expect(noPath).not.toContain("tier-badge-refresh");
    // Refresh is the live rung's affordance only.
    const recorded = renderToStaticMarkup(
      createElement(TasteTierBadge, { tier: "recorded", onRefresh: () => {} }),
    );
    expect(recorded).not.toContain("tier-badge-refresh");
  });

  test("the fall tail renders inline when live was tried and lost", () => {
    const html = renderToStaticMarkup(
      createElement(TasteTierBadge, { tier: "recorded", liveUnavailable: true }),
    );
    expect(html).toContain("Recorded · live lookup unavailable");
  });
});

describe("the badge mounts where tier labels already rendered", () => {
  test("the itinerary card's provenance note carries badge + the same sentence", () => {
    const it = itinerary({
      status: "ready",
      places: [{ id: "p1", name: "Mori Art Museum", categories: ["museum"], daytimeCandidate: true }],
      tier: "recorded",
      sampleSource: "recorded",
    });
    const html = renderToStaticMarkup(createElement(TasteItineraryCard, { itinerary: it }));
    expect(html).toContain("tier-badge");
    expect(html).toContain("Recorded");
    expect(html).toContain("Recorded Qloo sample");
    expect(html).toContain("not a live lookup");
  });

  test("a cached itinerary names the device cache, never Qloo directly", () => {
    const stamp = Date.UTC(2026, 10, 1, 8, 0);
    const it = itinerary({
      status: "ready",
      places: [{ id: "p1", name: "Cached Café", categories: ["cafe"], daytimeCandidate: true }],
      tier: "cached",
      resolvedAt: stamp,
    });
    const html = renderToStaticMarkup(createElement(TasteItineraryCard, { itinerary: it }));
    expect(html).toContain('data-tier="cached"');
    expect(html).toContain("Cached live answer");
    expect(html).toContain("saved on this device");
  });
});
