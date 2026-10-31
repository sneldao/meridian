import { describe, expect, it, afterEach, beforeEach } from "bun:test";
import { NextRequest } from "next/server";
import { GET as crewGET } from "../src/app/api/crew/run/route";
import { readTripTaste, writeTripTaste } from "../src/lib/use-trip-taste";
import type { TasteEntity } from "../src/domain/taste";

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
      { headers: { "x-forwarded-for": "198.51.100.9" } },
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
