import { describe, expect, it } from "bun:test";
import { parsePlaceChoices, resolvePlaceChoice, type PlaceChoiceState } from "../src/lib/place-choices";
import { placeKey, tasteSelectionKey, type DestinationPlace, type TasteItinerary } from "../src/domain/taste";

const P = (name: string, id?: string): DestinationPlace => ({ name, categories: ["cafe"], ...(id ? { id } : {}) });
const itin = (places: DestinationPlace[], sugIdx = 0): TasteItinerary => ({
  destinationCode: "HND",
  destination: "Tokyo",
  departureDate: "2026-05-10",
  favorites: [{ id: "e1", name: "Björk", type: "artist" }],
  status: "ready",
  planningMode: "live",
  suggestions: [
    { dayIndex: 4, date: "2026-05-11", label: "D+1", startMin: 840, endMin: 900, place: places[sugIdx] },
    { dayIndex: 5, date: "2026-05-12", label: "D+2", startMin: 600, endMin: 660, place: places[Math.min(1, places.length - 1)] },
  ],
  alternatives: places,
});
const key = tasteSelectionKey([{ id: "e1", name: "Björk", type: "artist" }]);
const sugOf = (i: TasteItinerary, d = 0) => i.suggestions[d];

describe("parsePlaceChoices", () => {
  it("accepts valid, rejects malformed rows without crashing", () => {
    const raw = JSON.stringify({ "2026-05-11": { status: "kept", place: P("Cafe A", "id1"), tasteKey: key } });
    expect(Object.keys(parsePlaceChoices(raw))).toEqual(["2026-05-11"]);
    expect(parsePlaceChoices("{bad")).toEqual({});
    expect(parsePlaceChoices(JSON.stringify({ "2026-05-11": { status: "loved", place: P("X"), tasteKey: key } }))).toEqual({});
    expect(parsePlaceChoices(JSON.stringify({ "not-a-date": { status: "kept", place: P("X"), tasteKey: key } }))).toEqual({});
  });
});

describe("resolvePlaceChoice", () => {
  const places = [P("Alpha", "a1"), P("Beta", "b2"), P("Gamma", "g3")];
  const i = itin(places);

  it("no choice -> suggested with alternatives excluding own + other dates' originals", () => {
    const r = resolvePlaceChoice(i, sugOf(i), {});
    expect(r.status).toBe("suggested");
    expect(r.place.name).toBe("Alpha");
    expect(r.alternatives.map((p) => p.name)).toEqual(["Gamma"]);
  });

  it("duplicate names with distinct ids resolve by id", () => {
    const dup = [P("Cafe", "x1"), P("Cafe", "x2"), P("Other", "y1")];
    const i2 = itin(dup);
    const st: PlaceChoiceState = { "2026-05-11": { status: "kept", place: dup[1], tasteKey: key } };
    const r = resolvePlaceChoice(i2, sugOf(i2), st);
    expect(r.status).toBe("kept");
    expect(r.place.id).toBe("x2");
  });

  it("kept place missing from new pool -> unavailable, exposes savedPlace, not scheduled", () => {
    const st: PlaceChoiceState = { "2026-05-11": { status: "kept", place: P("Gone", "zz"), tasteKey: key } };
    const r = resolvePlaceChoice(i, sugOf(i), st);
    expect(r.status).toBe("unavailable");
    expect(r.savedPlace?.name).toBe("Gone");
    expect(r.place.name).toBe("Alpha");
  });

  it("changed favorites fingerprint ignores stale choices", () => {
    const st: PlaceChoiceState = { "2026-05-11": { status: "dismissed", place: places[0], tasteKey: "other" } };
    expect(resolvePlaceChoice(i, sugOf(i), st).status).toBe("suggested");
  });

  it("dismissed stays dismissed; kept on another date is not offered", () => {
    const st: PlaceChoiceState = {
      "2026-05-11": { status: "dismissed", place: places[0], tasteKey: key },
      "2026-05-12": { status: "kept", place: places[2], tasteKey: key },
    };
    expect(resolvePlaceChoice(i, sugOf(i), st).status).toBe("dismissed");
    const r2 = resolvePlaceChoice(i, sugOf(i), st);
    expect(r2.alternatives.map((p) => p.name)).not.toContain("Gamma");
  });

  it("depleted pool yields empty alternatives", () => {
    const tiny = itin([P("Only", "o1")]);
    tiny.suggestions = [tiny.suggestions[0]];
    tiny.alternatives = [P("Only", "o1")];
    const r = resolvePlaceChoice(tiny, sugOf(tiny), {});
    expect(r.alternatives).toEqual([]);
  });

  it("no-id places key by normalized name", () => {
    expect(placeKey(P("  Café  "))).toBe("café");
    expect(placeKey(P("Cafe", "ID"))).toBe("ID");
  });
});

