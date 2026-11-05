import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { loadTasteContext } from "../src/agents/taste-context";
import { resetQlooCache } from "../src/tools/qloo";
import { buildTasteItinerary } from "../src/domain/taste-itinerary";
import { buildTrip } from "../src/domain/fixtures";
import { isTasteItinerary, type TasteContext, type TasteMarks } from "../src/domain/taste";
import { placeProvenance } from "../src/lib/crew-jobs";
import { sampleSourceLabel, sampleTasteProfile, splitSamplePlaces } from "../src/lib/sample-taste";

/* The taste resolver ladder (agent-native §4b): live → recorded →
 * imagined → unavailable. A live failure falls *down* the ladder instead
 * of dead-ending; every rung answers with its own provenance, and memory
 * (kept/dismissed marks) shapes the recorded lane exactly the way it
 * shapes the live one. These tests pin the honesty law: no rung ever
 * masquerades as a higher one, and "unavailable" is only ever the bottom
 * rung — never returned while a sample match exists. */

const entitiesJson = (rows: unknown[]) => JSON.stringify({ results: { entities: rows } });
const stub = (fn: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) =>
  fn as unknown as typeof fetch;
const realFetch = globalThis.fetch;
const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["QLOO_API_KEY", "QLOO_BASE_URL", "FALKORDB_URL", "FALKORDB_HOST"] as const;

const tokyoTrip = buildTrip("LHR", "HND", "2026-11-07");
const mexTrip = buildTrip("JFK", "MEX", "2026-11-07");
const bjork = sampleTasteProfile("bjork")!;
const diego = sampleTasteProfile("diego")!;
const noCrate = [{ id: "e1", name: "Phoebe Bridgers", type: "artist" as const }];

const failQloo = () => {
  globalThis.fetch = stub(async () => new Response("x", { status: 500 }));
};
const marks = (m: Partial<TasteMarks>): TasteMarks => ({ kept: [], dismissed: [], ...m });

beforeEach(() => {
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
  resetQlooCache();
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  globalThis.fetch = realFetch;
});

describe("the ladder — live rung first, then the recorded pool", () => {
  it("a live answer reports the live tier and no provenance caveats", async () => {
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async () =>
      new Response(entitiesJson([{ name: "Venue A", tags: [{ type: "urn:tag:category:place", name: "Cafe" }] }]), { status: 200 }));
    const ctx = await loadTasteContext(tokyoTrip, bjork.favorites);
    expect(ctx.status).toBe("ready");
    expect(ctx.tier).toBe("live");
    expect(ctx.sampleSource).toBeUndefined();
    expect(ctx.liveUnavailable).toBeUndefined();
    expect(ctx.places[0].name).toBe("Venue A");
  });

  it("a live failure falls to the recorded crate and says so — never a dead-end", async () => {
    process.env.QLOO_API_KEY = "qk";
    failQloo();
    const ctx = await loadTasteContext(tokyoTrip, bjork.favorites);
    expect(ctx.status).toBe("ready");
    expect(ctx.tier).toBe("recorded");
    expect(ctx.sampleSource).toBe("recorded");
    expect(ctx.liveUnavailable).toBe(true);
    expect(ctx.places.map((p) => p.name)).toContain("Mori Art Museum");
  });

  it("the same fall lands on an imagined crate, labelled imagined", async () => {
    process.env.QLOO_API_KEY = "qk";
    failQloo();
    const ctx = await loadTasteContext(mexTrip, diego.favorites);
    expect(ctx.status).toBe("ready");
    expect(ctx.tier).toBe("imagined");
    expect(ctx.sampleSource).toBe("imagined");
    expect(ctx.liveUnavailable).toBe(true);
    expect(ctx.places.map((p) => p.name)).toEqual(["Galería OMR", "Mercado de Medellín"]);
    expect(ctx.eveningPlaces?.[0].name).toBe("La Botica");
  });

  it("a live failure with no matching crate is honestly unavailable — flagged, not silent", async () => {
    process.env.QLOO_API_KEY = "qk";
    failQloo();
    const ctx = await loadTasteContext(tokyoTrip, noCrate);
    expect(ctx.status).toBe("unavailable");
    expect(ctx.tier).toBe("unavailable");
    expect(ctx.liveUnavailable).toBe(true);
    expect(ctx.places).toEqual([]);
  });

  it("a truthful live no-matches outranks the recorded pool — the ladder only falls on failure", async () => {
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async () => new Response(entitiesJson([]), { status: 200 }));
    const ctx = await loadTasteContext(tokyoTrip, bjork.favorites);
    expect(ctx.status).toBe("no-matches");
    expect(ctx.tier).toBe("live");
    expect(ctx.liveUnavailable).toBeUndefined();
    expect(ctx.sampleSource).toBeUndefined();
  });
});

