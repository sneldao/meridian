import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DaySkyStrip, type SkyStep } from "../src/components/DaySkyStrip";
import type { NudgeCategory } from "../src/domain/nudges";

const step = (
  id: string,
  category: NudgeCategory,
  startMin: number,
  endMin: number,
): SkyStep => ({ id, category, title: id, startMin, endMin });

const DAY: SkyStep[] = [
  step("d1-sunlight", "sunlight", 7 * 60, 8 * 60 + 30),
  step("d1-run", "run", 7 * 60, 7 * 60 + 40),
  step("d1-nutrition", "nutrition", 14 * 60 + 20, 19 * 60 + 25),
  step("d1-sleep", "sleep", 22 * 60 + 25, 5 * 60 + 15), // wraps midnight
];

describe("DaySkyStrip (SSR)", () => {
  test("an empty day draws nothing — a shape, not a plan", () => {
    const h = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: [], label: "Tue" }),
    );
    expect(h).toBe("");
  });

  test("windows are bands, moments are diamonds, each in its category hue", () => {
    const h = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: DAY, label: "Tue" }),
    );
    expect(h).toContain('class="tl-sky"');
    expect(h).toContain("var(--cat-light)"); // light band
    expect(h).toContain("var(--cat-run)"); // run band
    expect(h).toContain('class="tl-sky-dot"'); // the cutoff is a moment
    expect(h).toContain("var(--cat-food)"); // the diamond's hue
  });

  test("a sleep window crossing midnight splits into two bands", () => {
    const h = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: DAY, label: "Tue" }),
    );
    expect(h.match(/var\(--cat-sleep\)/g)?.length).toBe(2);
  });

  test("resolved steps dim so the strip banks progress like the rail", () => {
    const h = renderToStaticMarkup(
      createElement(DaySkyStrip, {
        steps: DAY,
        resolvedIds: new Set(["d1-sunlight", "d1-nutrition"]),
        label: "Tue",
      }),
    );
    expect(h.match(/opacity:0\.3/g)?.length).toBe(2);
  });

  test("the now caret only appears when the day carries a clock", () => {
    const withNow = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: DAY, nowMin: 12 * 60, label: "Tue" }),
    );
    expect(withNow).toContain('class="tl-sky-now"');
    const noNow = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: DAY, label: "Tue" }),
    );
    expect(noNow).not.toContain('class="tl-sky-now"');
  });

  test("the strip stays readable without colour — a labelled summary", () => {
    const h = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: DAY, label: "Tue" }),
    );
    expect(h).toContain('role="img"');
    expect(h).toContain("Tue:");
    expect(h).toContain("d1-sunlight");
    expect(h).toContain("07:00");
  });
});