import { readPlaceChoices, writePlaceChoices } from "../src/lib/place-choices";
import { shareTripContext } from "../src/lib/share-trip";
import { itineraryMatchesTrip, isTasteItinerary } from "../src/domain/taste";
import { buildTrip } from "../src/domain/fixtures";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TasteItineraryCard } from "../src/components/TasteItineraryCard";

describe("sequential swap allocation", () => {
  const ps = [P("Alpha", "a"), P("Beta", "b"), P("Gamma", "c"), P("Delta", "d")];
  const t = itin(ps);
  const d1 = "2026-05-11", d2 = "2026-05-12";

  it("swaps advance through the pool and never revisit", () => {
    const r0 = resolvePlaceChoice(t, sugOf(t), {});
    expect(r0.place.id).toBe("a");
    expect(r0.alternatives.map((p) => p.id)).toEqual(["c", "d"]);
    const s1: PlaceChoiceState = { [d1]: { status: "swapped", place: ps[2], tasteKey: key } };
    const r1 = resolvePlaceChoice(t, sugOf(t), s1);
    expect(r1.place.id).toBe("c");
    expect(r1.alternatives.map((p) => p.id)).toEqual(["d"]);
    const s2: PlaceChoiceState = { [d1]: { status: "swapped", place: ps[3], tasteKey: key } };
    const r2 = resolvePlaceChoice(t, sugOf(t), s2);
    expect(r2.place.id).toBe("d");
    expect(r2.alternatives).toEqual([]);
    const s3: PlaceChoiceState = { [d1]: { status: "kept", place: ps[3], tasteKey: key } };
    const r3 = resolvePlaceChoice(t, sugOf(t), s3);
    expect(r3.status).toBe("kept");
    expect(r3.place.id).toBe("d");
    const s4: PlaceChoiceState = { [d1]: { status: "swapped", place: ps[3], tasteKey: key } };
    const r4 = resolvePlaceChoice(t, sugOf(t), s4);
    expect(r4.status).toBe("suggested");
    expect(r4.place.id).toBe("d");
  });

  it("replan with kept choice uses new times and never duplicates across days", () => {
    const t2 = JSON.parse(JSON.stringify(t)) as ReturnType<typeof itin>;
    const st: PlaceChoiceState = { [d1]: { status: "kept", place: ps[0], tasteKey: key } };
    t2.suggestions = [
      { dayIndex: 4, date: d1, label: "D+1", startMin: 900, endMin: 960, place: ps[1] },
      { dayIndex: 5, date: d2, label: "D+2", startMin: 600, endMin: 660, place: ps[0] },
    ];
    const before = JSON.stringify({ t: t2, st });
    const r1 = resolvePlaceChoice(t2, t2.suggestions[0], st);
    expect(r1.status).toBe("kept");
    expect(r1.place.id).toBe("a");
    expect(r1.suggestion.startMin).toBe(900);
    const r2 = resolvePlaceChoice(t2, t2.suggestions[1], st);
    expect(r2.place.id).not.toBe("a");
    expect(r2.place.id).not.toBe(r1.place.id);
    expect(JSON.stringify({ t: t2, st })).toBe(before);
  });

  it("duplicate explicit claims: earlier date wins, later reserved with restore", () => {
    const st: PlaceChoiceState = {
      [d1]: { status: "kept", place: ps[0], tasteKey: key },
      [d2]: { status: "kept", place: ps[0], tasteKey: key },
    };
    const early = resolvePlaceChoice(t, sugOf(t), st);
    const late = resolvePlaceChoice(t, sugOf(t, 1), st);
    expect(early.status).toBe("kept");
    expect(early.place.id).toBe("a");
    expect(late.status).toBe("unavailable");
    expect(late.unavailableReason).toBe("reserved");
    const cleared = resolvePlaceChoice(t, sugOf(t, 1), { [d1]: st[d1] });
    expect(cleared.status).not.toBe("unavailable");
    expect(cleared.place.id).not.toBe("a");
  });

  it("horizon shift keeps the date-keyed choice and the new window", () => {
    const t3 = JSON.parse(JSON.stringify(t)) as ReturnType<typeof itin>;
    t3.suggestions[0] = { dayIndex: 7, date: d1, label: "D+1", startMin: 960, endMin: 1020, place: ps[0] };
    const st: PlaceChoiceState = { [d1]: { status: "kept", place: ps[0], tasteKey: key } };
    const r = resolvePlaceChoice(t3, t3.suggestions[0], st);
    expect(r.status).toBe("kept");
    expect(r.suggestion.dayIndex).toBe(7);
    expect(r.suggestion.startMin).toBe(960);
  });

  it("missing pool place is unavailable with savedPlace", () => {
    const st: PlaceChoiceState = { [d1]: { status: "kept", place: P("Gone", "zz"), tasteKey: key } };
    const r = resolvePlaceChoice(t, sugOf(t), st);
    expect(r.status).toBe("unavailable");
    expect(r.unavailableReason).toBe("missing");
    expect(r.savedPlace?.id).toBe("zz");
  });
});