describe("the ladder — keyless rungs start on the recorded pool", () => {
  it("a matching crate answers recorded with no fall to name", async () => {
    globalThis.fetch = stub(async () => { throw new Error("must not fetch"); });
    const ctx = await loadTasteContext(tokyoTrip, bjork.favorites);
    expect(ctx.status).toBe("ready");
    expect(ctx.tier).toBe("recorded");
    expect(ctx.sampleSource).toBe("recorded");
    expect(ctx.liveUnavailable).toBeUndefined();
  });

  it("no crate match stays the bottom rung", async () => {
    const ctx = await loadTasteContext(tokyoTrip, noCrate);
    expect(ctx.status).toBe("unavailable");
    expect(ctx.tier).toBe("unavailable");
    expect(ctx.liveUnavailable).toBeUndefined();
  });
});

describe("memory on the sample lane — the recorded pool is shaped like the live one", () => {
  it("dismissed places are suppressed from the recorded pool, by id or name", async () => {
    const ghibli = bjork.places.find((p) => p.name === "Ghibli Museum")!;
    const byId = await loadTasteContext(tokyoTrip, bjork.favorites, undefined, marks({ dismissed: [{ id: ghibli.id!, name: ghibli.name }] }));
    expect(byId.places.map((p) => p.name)).not.toContain("Ghibli Museum");
    expect(byId.memory?.suppressed).toBe(1);

    const byName = await loadTasteContext(tokyoTrip, bjork.favorites, undefined, marks({ dismissed: [{ name: "  MORI art MUSEUM " }] }));
    expect(byName.places.map((p) => p.name)).not.toContain("Mori Art Museum");
    expect(byName.memory?.suppressed).toBe(1);
    // …and the shaping is just as visible after a live failure fell here.
    process.env.QLOO_API_KEY = "qk";
    failQloo();
    const fell = await loadTasteContext(tokyoTrip, bjork.favorites, undefined, marks({ dismissed: [{ name: "Ghibli Museum" }] }));
    expect(fell.places.map((p) => p.name)).not.toContain("Ghibli Museum");
    expect(fell.liveUnavailable).toBe(true);
    expect(fell.memory?.suppressed).toBe(1);
  });

  it("suppressing every daytime candidate is an honest no-matches, still stamped recorded", async () => {
    const dismissed = bjork.places
      .filter((p) => p.daytimeCandidate === true)
      .map((p) => ({ name: p.name }));
    const ctx = await loadTasteContext(tokyoTrip, bjork.favorites, undefined, marks({ dismissed }));
    expect(ctx.status).toBe("no-matches");
    expect(ctx.tier).toBe("recorded");
    expect(ctx.sampleSource).toBe("recorded");
    expect(ctx.memory?.suppressed).toBe(bjork.places.length);
  });

  it("kept places re-rank the recorded pool by shared category — stable, taste order inside tiers", async () => {
    const scai = bjork.places.find((p) => p.name === "SCAI The Bathhouse")!;
    const ctx = await loadTasteContext(tokyoTrip, bjork.favorites, undefined, marks({ kept: [scai.id!] }));
    // SCAI's categories (art gallery · place · tourist attraction) lift
    // every place sharing them; inside each adjacency tier the sample's
    // own order survives — a stable re-rank, never a reshuffle.
    expect(ctx.places.map((p) => p.name)).toEqual([
      "SCAI The Bathhouse",
      "MAHO KUBOTA GALLERY",
      "Mori Art Museum",
      "Ghibli Museum",
      "St. Mary's Cathedral, Tokyo",
      "Sahsya Kanetanaka",
    ]);
    expect(ctx.memory?.kept).toBe(1);
    expect(ctx.memory?.keptIds).toEqual([scai.id]);
  });

  it("the evening offer survives a daytime re-rank", async () => {
    const mercado = diego.places.find((p) => p.name === "Mercado de Medellín")!;
    const ctx = await loadTasteContext(mexTrip, diego.favorites, undefined, marks({ kept: [mercado.id!] }));
    expect(ctx.places[0].name).toBe("Mercado de Medellín");
    expect(ctx.eveningPlaces?.[0].name).toBe("La Botica");
  });

  it("marks that match nothing change nothing — the plain split, no memory line needed for shape", async () => {
    const ctx = await loadTasteContext(tokyoTrip, bjork.favorites, undefined, marks({ kept: ["not-a-sample-place"] }));
    expect(ctx.places.map((p) => p.name)).toEqual(splitSamplePlaces(bjork.places).daytime.map((p) => p.name));
    // The kept mark still counts as memory — it joined the tally exactly
    // as it would join the live affinity signal.
    expect(ctx.memory?.kept).toBe(1);
  });
});

