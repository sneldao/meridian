import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DayStrip, PinnedDayRow, pinRowWidth } from "../src/components/DayStrip";
import type { DayPlan, DaySpec } from "../src/domain/types";

const spec = (i: number): DaySpec => ({ dayIndex: i, label: `D${i}`, date: "2026-11-0${i + 1}" });

const plan = (i: number): DayPlan => ({
  dayIndex: i,
  label: `D${i}`,
  shiftMin: 30,
  targetBedtimeMin: 22 * 60 + 30,
  targetWakeMin: 6 * 60 + 45,
  interventions: [],
});

const daysOf = (n: number) => Array.from({ length: n }, (_, i) => spec(i));
const lockedOf = (labels: string[]) =>
  new Map(labels.map((l) => [l, plan(Number(l.slice(1)))] as const));

describe("pinRowWidth", () => {
  test("cards are butted with a gap between, none after the last", () => {
    expect(pinRowWidth(0)).toBe(0);
    expect(pinRowWidth(1)).toBe(180);
    expect(pinRowWidth(5)).toBe(5 * 180 + 4 * 16);
  });

  test("a five-day row is wider than a phone — which is why the morph has a gate", () => {
    expect(pinRowWidth(5)).toBeGreaterThan(430);
  });
});

// The narrow branch is chosen by matchMedia, and SSR takes the server snapshot
// (row fits), so only the pinned shape and the row arithmetic are unit-reachable
// here. That the column replaces it on a phone is a browser check.
describe("PinnedDayRow (SSR)", () => {
  test("nothing locked draws nothing", () => {
    expect(
      renderToStaticMarkup(createElement(PinnedDayRow, { days: daysOf(3), locked: lockedOf([]) })),
    ).toBe("");
  });

  test("every locked day is a card reading bed and wake", () => {
    const h = renderToStaticMarkup(
      createElement(PinnedDayRow, { days: daysOf(3), locked: lockedOf(["D0", "D1", "D2"]) }),
    );
    expect(h.match(/border-pass\/20 bg-ink-3/g)?.length).toBe(3);
    for (const label of ["D0", "D1", "D2"]) expect(h).toContain(`>${label}<`);
    expect(h).toContain("bed 22:30");
    expect(h).toContain("wake 06:45");
  });

  test("a day still in planning is not in the row", () => {
    const h = renderToStaticMarkup(
      createElement(PinnedDayRow, { days: daysOf(4), locked: lockedOf(["D0", "D2"]) }),
    );
    expect(h.match(/border-pass\/20 bg-ink-3/g)?.length).toBe(2);
    expect(h).not.toContain(">D1<");
    expect(h).not.toContain(">D3<");
  });

  test("the stage spends the scroll the morph needs", () => {
    const h = renderToStaticMarkup(
      createElement(PinnedDayRow, { days: daysOf(2), locked: lockedOf(["D0", "D1"]) }),
    );
    expect(h).toContain("height:250vh");
    expect(h).toContain("sticky");
  });
});

describe("DayStrip (SSR)", () => {
  test("one marker per state — locked, planning, re-planning, queued", () => {
    const h = renderToStaticMarkup(
      createElement(DayStrip, {
        days: daysOf(4),
        locked: lockedOf(["D0"]),
        activeLabel: "D1",
        rejectedLabels: new Set(["D2"]),
      }),
    );
    expect(h).toContain("30m"); // the locked chip carries its shift
    expect(h).toContain("planning…");
    expect(h).toContain("replanning…");
    expect(h).toContain("queued");
  });
});
