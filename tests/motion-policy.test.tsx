import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readStylesheet } from "./css";
import { MotionPause } from "@/components/MotionPause";

/* Round 54 — the two borrows the motion law was missing, and the one
 * accessibility gap: an exit curve that is not an entrance, a line step
 * under the character step, and a switch over the ambient loops. */

const css = readStylesheet();
const root = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const token = (name: string) =>
  css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim() ?? "";

/** The y control points of a cubic-bezier — `y > 1` means it overshoots. */
function curveY(value: string): [number, number] {
  const m = value.match(/cubic-bezier\(([^)]+)\)/);
  expect(m, `not a cubic-bezier: ${value}`).toBeTruthy();
  const parts = m![1].split(",").map((n) => Number(n.trim()));
  return [parts[1], parts[3]];
}

const ms = (value: string) => Number(value.replace("ms", ""));

describe("exits are not entrances", () => {
  test("one exit curve, and it never overshoots", () => {
    const [y1, y2] = curveY(token("ease-exit"));
    for (const y of [y1, y2]) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  test("the spring still overshoots — that is what makes it a spring", () => {
    const [y1] = curveY(token("ease-spring"));
    expect(y1).toBeGreaterThan(1);
  });

  test("an exit is shorter than the level it answers", () => {
    expect(ms(token("dur-exit"))).toBeLessThan(ms(token("dur-glide")));
  });

  test("the toast leaves on the exit pair, not the glide", () => {
    const out = css.match(/\.toast-out \{[^}]*\}/)?.[0] ?? "";
    expect(out).toContain("var(--dur-exit)");
    expect(out).toContain("var(--ease-exit)");
    expect(out).not.toContain("var(--ease-glide)");
  });
});

describe("the stagger has two rungs", () => {
  test("a line step sits above the character step and under a beat", () => {
    const line = ms(token("stagger-line"));
    expect(line).toBeGreaterThan(ms(token("stagger-step")));
    expect(line).toBeLessThan(200);
  });

  test("the hero's text stack arrives line by line, not as one slab", () => {
    expect(css).toContain(".landing-hero .lh-lede { animation-delay: var(--stagger-line); }");
    expect(css).toContain(".landing-hero .lh-rubric { animation-delay: calc(var(--stagger-line) * 2); }");
    expect(css).toContain(".landing-hero .lh-links { animation-delay: calc(var(--stagger-line) * 3); }");
    const kf = css.match(/@keyframes lh-line-rise \{[^}]*\}[^}]*\}/)?.[0] ?? "";
    expect(kf).toContain("translateY");
    expect(kf).toContain("opacity");
    expect(kf).not.toContain("filter");
  });

  test("the line rhythm stands down under reduced motion", () => {
    const idx = css.indexOf(".landing-hero .lh-lede");
    const guard = css.lastIndexOf("@media (prefers-reduced-motion: no-preference)", idx);
    expect(guard).toBeGreaterThan(0);
    expect(css.lastIndexOf("@media (prefers-reduced-motion: reduce)", idx)).toBeLessThan(guard);
  });
});

describe("the ambient loops have a switch", () => {
  test("the pause attribute stops both stages' loops", () => {
    expect(css).toContain(':root[data-motion-pause="1"] .iday-amb');
    expect(css).toContain(':root[data-motion-pause="1"] .demo-stars');
    const rule = css.match(/:root\[data-motion-pause="1"\] \.iday-amb,[^{]*\{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("animation-play-state: paused");
  });

  test("the control says what it does and reports its state", () => {
    const h = renderToStaticMarkup(createElement(MotionPause, { className: "x" }));
    expect(h).toContain('aria-pressed="false"');
    expect(h).toContain("Pause drifting");
  });

  test("the choice is stored, and it is not data-motion", () => {
    const src = read("src/components/MotionPause.tsx");
    // `.iday` uses data-motion for its momentum mode; the pause must not
    // share the name or the two would fight.
    expect(src).toContain('const ATTR = "motion-pause"');
    expect(src).toContain("safeStorageSet");
    expect(src).toContain("MOTION_PAUSE_KEY");
  });

  test("both stages carry the control", () => {
    expect(read("src/components/DemoBeats.tsx")).toContain("<MotionPause");
    expect(read("src/components/InteractiveDay.tsx")).toContain("<MotionPause");
  });
});
