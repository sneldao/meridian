import { describe, expect, it, afterEach, beforeEach } from "bun:test";
import { NextRequest } from "next/server";
import { GET as crewGET } from "../src/app/api/crew/run/route";
import { POST as feedbackPOST } from "../src/app/api/taste/feedback/route";
import { readTasteProfile, readTripTaste, writeTasteProfile, writeTripTaste } from "../src/lib/use-trip-taste";
import { readTasteSignals, recordTasteSignal } from "../src/lib/taste-signals";
import type { TasteEntity } from "../src/domain/taste";
import { sessionCookieName } from "../src/lib/session";

const SESSION_COOKIE = `${sessionCookieName()}=${"b".repeat(64)}`;

const fakeStorage = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
};

const throwingStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
};

const faves: TasteEntity[] = [
  { id: "e1", name: "Björk", type: "artist" },
  { id: "m2", name: "Past Lives", type: "movie" },
];

describe("trip taste persistence", () => {
  it("round-trips favorites under a scoped key", () => {
    const s = fakeStorage();
    writeTripTaste(s, "LHR-HND-2026-05-10", faves);
    expect(readTripTaste(s, "LHR-HND-2026-05-10")).toEqual(faves);
    expect(s.map.get("meridian:taste:LHR-HND-2026-05-10")).toContain("Björk");
  });

  it("scopes are independent — each route reads only its own", () => {
    const s = fakeStorage();
    writeTripTaste(s, "LHR-HND-2026-05-10", faves);
    expect(readTripTaste(s, "SFO-JFK-2026-05-10")).toEqual([]);
    expect(readTripTaste(s, "example:2026-05-10")).toEqual([]);
  });

  it("malformed stored JSON reads as empty, never crashes", () => {
    const s = fakeStorage({ "meridian:taste:LHR-HND-2026-05-10": "{corrupt" });
    expect(readTripTaste(s, "LHR-HND-2026-05-10")).toEqual([]);
    const s2 = fakeStorage({ "meridian:taste:LHR-HND-2026-05-10": JSON.stringify([{ id: "bad id", name: "X", type: "artist" }]) });
    expect(readTripTaste(s2, "LHR-HND-2026-05-10")).toEqual([]);
  });

  it("the self profile is the traveller's remembered taste — scoped trips still read only their own", () => {
    const s = fakeStorage();
    writeTasteProfile(s, faves);
    expect(readTasteProfile(s)).toEqual(faves);
    expect(s.map.get("meridian:taste:self")).toContain("Björk");
    // the hook owns the fallback to self; scoped reads stay pure
    expect(readTripTaste(s, "SFO-JFK-2026-05-10")).toEqual([]);
    expect(readTripTaste(s, "example:2026-05-10")).toEqual([]);
  });

  it("writeTripTaste validates and normalizes before touching storage", () => {
    const s = fakeStorage();
    writeTripTaste(s, "scope", [{ id: "e1", name: "  Björk  ", type: "artist" } as TasteEntity]);
    expect(readTripTaste(s, "scope")).toEqual([{ id: "e1", name: "Björk", type: "artist" }]);
    expect(() =>
      writeTripTaste(s, "scope", [{ id: "bad id", name: "X", type: "artist" } as TasteEntity]),
    ).toThrow();
    expect(readTripTaste(s, "scope")).toEqual([{ id: "e1", name: "Björk", type: "artist" }]);
  });

  it("a throwing store propagates — callers must not claim a save", () => {
    expect(() => readTripTaste(throwingStorage, "scope")).toThrow();
    expect(() => writeTripTaste(throwingStorage, "scope", faves)).toThrow();
    expect(throwingStorage.getItem).toBeDefined();
  });
});

const realFetch2 = globalThis.fetch;
beforeEach(() => { globalThis.fetch = realFetch2; });
afterEach(() => { globalThis.fetch = realFetch2; });