describe("choice storage seam", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const scope = "LHR-HND-2026-05-10";

  it("round-trips per scope; rejects invalid before mutating", () => {
    const s = store();
    expect(readPlaceChoices(s, scope)).toEqual({});
    const st: PlaceChoiceState = { "2026-05-11": { status: "kept", place: P("Alpha", "a"), tasteKey: key } };
    writePlaceChoices(s, scope, st);
    expect(readPlaceChoices(s, scope)).toEqual(st);
    expect(readPlaceChoices(s, "other")).toEqual({});
    expect(() => writePlaceChoices(s, scope, { "2026-02-30": st["2026-05-11"] })).toThrow();
    expect(readPlaceChoices(s, scope)).toEqual(st);
    expect(() => writePlaceChoices(s, scope, { "2026-05-11": { ...st["2026-05-11"], place: P("Bad", "bad id") } })).toThrow();
    const many: PlaceChoiceState = {};
    for (let i = 1; i <= 51; i++) {
      const d = new Date(Date.UTC(2026, 0, i)).toISOString().slice(0, 10);
      many[d] = { status: "kept", place: P("x".repeat(300), `id${i}`), tasteKey: "x".repeat(400) };
    }
    expect(() => writePlaceChoices(s, scope, many)).toThrow();
    const denied = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(() => readPlaceChoices(denied, scope)).toThrow();
    expect(() => writePlaceChoices(denied, scope, st)).toThrow();
  });
});

describe("share serializer roundtrip", () => {
  const ps = [P("Alpha", "a"), P("Beta", "b"), P("Gamma", "c")];
  const t = itin(ps);
  const trip = buildTrip("LHR", "HND", "2026-05-10", { postFlightDays: 2 });

  it("payload validates and the card reflects kept choice", () => {
    const payload = JSON.parse(JSON.stringify({
      trip: shareTripContext(trip),
      briefing: {
        tasteItinerary: t,
        tasteChoices: { "2026-05-11": { status: "kept", place: ps[2], tasteKey: key } },
      },
    }));
    const it = payload.briefing.tasteItinerary;
    expect(isTasteItinerary(it)).toBe(true);
    expect(itineraryMatchesTrip(it, payload.trip)).toBe(true);
    const html = renderToStaticMarkup(
      createElement(TasteItineraryCard, { itinerary: it, choices: parsePlaceChoices(JSON.stringify(payload.briefing.tasteChoices)) }),
    );
    expect(html).toContain("Gamma");
    expect(html).toContain("kept");
    expect(itineraryMatchesTrip(it, { ...payload.trip, destination: { code: "JFK" } })).toBe(false);
    expect(itineraryMatchesTrip(it, { ...payload.trip, days: payload.trip.days.map((d: {date:string}) => ({...d, date:"2026-06-01"})) })).toBe(false);
    const dismissed = renderToStaticMarkup(
      createElement(TasteItineraryCard, {
        itinerary: it,
        choices: parsePlaceChoices(JSON.stringify({ "2026-05-11": { status: "dismissed", place: ps[0], tasteKey: key } })),
      }),
    );
    expect(dismissed).toContain("Idea set aside");
    expect(dismissed).not.toContain("Gamma · kept");
  });
});
