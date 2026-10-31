import { describe, expect, test } from "bun:test";
import { meridianStorageKeys, safeStorageGet } from "../src/lib/local-data";

describe("meridianStorageKeys", () => {
  const fake = (map: Map<string, string>) => ({
    get length() { return map.size; },
    key: (i: number) => [...map.keys()][i] ?? null,
  });

  test("enumerates every meridian: key and nothing else", () => {
    const store = new Map([
      ["meridian:activeTrip", "1"],
      ["meridian:actions:LHR-HND-2026-05-07", "1"],
      ["meridian:completedNudges:LHR-HND-2026-05-07", "1"],
      ["meridian:pendingCheckins:LHR-HND-2026-05-07", "1"],
      ["meridian:lastPlan", "1"],
      ["meridian:lastTrip", "1"],
      ["meridian:history", "1"],
      ["meridian:wakeBand", "1"],
      ["other-app:key", "1"],
      ["theme", "1"],
    ]);
    const keys = meridianStorageKeys(fake(store));
    expect(keys.length).toBe(8);
    expect(keys.every((k) => k.startsWith("meridian:"))).toBe(true);
    expect(keys).not.toContain("other-app:key");
    expect(keys).not.toContain("theme");
  });

  test("empty storage enumerates nothing", () => {
    expect(meridianStorageKeys(fake(new Map()))).toEqual([]);
  });
});

describe("safeStorageGet", () => {
  test("a throwing read yields null, never a strand", () => {
    expect(safeStorageGet(() => { throw new Error("blocked"); })).toBeNull();
    expect(safeStorageGet(() => "value")).toBe("value");
    expect(safeStorageGet(() => null)).toBeNull();
  });
});
