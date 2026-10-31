import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { loadTasteContext, withTasteItinerary } from "../src/agents/taste-context";
import { buildTasteItinerary } from "../src/domain/taste-itinerary";
import type { DestinationPlace, TasteContext, TasteEntity } from "../src/domain/taste";
import { itineraryMatchesTrip, isTasteItinerary, parseTasteFavorites } from "../src/domain/taste";
import { buildTrip } from "../src/domain/fixtures";
import type { CalendarEvent, CrewEvent, DayPlan, Intervention, Trip } from "../src/domain/types";

const trip = buildTrip("LHR", "HND", "2026-05-10", { postFlightDays: 3 });
const postDays = trip.days.filter((d) => d.dayIndex > trip.departureDayIndex);

const iv = (kind: Intervention["kind"], startMin: number, endMin?: number): Intervention => ({
  kind,
  startMin,
  endMin,
  note: "",
});

const dayPlan = (spec: { dayIndex: number; label: string }): DayPlan => ({
  dayIndex: spec.dayIndex,
  label: spec.label,
  shiftMin: 60,
  targetWakeMin: 420,
  targetBedtimeMin: 1320,
  interventions: [
    iv("sleep_window", 1320, 420),
    iv("light_exposure", 600, 660),
    iv("meal_timing", 720, 750),
    iv("avoid_light", 1020, 1140),
    iv("nap", 780, 840),
  ],
});

const days = postDays.map(dayPlan);

const favorites: TasteEntity[] = [
  { id: "e1", name: "Phoebe Bridgers", type: "artist" },
];
const places: DestinationPlace[] = [
  { name: "Kissa Tanto", categories: ["listening bar"] },
  { name: "Record Shop", categories: [] },
  { name: "Garden Cafe", categories: ["cafe", "quiet"] },
];
const ctx = (over: Partial<TasteContext> = {}): TasteContext => ({
  favorites,
  status: "ready",
  places,
  ...over,
});

const calEvent = (over: Partial<CalendarEvent>): CalendarEvent => ({
  id: "e1",
  title: "Meeting",
  dayIndex: postDays[0].dayIndex,
  startMin: 660,
  endMin: 720,
  movable: true,
  ...over,
});

