import { describe, expect, test } from "bun:test";
import {
  TASTE_MAP_EDGES,
  TASTE_MAP_LABEL,
  chainsForDestination,
  formatTasteChain,
  tasteChainFor,
  tasteChainLabel,
} from "../src/lib/taste-graph";
import { ENTITY_CATALOG } from "../src/lib/entity-catalog";
import { SAMPLE_TASTE_CRATES } from "../src/lib/sample-taste";
import { crewAnswer, type CrewFacts } from "../src/domain/crew-answer";
import { deriveCrewJobs } from "../src/lib/crew-jobs";
import { buildTrip, ADHERENCE_PROFILE } from "../src/domain/fixtures";
import type { CrewEvent } from "../src/domain/types";
import type { TasteEntity, TasteItinerary } from "../src/domain/taste";

/* The bundled taste map (agent-native §4b — graph materialization, thin
 * slice). The pins: referential integrity (every chain lands on a REAL
 * bundled sample place, keyed to a catalog entity), the traversal lookups,
 * the `taste map · bundled` disclosure on every rendered chain, and the
 * clean fallback when no chain exists. */

const catalogIds = new Map(ENTITY_CATALOG.map((e) => [e.id, e.name]));
const bundledPlaces = new Map<string, string>(); // normalized name → city
const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
for (const p of SAMPLE_TASTE_CRATES)
  for (const place of p.places) bundledPlaces.set(norm(place.name), p.city);

const FAV = (id: string): TasteEntity => ({
  id,
  name: catalogIds.get(id) ?? id,
  type: "artist",
});
const KING_KRULE = FAV("E5928AFF-6309-427E-8A54-DB4AD5946219");
const AMORES = { ...FAV("AAED2C10-DBA8-438A-90B7-5A16D2051EB0"), type: "movie" as const };
const BJORK = FAV("01381184-B533-4E3C-B9DB-43A2FE326744");

describe("taste map — referential integrity", () => {
  test("stays inside its brief: 30–40 authored edges", () => {
    expect(TASTE_MAP_EDGES.length).toBeGreaterThanOrEqual(30);
    expect(TASTE_MAP_EDGES.length).toBeLessThanOrEqual(40);
  });

  test("every edge's landing place is a real bundled sample place", () => {
    for (const e of TASTE_MAP_EDGES) {
      expect(bundledPlaces.has(norm(e.to))).toBe(true);
    }
  });

  test("every edge keys to a catalog entity — no chains for names we don't carry", () => {
    for (const e of TASTE_MAP_EDGES) {
      expect(catalogIds.get(e.entityId)).toBe(e.entity);
    }
  });

  test("every bundled place earns at least one chain — no orphaned venues", () => {
    const landed = new Set(TASTE_MAP_EDGES.map((e) => norm(e.to)));
    for (const name of bundledPlaces.keys()) {
      expect(landed.has(name)).toBe(true);
    }
  });
});

describe("taste map — traversal", () => {
  test("tasteChainFor returns the favorite's chain that lands on the place", () => {
    const c = tasteChainFor("Galería OMR", [KING_KRULE, AMORES]);
    expect(c).not.toBeNull();
    expect(c!.entity).toBe("King Krule");
    expect(c!.via).toContain("→");
    expect(c!.place).toBe("Galería OMR");
    expect(c!.city).toBe("Mexico City");
  });

  test("crate order decides when two favorites chain to one place", () => {
    const c = tasteChainFor("Galería OMR", [AMORES, KING_KRULE]);
    expect(c!.entity).toBe("Amores Perros");
  });

  test("place matching is case- and diacritic-insensitive", () => {
    const c = tasteChainFor("galeria omr", [KING_KRULE]);
    expect(c!.place).toBe("Galería OMR");
  });

  test("an honest miss: no chain for a place the favorite doesn't reach", () => {
    expect(tasteChainFor("Ghibli Museum", [KING_KRULE])).toBeNull();
    expect(tasteChainFor("No Such Venue", [KING_KRULE])).toBeNull();
    expect(tasteChainFor("La Botica", [])).toBeNull();
  });

  test("chainsForDestination returns only chains that land in that city", () => {
    const mex = chainsForDestination("Mexico City", [KING_KRULE, AMORES, BJORK]);
    expect(mex.length).toBe(4); // King Krule ×2, Amores Perros ×2; Björk's chains are Tokyo
    expect(mex.every((c) => c.city === "Mexico City")).toBe(true);
    expect(chainsForDestination("Tokyo", [KING_KRULE])).toHaveLength(0);
    expect(chainsForDestination("", [KING_KRULE])).toHaveLength(0);
  });
});