describe("the honesty law — every rung names itself", () => {
  const ctx = (over: Partial<TasteContext>): TasteContext => ({
    favorites: bjork.favorites,
    status: "ready",
    tier: "live",
    places: [],
    ...over,
  });

  it("a recorded answer after a live failure says 'live lookup unavailable' on every label", () => {
    const it = buildTasteItinerary(
      tokyoTrip,
      [],
      [],
      ctx({ status: "unavailable", places: [], tier: "recorded", sampleSource: "recorded", liveUnavailable: true }),
      "replay",
    );
    expect(it.tier).toBe("recorded");
    expect(it.liveUnavailable).toBe(true);
    expect(placeProvenance(it)).toContain("live lookup unavailable");
    expect(placeProvenance(it)).toContain("not a live lookup");
    expect(sampleSourceLabel("recorded", true)).toContain("live lookup unavailable");
    expect(sampleSourceLabel("recorded", true)).toContain("not a live lookup");
    expect(sampleSourceLabel("imagined", true)).toContain("Imagined");
    // …while the unfallen labels are byte-for-byte what they always were.
    const unfallen = buildTasteItinerary(
      tokyoTrip,
      [],
      [],
      ctx({ status: "unavailable", places: [], tier: "recorded", sampleSource: "recorded" }),
      "replay",
    );
    expect(placeProvenance(unfallen)).toBe("recorded Qloo sample — not a live lookup");
    expect(sampleSourceLabel("recorded")).toBe("Recorded Qloo sample · captured 31 Oct 2026 · not a live lookup");
    expect(sampleSourceLabel("imagined")).toBe("Imagined sample for this story — not a live lookup");
  });

  it("the wire validator pins the tier vocabulary — nothing outside the four rungs", () => {
    const it = buildTasteItinerary(tokyoTrip, [], [], ctx({ status: "unavailable", places: [] }), "replay");
    expect(isTasteItinerary({ ...it, tier: "unavailable", liveUnavailable: true })).toBe(true);
    expect(isTasteItinerary({ ...it, tier: "live" })).toBe(true);
    expect(isTasteItinerary({ ...it, tier: "cached" })).toBe(false);
    expect(isTasteItinerary({ ...it, liveUnavailable: "yes" })).toBe(false);
  });
});
