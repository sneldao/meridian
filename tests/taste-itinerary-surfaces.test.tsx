import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TasteItineraryCard } from "../src/components/TasteItineraryCard";
import { TasteDiscovery } from "../src/components/TasteDiscovery";
import { fmtMin } from "../src/domain/circadian";
import type { TasteEntity, TasteItinerary, TasteResponse } from "../src/domain/taste";

const faves: TasteEntity[] = [
  { id: "e1", name: "Björk", type: "artist" },
  { id: "m2", name: "Past Lives", type: "movie" },
];

const base: TasteItinerary = {
  destinationCode: "HND",
  destination: "Tokyo",
  departureDate: "2026-05-10",
  favorites: faves,
  status: "ready",
  planningMode: "live",
  suggestions: [
    {
      dayIndex: 4,
      date: "2026-05-11",
      label: "D+1",
      startMin: 840,
      endMin: 900,
      place: { name: "Kissa Tanto", categories: ["listening bar", "vinyl"] },
    },
  ],
};

describe("TasteItineraryCard (SSR)", () => {
  const html = renderToStaticMarkup(createElement(TasteItineraryCard, { itinerary: base }));

  test("shows the payoff honestly", () => {
    expect(html).toContain("Your kind of Tokyo.");
    expect(html).toContain("Qloo taste signals: Björk, Past Lives");
    expect(html).toContain("Qloo-ranked ideas, fitted around your plan");
    expect(html).toContain("Kissa Tanto");
    expect(html).toContain("May 11");
    expect(html).toContain(`${fmtMin(840)}–${fmtMin(900)} Tokyo local time`);
    expect(html).toContain("Optional idea · free time in your plan");
    expect(html).toContain("listening bar");
    expect(html).toContain("google.com/maps/search");
    expect(html).toContain("Suggested free time, not a reservation");
    expect(html).toContain("have not been checked");
    for (const bad of ["booked", "reserved for you", "match score", "match %", "outdoor", "reservation confirmed"]) {
      expect(html.toLowerCase()).not.toContain(bad);
    }
  });

  test("replay mode labels itself an example", () => {
    const h = renderToStaticMarkup(
      createElement(TasteItineraryCard, { itinerary: { ...base, planningMode: "replay" } }),
    );
    expect(h).toContain("Example schedule · Qloo place ideas");
  });

  test("changed favorites surface a stale notice, not silent relabeling", () => {
    const h = renderToStaticMarkup(
      createElement(TasteItineraryCard, {
        itinerary: base,
        favorites: [{ id: "zz", name: "Sade", type: "artist" }],
      }),
    );
    expect(h).toContain("Your favorites have changed. Update your plan to use them.");
    expect(h).toContain("Qloo taste signals: Björk, Past Lives");
    expect(h).not.toContain("Qloo taste signals: Sade");
    expect(h).toContain("Kissa Tanto");
  });

  test("unavailable / no-matches / no-window stay honest", () => {
    for (const [status, text] of [
      ["unavailable", "Your plan can still work without place ideas."],
      ["no-matches", "Qloo did not return places for these favorites."],
      ["no-window", "No clear hour after arrival."],
    ] as const) {
      const h = renderToStaticMarkup(
        createElement(TasteItineraryCard, { itinerary: { ...base, status, suggestions: [] } }),
      );
      expect(h).toContain(text);
      expect(h).not.toContain("Kissa Tanto");
      if (status === "unavailable") {
        expect(h).toContain("Requested favorites: Björk, Past Lives");
        expect(h).toContain("Place discovery unavailable");
        expect(h).not.toContain("Qloo-ranked ideas");
      }
    }
  });
});

describe("TasteDiscovery controlled favorites (SSR)", () => {
  const initial: TasteResponse = { enabled: true, destination: "Lisbon", places: [] };

  test("controlled favorites render chips and the plan action", () => {
    const html = renderToStaticMarkup(
      createElement(TasteDiscovery, {
        destination: { name: "Lisbon", lon: -9.1, lat: 38.7 },
        initialTaste: initial,
        favorites: faves,
        onFavoritesChange: () => {},
        storageAvailable: true,
        onFitPlan: () => {},
      }),
    );
    expect(html).toContain("Björk");
    expect(html).toContain("Past Lives");
    expect(html).toContain("2 of 3 favorites");
    expect(html).toContain("Fit these into my plan");
    expect(html).toContain("Remove Björk");
    expect(html).toContain("Your favorites stay with this trip on this device.");
  });

  test("no storage claims session-only, planless shows trip nudge", () => {
    const html = renderToStaticMarkup(
      createElement(TasteDiscovery, {
        destination: { name: "Lisbon", lon: -9.1, lat: 38.7 },
        initialTaste: initial,
        favorites: faves,
        onFavoritesChange: () => {},
        storageAvailable: false,
      }),
    );
    expect(html).toContain("Your favorites are available for this visit only.");
    expect(html).toContain("Plan your own trip to fit these ideas around your schedule.");
    expect(html).not.toContain("Fit these into my plan");
  });

  test("favorites not ready disables selection controls", () => {
    const html = renderToStaticMarkup(
      createElement(TasteDiscovery, {
        destination: { name: "Lisbon", lon: -9.1, lat: 38.7 },
        initialTaste: initial,
        favorites: faves,
        onFavoritesChange: () => {},
        favoritesReady: false,
        onFitPlan: () => {},
      }),
    );
    expect(html).toContain("Remove Björk");
    expect((html.match(/disabled/g) ?? []).length).toBeGreaterThan(0);
    expect(html).toContain("Fit these into my plan");
  });
});