describe("buildTasteItinerary", () => {
  it("finds the first free hour after arrival, in Qloo order, one per day", () => {
    const out = buildTasteItinerary(trip, days, [calEvent({})], ctx(), "live");
    expect(out.status).toBe("ready");
    expect(out.planningMode).toBe("live");
    expect(out.destinationCode).toBe("HND");
    expect(out.departureDate).toBe("2026-05-10");
    expect(out.suggestions.length).toBe(3);
    const first = out.suggestions[0];
    expect(first.startMin).toBe(840);
    expect(first.endMin).toBe(900);
    expect(first.dayIndex).toBe(postDays[0].dayIndex);
    expect(first.label).toBe(postDays[0].label);
    expect(first.date).toBe(postDays[0].date);
    expect(first.place.name).toBe("Kissa Tanto");
    expect(out.suggestions.map((s) => s.dayIndex)).toEqual(postDays.map((d) => d.dayIndex));
    expect(out.suggestions.map((s) => s.place.name)).toEqual(places.map((p) => p.name));
  });

  it("is identical whether calendar input is sorted or not", () => {
    const three = [
      calEvent({ id: "a", startMin: 600, endMin: 800 }),
      calEvent({ id: "b", startMin: 750, endMin: 900 }),
      calEvent({ id: "c", startMin: 1000, endMin: 1100 }),
    ];
    const a = buildTasteItinerary(trip, days, three, ctx(), "live");
    const b = buildTasteItinerary(trip, days.slice().reverse(), three.slice().reverse(), ctx(), "live");
    expect(b).toEqual(a);
    expect(a.suggestions[0].startMin).toBe(900);
  });

  it("a previous post-flight day's crossing-midnight intervention blocks the next morning", () => {
    const napLate = { ...dayPlan(postDays[0]), interventions: [iv("sleep_window", 1320, 420), iv("nap", 1380, 690)] };
    const cleanNext = { ...dayPlan(postDays[1]), interventions: [iv("sleep_window", 1320, 420)] };
    const out = buildTasteItinerary(trip, [napLate, cleanNext, dayPlan(postDays[2])], [], ctx(), "live");
    const next = out.suggestions.find((x) => x.dayIndex === postDays[1].dayIndex);
    expect(next?.startMin).toBe(690);
  });

  it("fractional intervention times suppress the day's suggestion entirely", () => {
    const frac = days.map((d) => ({ ...d, interventions: [iv("light_exposure", 600.5, 660)] }));
    expect(buildTasteItinerary(trip, frac, [], ctx(), "live").status).toBe("no-window");
  });

  it("out-of-range calendar values never claim free time", () => {
    const bad = days.map((d) => ({ ...d }));
    const out = buildTasteItinerary(
      trip,
      bad,
      [calEvent({ startMin: 2500, endMin: 2600 })],
      ctx(),
      "live",
    );
    expect(out.suggestions.every((x) => x.dayIndex !== postDays[0].dayIndex)).toBe(true);
  });

  it("a moved event frees its old slot and blocks its new one", () => {
    const out = buildTasteItinerary(
      trip,
      days,
      [calEvent({ movedTo: { dayIndex: postDays[0].dayIndex, startMin: 840, endMin: 900 } })],
      ctx(),
      "live",
    );
    expect(out.suggestions[0].startMin).toBe(660);
    expect(out.suggestions[0].endMin).toBe(720);
  });

  it("never suggests before or on the flight day", () => {
    const allDays = trip.days.map(dayPlan);
    const out = buildTasteItinerary(trip, allDays, [], ctx(), "live");
    expect(out.suggestions.every((s) => s.dayIndex > trip.departureDayIndex)).toBe(true);
  });

  it("caps at three and at the number of places", () => {
    const two = buildTasteItinerary(trip, days, [], ctx({ places: places.slice(0, 2) }), "live");
    expect(two.suggestions.length).toBe(2);
  });

  it("an overnight calendar event spilling into the day blocks the window", () => {
    const late = days.map((d) => ({ ...d }));
    const out = buildTasteItinerary(
      trip,
      late,
      [calEvent({ id: "late", dayIndex: postDays[0].dayIndex - 1, startMin: 1380, endMin: 700 })],
      ctx(),
      "live",
    );
    expect(out.suggestions[0].startMin).toBe(840);
  });

  it("a morning-wrapping avoid_light block pushes the first gap later", () => {
    const wrapped = days.map((d) => ({
      ...d,
      interventions: [
        iv("sleep_window", 1320, 420),
        iv("avoid_light", 1080, 700),
        iv("meal_timing", 720, 750),
        iv("nap", 780, 840),
      ],
    }));
    const out = buildTasteItinerary(trip, wrapped, [], ctx(), "live");
    expect(out.suggestions[0].startMin).toBe(840);
  });

  it("a full-day calendar event yields no-window, not a squeeze", () => {
    const out = buildTasteItinerary(
      trip,
      days,
      [calEvent({ dayIndex: postDays[0].dayIndex, startMin: 0, endMin: 1440 })],
      ctx(),
      "live",
    );
    expect(out.suggestions.every((s) => s.dayIndex !== postDays[0].dayIndex)).toBe(true);
    expect(out.suggestions.length).toBe(2);
    expect(out.status).toBe("ready");
    const full = buildTasteItinerary(
      trip,
      days.slice(0, 1),
      [calEvent({ dayIndex: postDays[0].dayIndex, startMin: 0, endMin: 1440 })],
      ctx(),
      "live",
    );
    expect(full.status).toBe("no-window");
    expect(full.suggestions).toEqual([]);
  });

  it("non-ready contexts pass through with no suggestions", () => {
    const noMatch = buildTasteItinerary(trip, days, [], ctx({ status: "no-matches", places: [] }), "replay");
    expect(noMatch.status).toBe("no-matches");
    expect(noMatch.suggestions).toEqual([]);
    const off = buildTasteItinerary(trip, days, [], ctx({ status: "unavailable", places: [] }), "live");
    expect(off.status).toBe("unavailable");
  });

  it("malformed inputs suppress suggestions rather than inventing them", () => {
    const broken = days.map((d) => ({ ...d, targetBedtimeMin: NaN }));
    expect(buildTasteItinerary(trip, broken, [], ctx(), "live").status).toBe("no-window");
    const badIv = days.map((d) => ({ ...d, interventions: [iv("light_exposure", -5, 50)] }));
    expect(buildTasteItinerary(trip, badIv, [], ctx(), "live").status).toBe("no-window");
    const dup = [...days, { ...days[0] }];
    const out = buildTasteItinerary(trip, dup, [], ctx(), "live");
    expect(out.suggestions.filter((s) => s.dayIndex === days[0].dayIndex).length).toBe(1);
  });

  it("does not mutate its inputs", () => {
    const daysCopy = JSON.parse(JSON.stringify(days));
    const calCopy = JSON.parse(JSON.stringify([calEvent({})]));
    buildTasteItinerary(trip, days, [calEvent({})], ctx(), "live");
    expect(days).toEqual(daysCopy);
    expect([calEvent({})][0]).toEqual(calCopy[0]);
  });

  it("output validates against isTasteItinerary and matches the trip", () => {
    const out = buildTasteItinerary(trip, days, [calEvent({})], ctx(), "replay");
    expect(isTasteItinerary(out)).toBe(true);
    expect(itineraryMatchesTrip(out, trip)).toBe(true);
    const other = buildTrip("LHR", "JFK", "2026-05-10", { postFlightDays: 3 });
    expect(itineraryMatchesTrip(out, other)).toBe(false);
  });

  it("untrusted trip payloads return false, never throw", () => {
    const out = buildTasteItinerary(trip, days, [], ctx(), "live");
    expect(itineraryMatchesTrip(out, null as unknown as Trip)).toBe(false);
    expect(itineraryMatchesTrip(out, { destination: null, days: [], departureDayIndex: 3 } as unknown as Trip)).toBe(false);
    expect(itineraryMatchesTrip(out, { ...trip, days: [null] as unknown as Trip["days"] })).toBe(false);
    expect(itineraryMatchesTrip(out, { ...trip, departureDayIndex: 1.5 })).toBe(false);
  });
});

