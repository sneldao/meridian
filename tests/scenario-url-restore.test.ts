import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readUrlDay } from "../src/components/ScenarioExperience";

const g = globalThis as unknown as { window?: { location: { search: string } } };

const setSearch = (search: string) => {
  g.window = { location: { search } };
};

describe("scenario URL restore", () => {
  beforeEach(() => setSearch(""));
  afterEach(() => {
    delete g.window;
  });

  // Round 27 retired the steps — the example is one stage. A stale ?step=
  // param from an old link is simply ignored (no step reader exists); the
  // day param beside it still restores.
  test("stale step params are inert", () => {
    setSearch("?step=2");
    expect(readUrlDay("miles", "2026-11-02")).toBe(0);
    setSearch("?step=2&day=1");
    expect(readUrlDay("miles", "2026-11-02")).toBe(1);
  });

  test("day restores only a day that exists in the scenario", () => {
    setSearch("?day=0");
    expect(readUrlDay("miles", "2026-11-02")).toBe(0);
    setSearch("?day=999");
    expect(readUrlDay("miles", "2026-11-02")).toBeNull();
    setSearch("?day=nope");
    expect(readUrlDay("miles", "2026-11-02")).toBeNull();
  });

  test("with no window (server render) it returns null", () => {
    delete g.window;
    expect(readUrlDay("miles", "2026-11-02")).toBeNull();
  });
});