describe("taste map — the honesty label", () => {
  test("every rendered chain carries 'taste map · bundled', never live/graph", () => {
    expect(TASTE_MAP_LABEL).toBe("taste map · bundled");
    expect(TASTE_MAP_LABEL).not.toMatch(/live|graph|qloo/i);
    const c = tasteChainFor("La Botica", [KING_KRULE])!;
    expect(formatTasteChain(c)).toBe(
      `King Krule → dark jazz · smoky rooms → mezcal bars → La Botica`,
    );
    expect(tasteChainLabel(c)).toContain(TASTE_MAP_LABEL);
  });
});

/* --- the surfaces ------------------------------------------------------- */

const MEX_TRIP = buildTrip("JFK", "MEX", "2026-10-18");
const baseFacts: CrewFacts = {
  trip: MEX_TRIP,
  owedMin: 0,
  plans: [],
  plansArePreview: true,
  calendar: [],
  adherence: ADHERENCE_PROFILE,
  favorites: [KING_KRULE, AMORES],
};

describe("crew-answer — 'why this place?' leads with the chain", () => {
  const pinContext = {
    about: "La Botica — the crate's pick",
    detail: "Bar, inside your 19:00–21:00 window on D+1 — imagined sample — not a live lookup",
    owner: "Scout",
    agent: null,
    provenance: "your crate",
    placeName: "La Botica",
  };

  test("a bound place with a chain answers entity → via → place, disclosed", () => {
    const a = crewAnswer("why this place?", { ...baseFacts, context: pinContext });
    expect(a.owner).toBe("Scout");
    expect(a.answer).toBe(
      `La Botica — King Krule → dark jazz · smoky rooms → mezcal bars · ${TASTE_MAP_LABEL}`,
    );
    // The card's own words ride underneath — prepended, not replaced.
    expect(a.detail?.[0]).toContain("the crate's pick");
    expect(a.detail?.[0]).toContain("19:00–21:00");
  });

  test("a bound place with no chain falls back to the card's answer — no invented hops", () => {
    const a = crewAnswer("why this place?", {
      ...baseFacts,
      context: { ...pinContext, about: "Some Bar — the crate's pick", placeName: "Some Bar" },
    });
    expect(a.answer).toContain("Some Bar — the crate's pick");
    expect(a.answer).not.toContain(TASTE_MAP_LABEL);
  });

  test("no favorites packed — the chain can't fire even on a wired place", () => {
    const a = crewAnswer("why this place?", {
      ...baseFacts,
      favorites: undefined,
      context: pinContext,
    });
    expect(a.answer).not.toContain(TASTE_MAP_LABEL);
    expect(a.answer).toContain("the crate's pick");
  });

  test("scout's lane recites the destination's chains, disclosed", () => {
    const a = crewAnswer("who matched the places?", {
      ...baseFacts,
      places: { matched: 2, provenance: "imagined sample — not a live lookup" },
    });
    expect(a.owner).toBe("Scout");
    expect(a.detail?.length).toBeGreaterThan(0);
    for (const line of a.detail ?? []) {
      expect(line).toContain(TASTE_MAP_LABEL);
      expect(line).toContain("→");
    }
  });
});

describe("crew jobs — the Scout row names the via", () => {
  const itinerary: TasteItinerary = {
    destinationCode: "MEX",
    destination: "Mexico City",
    departureDate: "2026-10-18",
    favorites: [KING_KRULE, AMORES],
    status: "ready",
    planningMode: "live",
    suggestions: [
      {
        dayIndex: 3,
        date: "2026-10-21",
        label: "D+1",
        startMin: 600,
        endMin: 780,
        place: { name: "Mercado de Medellín", categories: ["Market"] },
      },
    ],
    firstNight: { name: "La Botica", categories: ["Mezcal bar"] },
    sampleSource: "imagined",
  };
  const events: CrewEvent[] = [
    {
      type: "briefing",
      summary: "s",
      ics: "",
      score: 0.9,
      citations: [],
      days: [],
      coverage: {
        requiredMin: 480, achievedMin: 400, residualMin: 80, ratio: 0.83,
        daysTotal: 5, daysPlanned: 5, complete: false,
      },
      tasteItinerary: itinerary,
    },
    { type: "done" },
  ];

  test("a suggested place with a chain gets '· via {entity}' — one suffix", () => {
    const scout = deriveCrewJobs({ phase: "done", events }).jobs.find((j) => j.id === "places")!;
    const sug = scout.steps.find((s) => s.text.startsWith("Mercado de Medellín"))!;
    expect(sug.text).toContain("· via Amores Perros");
    const night = scout.steps.find((s) => s.text.startsWith("first night"))!;
    expect(night.text).toContain("· via King Krule");
  });
});