describe("parseTasteFavorites", () => {
  it("round-trips valid favorites incl. unicode names, deduped", () => {
    const raw = JSON.stringify([
      { id: "a1", name: " Björk ", type: "artist" },
      { id: "a1", name: "Björk", type: "artist" },
      { id: "m9", name: "Past Lives", type: "movie" },
    ]);
    expect(parseTasteFavorites(raw)).toEqual([
      { id: "a1", name: "Björk", type: "artist" },
      { id: "m9", name: "Past Lives", type: "movie" },
    ]);
  });

  it("rejects malformed input wholesale", () => {
    expect(parseTasteFavorites(null)).toEqual([]);
    expect(parseTasteFavorites("not json")).toBeNull();
    expect(parseTasteFavorites("{}")).toBeNull();
    expect(parseTasteFavorites(JSON.stringify([{ id: "bad id", name: "X", type: "artist" }]))).toBeNull();
    expect(parseTasteFavorites(JSON.stringify([{ id: "a", name: "", type: "artist" }]))).toBeNull();
    expect(parseTasteFavorites(JSON.stringify([{ id: "a", name: "x".repeat(101), type: "artist" }]))).toBeNull();
    expect(parseTasteFavorites(JSON.stringify([{ id: "a", name: "X", type: "podcast" }]))).toBeNull();
    expect(parseTasteFavorites(JSON.stringify([1, 2, 3]))).toBeNull();
    expect(parseTasteFavorites(JSON.stringify([
      { id: "a", name: "A", type: "artist" },
      { id: "b", name: "B", type: "artist" },
      { id: "c", name: "C", type: "artist" },
      { id: "d", name: "D", type: "artist" },
    ]))).toBeNull();
  });
});

