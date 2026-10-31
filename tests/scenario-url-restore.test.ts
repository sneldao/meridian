import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readUrlDay, readUrlStep } from "../src/components/ScenarioExperience";

const g = globalThis as unknown as { window?: { location: { search: string } } };

const setSearch = (search: string) => {
  g.window = { location: { search } };
};

describe("scenario URL restore", () => {
  beforeEach(() => setSearch(""));
  afterEach(() => {
    delete g.window;
  });

  test("step accepts only 0, 1 or 2", () => {
    setSearch("?step=1");
    expect(readUrlStep()).toBe(1);
    setSearch("?step=2");
    expect(readUrlStep()).toBe(2);
    setSearch("?step=3");
    expect(readUrlStep()).toBeNull();
    setSearch("?step=abc");
    expect(readUrlStep()).toBeNull();
    // A missing param reads as 0, which is also the default first step.
    setSearch("");
    expect(readUrlStep()).toBe(0);
  });

  test("day restores only a day that exists in the scenario", () => {
    setSearch("?day=0");
    expect(readUrlDay("jason", "2026-11-02")).toBe(0);
    setSearch("?day=999");
    expect(readUrlDay("jason", "2026-11-02")).toBeNull();
    setSearch("?day=nope");
    expect(readUrlDay("jason", "2026-11-02")).toBeNull();
  });

  test("with no window (server render) both return null", () => {
    delete g.window;
    expect(readUrlStep()).toBeNull();
    expect(readUrlDay("jason", "2026-11-02")).toBeNull();
  });
});