describe("GET /api/crew/run taste validation", () => {
  const req = (taste: string) =>
    new NextRequest(
      `https://x.test/api/crew/run?origin=LHR&dest=HND&date=2026-05-10&taste=${taste}`,
      { headers: { "x-forwarded-for": "198.51.100.9", cookie: SESSION_COOKIE } },
    );

  it("rejects malformed favorites with 400 before any upstream work", async () => {
    let fetched = 0;
    globalThis.fetch = (async () => { fetched++; throw new Error("must not fetch"); }) as unknown as typeof fetch;
    try {
      for (const bad of [
        encodeURIComponent("{corrupt"),
        encodeURIComponent(JSON.stringify([{ id: "a", name: "X", type: "podcast" }])),
        encodeURIComponent(JSON.stringify([
          { id: "a", name: "A", type: "artist" },
          { id: "b", name: "B", type: "artist" },
          { id: "c", name: "C", type: "artist" },
          { id: "d", name: "D", type: "artist" },
        ])),
      ]) {
        const res = await crewGET(req(bad));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain("invalid taste favorites");
      }
      expect(fetched).toBe(0);
    } finally {
      globalThis.fetch = realFetch2;
    }
  });
});

describe("local taste signals", () => {
  it("kept and dismissed round-trip; latest verdict wins", () => {
    const s = fakeStorage();
    const place = { id: "p1", name: "Mori Art Museum", categories: [] };
    recordTasteSignal(s, "kept", place);
    recordTasteSignal(s, "dismissed", { name: "Tokyo Disneyland", categories: [] });
    const m = readTasteSignals(s);
    expect(m.kept).toEqual(["p1"]);
    expect(m.dismissed).toEqual([{ name: "Tokyo Disneyland" }]);
    // a later verdict flips the earlier one, it doesn't stack
    recordTasteSignal(s, "dismissed", place);
    expect(readTasteSignals(s).kept).toEqual([]);
    expect(readTasteSignals(s).dismissed).toContainEqual({ id: "p1", name: "Mori Art Museum" });
  });

  it("corrupt storage reads as empty, never crashes", () => {
    const s = fakeStorage({ "meridian:taste-signals": "{corrupt" });
    expect(readTasteSignals(s)).toEqual({ kept: [], dismissed: [] });
  });
});