describe("isTasteItinerary", () => {
  const good = buildTasteItinerary(trip, days, [], ctx(), "live");
  it("accepts a real build and rejects tampered payloads", () => {
    expect(isTasteItinerary(good)).toBe(true);
    expect(isTasteItinerary({ ...good, status: "ready", suggestions: [] })).toBe(false);
    expect(isTasteItinerary({ ...good, status: "no-window" })).toBe(false);
    expect(isTasteItinerary({ ...good, destinationCode: "" })).toBe(false);
    expect(isTasteItinerary({ ...good, departureDate: "2026-02-30" })).toBe(false);
    expect(isTasteItinerary({ ...good, favorites: [] })).toBe(false);
    expect(
      isTasteItinerary({
        ...good,
        suggestions: [{ ...good.suggestions[0], endMin: good.suggestions[0].startMin + 30 }],
      }),
    ).toBe(false);
    expect(
      isTasteItinerary({
        ...good,
        suggestions: [{ ...good.suggestions[0], place: { name: "X", categories: [42] } }],
      }),
    ).toBe(false);
    expect(isTasteItinerary(null)).toBe(false);
    expect(
      isTasteItinerary({
        ...good,
        suggestions: [good.suggestions[0], { ...good.suggestions[0], label: "same index" }],
      }),
    ).toBe(false);
    expect(
      isTasteItinerary({
        ...good,
        suggestions: [{ ...good.suggestions[0], date: "2026-02-30" }],
      }),
    ).toBe(false);
  });
});

const entitiesJson = (rows: unknown[]) => JSON.stringify({ results: { entities: rows } });
const stub = (fn: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>) =>
  fn as unknown as typeof fetch;
const realFetch = globalThis.fetch;
const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ["QLOO_API_KEY", "QLOO_BASE_URL", "AGENT_PROVIDER", "REPLAY_BEAT_MS"] as const;

beforeEach(() => {
  for (const k of ENV_KEYS) { savedEnv[k] = process.env[k]; delete process.env[k]; }
});
afterEach(() => {
  for (const k of ENV_KEYS) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }
  globalThis.fetch = realFetch;
});

describe("loadTasteContext", () => {
  it("fetches once with the favorite ids and reports honest status", async () => {
    process.env.QLOO_API_KEY = "qk";
    const calls: string[] = [];
    globalThis.fetch = stub(async (url) => {
      calls.push(String(url));
      return new Response(entitiesJson([{ name: "Venue A", tags: [{ type: "urn:tag:category:place", name: "Cafe" }] }]), { status: 200 });
    });
    const out = await loadTasteContext(trip, favorites);
    expect(out.status).toBe("ready");
    expect(out.places[0].name).toBe("Venue A");
    expect(out.favorites).toEqual(favorites);
    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("signal.interests.entities=e1");
    expect(calls.every((c) => !c.includes("/search"))).toBe(true);
  });

  it("no key means unavailable without any fetch; failure is unavailable, never thrown", async () => {
    globalThis.fetch = stub(async () => { throw new Error("must not fetch"); });
    expect((await loadTasteContext(trip, favorites)).status).toBe("unavailable");
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async () => new Response("x", { status: 500 }));
    expect((await loadTasteContext(trip, favorites)).status).toBe("unavailable");
    globalThis.fetch = stub(async () => new Response(entitiesJson([]), { status: 200 }));
    expect((await loadTasteContext(trip, favorites)).status).toBe("no-matches");
  });
});

