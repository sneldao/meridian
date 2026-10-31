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

// The arithmetic above is only half-guarded by counting elements: a band that
// lands on the wrong edge, or an after-midnight half drawn at the wrong width,
// is still two bands. These pin the geometry itself.

const stylesOf = (html: string, cls: string) =>
  [...html.matchAll(new RegExp(`class="${cls}"[^>]*style="([^"]*)"`, "g"))].map((m) =>
    Object.fromEntries(
      m[1].split(";").filter(Boolean).map((d) => d.split(":").map((p) => p.trim())),
    ) as Record<string, string>,
  );

const pct = (min: number) => (min / 1440) * 100;

describe("DaySkyStrip geometry", () => {
  test("a window crossing midnight splits at both edges, at the right widths", () => {
    const h = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: [step("r", "run", 1380, 120)], label: "Day 1" }),
    );
    const bands = stylesOf(h, "tl-sky-band");
    expect(bands.length).toBe(2);
    expect(bands[0].left).toBe(`${pct(1380)}%`);
    expect(bands[0].width).toBe(`${pct(60)}%`);
    expect(bands[1].left).toBe("0%");
    expect(bands[1].width).toBe(`${pct(120)}%`);
  });

  test("a zero-length span is a whole night, not nothing", () => {
    // endMin <= startMin reads as wrap-around, so start == end means the step
    // ends where it began a day later and must still be drawn.
    const h = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: [step("s", "sleep", 1200, 1200)], label: "Day 1" }),
    );
    const bands = stylesOf(h, "tl-sky-band");
    expect(bands.length).toBe(2);
    expect(bands.reduce((sum, b) => sum + parseFloat(b.width), 0)).toBeCloseTo(100, 4);
  });

  test("a band too short to see keeps a floor width", () => {
    const h = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: [step("l", "sunlight", 600, 601)], label: "Day 1" }),
    );
    expect(stylesOf(h, "tl-sky-band")[0].width).toBe(`${pct(8)}%`);
  });

  test("unresolved windows and moments bank at different strengths", () => {
    const h = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: [step("l", "sunlight", 600, 660), step("n", "nutrition", 1140, 1170)], label: "Day 1" }),
    );
    expect(stylesOf(h, "tl-sky-band")[0].opacity).toBe("0.8");
    expect(stylesOf(h, "tl-sky-dot")[0].opacity).toBe("1");
  });

  test("midnight counts as a time, not as no caret", () => {
    const h = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: DAY, nowMin: 0, label: "Today" }),
    );
    expect(stylesOf(h, "tl-sky-now")[0].left).toBe("0%");
  });

  test("each of the six kinds keeps its own hue", () => {
    const hueOf = (category: NudgeCategory) => {
      const windowed = ["sunlight", "sleep", "run", "flight"].includes(category);
      const h = renderToStaticMarkup(
        createElement(DaySkyStrip, { steps: [step("x", category, 600, 660)], label: "Day 1" }),
      );
      return stylesOf(h, windowed ? "tl-sky-band" : "tl-sky-dot")[0].background;
    };
    expect(hueOf("sunlight")).toBe("var(--cat-light)");
    expect(hueOf("sleep")).toBe("var(--cat-sleep)");
    expect(hueOf("run")).toBe("var(--cat-run)");
    expect(hueOf("flight")).toBe("var(--cat-flight)");
    expect(hueOf("nutrition")).toBe("var(--cat-food)");
    expect(hueOf("calendar")).toBe("var(--cat-cal)");
  });

  test("hour ticks anchor the day at 6, 12 and 18", () => {
    const h = renderToStaticMarkup(
      createElement(DaySkyStrip, { steps: DAY, label: "Day 1" }),
    );
    expect(stylesOf(h, "tl-sky-tick").map((t) => t.left)).toEqual(["25%", "50%", "75%"]);
  });
});