describe("POST /api/taste/feedback", () => {
  const post = (body: unknown) =>
    new NextRequest("https://x.test/api/taste/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", cookie: SESSION_COOKIE },
      body: JSON.stringify(body),
    });

  it("denies a verdict without a session", async () => {
    const res = await feedbackPOST(
      new NextRequest("https://x.test/api/taste/feedback", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9" },
        body: JSON.stringify({ status: "dismissed", place: { name: "Tokyo Disneyland" } }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("accepts a verdict and stays quiet — the graph write is best-effort", async () => {
    const res = await feedbackPOST(
      post({ status: "dismissed", place: { id: "p1", name: "Tokyo Disneyland" } }),
    );
    expect(res.status).toBe(204);
  });

  it("rejects malformed signals before any write", async () => {
    for (const bad of [
      null,
      { status: "loved", place: { name: "X" } },
      { status: "kept" },
      { status: "kept", place: { name: "" } },
      { status: "kept", place: { name: "X".repeat(301) } },
      { status: "kept", place: { id: "bad id!", name: "X" } },
    ]) {
      const res = await feedbackPOST(post(bad));
      expect(res.status).toBe(400);
    }
  });
});

describe("the landing's crate seeds", () => {
  it("every sample crate round-trips through a trip's taste scope", async () => {
    const { SAMPLE_TASTE_CRATES } = await import("../src/lib/sample-taste");
    // Story order on the landing: the film's dispatch leads.
    expect(SAMPLE_TASTE_CRATES.map((c) => c.key)).toEqual(["diego", "bjork", "luke"]);
    for (const crate of SAMPLE_TASTE_CRATES) {
      expect(crate.crateLabel.length).toBeGreaterThan(0);
      const s = new (class {
        m = new Map<string, string>();
        getItem(k: string) { return this.m.get(k) ?? null; }
        setItem(k: string, v: string) { this.m.set(k, v); }
      })();
      // The exact scope shape page.tsx reads on arrival in trip mode.
      const scope = `JFK-MEX-2026-11-07`;
      writeTripTaste(s, scope, crate.favorites);
      expect(readTripTaste(s, scope)).toEqual(crate.favorites);
    }
  });
});

describe("splitSamplePlaces — daytime fits, evening offers", () => {
  it("splits Diego's crate so the mezcaleria leads the night", async () => {
    const { sampleTasteProfile, splitSamplePlaces } = await import("../src/lib/sample-taste");
    const diego = sampleTasteProfile("diego")!;
    const { daytime, evening } = splitSamplePlaces(diego.places);
    // The evening-only venue is never a daytime candidate…
    expect(daytime.map((p) => p.name)).toEqual(["Galería OMR", "Mercado de Medellín"]);
    // …and it leads the evening list ahead of venues that also fit by day,
    // so firstNight is La Botica, not the gallery.
    expect(evening.map((p) => p.name)).toEqual(["La Botica", "Galería OMR"]);
  });

  it("recorded Tokyo crates have no evening leg", async () => {
    const { sampleTasteProfile, splitSamplePlaces } = await import("../src/lib/sample-taste");
    for (const key of ["bjork", "luke"] as const) {
      const { daytime, evening } = splitSamplePlaces(sampleTasteProfile(key)!.places);
      expect(daytime.length).toBeGreaterThan(0);
      expect(evening).toEqual([]);
    }
  });
});

describe("matchSampleProfileForTrip — the crate the door packed", () => {
  it("matches on city + full crate, ignores extra favourites, refuses wrong cities", async () => {
    const { matchSampleProfileForTrip, sampleTasteProfile } = await import("../src/lib/sample-taste");
    const diego = sampleTasteProfile("diego")!;
    expect(matchSampleProfileForTrip("Mexico City", diego.favorites)?.key).toBe("diego");
    expect(
      matchSampleProfileForTrip("Mexico City", [
        ...diego.favorites,
        { id: "extra-1", name: "Caifanes", type: "artist" },
      ])?.key,
    ).toBe("diego");
    expect(matchSampleProfileForTrip("Tokyo", diego.favorites)).toBeNull();
    expect(matchSampleProfileForTrip("Mexico City", [])).toBeNull();
  });
});

describe("the provenance labels, named once upstream", () => {
  it("every label says not-a-live-lookup or names Qloo — never both voices", async () => {
    const { sampleSourceLabel, tasteSignalsLabel, ideaSourceLabel, sampleTasteProfile, sampleTasteLabel } =
      await import("../src/lib/sample-taste");
    expect(sampleSourceLabel("imagined")).toContain("not a live lookup");
    expect(sampleSourceLabel("recorded")).toContain("not a live lookup");
    expect(tasteSignalsLabel("imagined")).toBe("Imagined sample signals: ");
    expect(tasteSignalsLabel("recorded")).toBe("Recorded sample signals: ");
    expect(tasteSignalsLabel(undefined)).toBe("Qloo taste signals: ");
    expect(ideaSourceLabel(undefined)).toBe("Qloo place idea · optional");
    expect(ideaSourceLabel("recorded")).toContain("optional");
    // The profile-label helper delegates to the source label.
    expect(sampleTasteLabel(sampleTasteProfile("diego"))).toBe(sampleSourceLabel("imagined"));
  });

  it("every crate carries the route its story flies", async () => {
    const { SAMPLE_TASTE_CRATES } = await import("../src/lib/sample-taste");
    const routes = Object.fromEntries(SAMPLE_TASTE_CRATES.map((c) => [c.key, c.sampleRoute]));
    expect(routes.diego).toEqual({ origin: "JFK", dest: "MEX" });
    expect(routes.bjork).toEqual({ origin: "LHR", dest: "HND" });
    expect(routes.luke).toEqual({ origin: "LHR", dest: "HND" });
  });
});

describe("tasteGraphPhrase — the graph named by its real source", () => {
  it("a live lookup credits Qloo; samples say what they are", async () => {
    const { tasteGraphPhrase } = await import("../src/lib/sample-taste");
    expect(tasteGraphPhrase(undefined)).toBe("Qloo's taste graph, not a location search");
    expect(tasteGraphPhrase("recorded")).toContain("recorded Qloo taste graph");
    expect(tasteGraphPhrase("imagined")).toContain("imagined taste graph");
    expect(tasteGraphPhrase("recorded")).toContain("not a location search");
    expect(tasteGraphPhrase("imagined")).toContain("not a location search");
  });
});