describe("withTasteItinerary (replay stream wrapper)", () => {
  const mkEvent = (e: CrewEvent) => e;
  async function* fakeStream(t: Trip, cal: CalendarEvent[], locked: DayPlan[]): AsyncGenerator<CrewEvent> {
    yield mkEvent({ type: "run_start", provider: "replay", trip: t, baseline: {} as never, calendar: cal });
    yield mkEvent({ type: "calendar_move", move: { eventId: "e1", title: "Meeting", from: { dayIndex: 4, startMin: 660, endMin: 720 }, to: { dayIndex: 4, startMin: 840, endMin: 900 }, reason: "r" } });
    yield mkEvent({ type: "briefing", summary: "s", ics: "i", score: 1, citations: [], days: locked, coverage: {} as never });
    yield mkEvent({ type: "done" });
  }

  it("attaches a deterministic itinerary, folding moves, preserving every field", async () => {
    const cal = [calEvent({ id: "e1", dayIndex: postDays[0].dayIndex })];
    const context = Promise.resolve(ctx());
    const seen: CrewEvent[] = [];
    for await (const e of withTasteItinerary(fakeStream(trip, cal, days), context)) seen.push(e);
    expect(seen.map((e) => e.type)).toEqual(["run_start", "calendar_move", "briefing", "done"]);
    const b = seen[2];
    expect(b.type).toBe("briefing");
    if (b.type === "briefing") {
      expect(b.summary).toBe("s");
      expect(b.tasteItinerary?.planningMode).toBe("replay");
      expect(b.tasteItinerary?.suggestions[0].startMin).toBe(660);
      expect(isTasteItinerary(b.tasteItinerary)).toBe(true);
    }
    expect(seen[3].type).toBe("done");
  });

  it("unavailable context still lets briefing and done through", async () => {
    const context = Promise.resolve(ctx({ status: "unavailable", places: [] }));
    const seen: CrewEvent[] = [];
    for await (const e of withTasteItinerary(fakeStream(trip, [], days), context)) seen.push(e);
    const b = seen[2];
    if (b.type === "briefing") {
      expect(b.tasteItinerary?.status).toBe("unavailable");
      expect(b.tasteItinerary?.suggestions).toEqual([]);
    }
    expect(seen[3].type).toBe("done");
  });
});

describe("runCrew replay integration", () => {
  let runCrew: typeof import("../src/agents/runtime").runCrew;
  const collect = async (opts?: Parameters<typeof runCrew>[0]) => {
    if (!runCrew) runCrew = (await import("../src/agents/runtime")).runCrew;
    const seen: CrewEvent[] = [];
    for await (const e of runCrew(opts)) seen.push(e);
    return seen;
  };

  it("favorites produce a real itinerary on the final briefing, mode replay", async () => {
    process.env.AGENT_PROVIDER = "replay";
    process.env.REPLAY_BEAT_MS = "0";
    process.env.QLOO_API_KEY = "qk";
    let calls = 0;
    globalThis.fetch = stub(async (url) => {
      calls++;
      expect(String(url)).toContain("signal.interests.entities=e1");
      return new Response(entitiesJson([
        { name: "Venue A", tags: [{ type: "urn:tag:category:place", name: "Cafe" }] },
        { name: "Venue B", tags: [{ type: "urn:tag:category:place", name: "Hotel" }] },
      ]), { status: 200 });
    });
    const events = await collect({ trip, tasteFavorites: favorites });
    const briefing = events.find((e) => e.type === "briefing");
    expect(briefing).toBeDefined();
    if (briefing?.type === "briefing") {
      expect(briefing.tasteItinerary).toBeDefined();
      expect(briefing.tasteItinerary!.planningMode).toBe("replay");
      expect(briefing.tasteItinerary!.favorites).toEqual(favorites);
      expect(isTasteItinerary(briefing.tasteItinerary)).toBe(true);
    }
    expect(calls).toBe(1);
    expect(events.some((e) => e.type === "done")).toBe(true);
  }, 30000);

  it("no favorites means the exact old stream — no itinerary, no Qloo call", async () => {
    process.env.AGENT_PROVIDER = "replay";
    process.env.REPLAY_BEAT_MS = "0";
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async () => { throw new Error("must not fetch"); });
    const events = await collect({ trip });
    const briefing = events.find((e) => e.type === "briefing");
    if (briefing?.type === "briefing") expect(briefing.tasteItinerary).toBeUndefined();
    expect(events.some((e) => e.type === "done")).toBe(true);
  }, 30000);

  it("a Qloo outage degrades to an unavailable itinerary, run still completes", async () => {
    process.env.AGENT_PROVIDER = "replay";
    process.env.REPLAY_BEAT_MS = "0";
    process.env.QLOO_API_KEY = "qk";
    globalThis.fetch = stub(async () => new Response("x", { status: 503 }));
    const events = await collect({ trip, tasteFavorites: favorites });
    const briefing = events.find((e) => e.type === "briefing");
    if (briefing?.type === "briefing") {
      expect(briefing.tasteItinerary?.status).toBe("unavailable");
      expect(briefing.tasteItinerary?.suggestions).toEqual([]);
    }
    expect(events.some((e) => e.type === "done")).toBe(true);
  }, 30000);
});
