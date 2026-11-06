import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// The stage backdrop contract in CSS: one shared rule paints the modeled sky,
// the terracotta accent is gone from every stage surface, and the night theme
// sits on the same ink family the stages use.

import { readStylesheet } from "./css";

const css = readStylesheet();

/** The declaration block that follows a selector match (up to the next `}`). */
const blockAfter = (needle: string): string => {
  const i = css.indexOf(needle);
  if (i < 0) return "";
  const j = css.indexOf("}", i);
  return css.slice(i, j === -1 ? css.length : j);
};

/** A custom-property declaration (up to the next `;`). */
const declAfter = (needle: string): string => {
  const i = css.indexOf(needle);
  if (i < 0) return "";
  const j = css.indexOf(";", i);
  return css.slice(i, j === -1 ? css.length : j);
};

describe("stage backdrop", () => {
  test("the shared rule paints the modeled sky on every stage", () => {
    const block = blockAfter(".hero, .clock-stage, .arr, .today-stage, .demo-root, .hero .hl .bg.term");
    expect(block).not.toBe("");
    for (const v of [
      "--stage-horizon-h",
      "--stage-horizon",
      "--stage-horizon-floor",
      "--stage-origin",
      "--stage-ember-line",
      "--stage-sun-x",
      "--stage-ink",
    ]) {
      expect(block).toContain(v);
    }
  });

  test("no terracotta survives in any stage surface", () => {
    const terracotta = /217,\s*107,\s*67|#d96b43/i;
    // The fixed decorative glows are gone — the modeled bloom replaced them.
    expect(css).not.toContain(".hero::after");
    expect(css).not.toContain(".clock-stage::after");
    expect(blockAfter(".beam")).not.toMatch(terracotta);
    for (const needle of ["--stage-dawn:", "--stage-night:"]) {
      expect(declAfter(needle)).not.toMatch(terracotta);
    }
  });

  test("the sky vars are registered so they can tween", () => {
    const prop = blockAfter("@property --stage-horizon-h");
    expect(prop).toContain("syntax:");
    expect(prop).toContain("<percentage>");
    const transition = blockAfter("transition: --stage-horizon-h");
    expect(transition).toContain("--stage-horizon-h");
  });

  test("the card's done cue reuses the sun's transform-only pulse under motion-allowed CSS", () => {
    const rule = blockAfter(".right-now-btn.done.just-done");
    expect(rule).toContain("animation: sunself-pulse");
    const gate = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    const cue = css.indexOf(".right-now-btn.done.just-done");
    expect(gate).toBeGreaterThan(-1);
    expect(cue).toBeGreaterThan(gate);
    expect(css.indexOf("@keyframes sunself-pulse")).toBeGreaterThan(cue);
  });

  test("the crew reads the shared cue table, not a private one", () => {
    // done is the sun's own beat, reused rather than re-drawn
    expect(blockAfter('.crew-avatar[data-cue="done"]')).toContain("animation: sunself-pulse");
    expect(blockAfter('.crew-avatar[data-cue="fail"]')).toContain("animation: crew-cue-fail");
    // fail is composited, like every other cue
    const kfStart = css.indexOf("@keyframes crew-cue-fail");
    expect(kfStart).toBeGreaterThan(-1);
    const kf = css.slice(kfStart, kfStart + 300);
    expect(kf).toContain("transform:");
    expect(kf).not.toMatch(/\b(width|height|top:|left:|filter|box-shadow):/);
    // arrive and work are carried by the resting/working poses themselves
    for (const cue of ["arrive", "work"]) {
      expect(css).not.toContain(`.crew-avatar[data-cue="${cue}"]`);
    }
    // the reduced-motion kill reaches the avatar root, not only its children
    expect(css).toMatch(/\.crew-avatar,\s*\.crew-avatar \* \{ transition: none !important;/);
  });

  test("the night theme sits on the ink family", () => {
    const block = blockAfter('html[data-theme="night"] {\n  --m-bg');
    expect(block).toContain("--m-bg: #0b0e16");
  });

  test("the warm-brown surface scale is gone from the file", () => {
    for (const hex of ["#201a14", "#2b231b", "#332a20", "#4a3d30", "#3d332a", "#6f6055"]) {
      expect(css.toLowerCase()).not.toContain(hex);
    }
  });
});

describe("pressed ghost buttons keep their label", () => {
  // Prod bug 2026-11-05: the ghost hover rule recoloured the label to
  // --m-text at specificity (0,3,1), beating every scoped pressed-state rule
  // ((0,2,1)) — and the pressed fill paints from that same --m-text. On ink,
  // a hovered (or touch-tapped, where hover sticks) selected pill showed no
  // text at all. The fix bars the hover recolour from pressed buttons; these
  // tests pin the cascade arithmetic so it cannot quietly regress.

  test("no ghost hover rule that recolors can reach a pressed button", () => {
    const hovers = [...css.matchAll(/\.taste-button--ghost:hover[^{]*(\{[^}]*\})/g)];
    expect(hovers.length).toBeGreaterThan(0);
    for (const m of hovers) {
      const selector = m[0].slice(0, m[0].indexOf("{"));
      const block = m[1];
      if (/\bcolor\s*:/.test(block)) {
        expect(selector).toContain(':not([aria-pressed="true"])');
      }
    }
  });

  test("a ghost taste button answers its pressed state anywhere", () => {
    // The structural answer for the crate row (and any future ghost pill):
    // the generic pressed rule inverts fill and label from the same tokens
    // the scoped surfaces use, so aria-pressed reads as chosen without each
    // surface hand-rolling the inversion.
    const block = blockAfter('.taste-button--ghost[aria-pressed="true"]');
    expect(block).toContain("background: var(--m-text)");
    expect(block).toContain("color: var(--m-bg)");
  });

  test("the scoped pressed states still own the label colour", () => {
    for (const needle of [
      '.demo-taste-toggle button[aria-pressed="true"]',
      '.day-card-dialog button[aria-pressed="true"]',
      ".scenario :is(.scenario-nav,.scenario-days,.scenario-toggle) button[aria-pressed=\"true\"]",
    ]) {
      const block = blockAfter(needle).replace(/\s+/g, " ").replace(/:\s*/g, ": ");
      expect(block).not.toBe("");
      expect(block).toContain("background: var(--m-text)");
      expect(block).toContain("color: var(--m-bg)");
    }
  });
});

/* The 2026-11-07 review: the stage told a loading lie, sat as a 340px island
 * in a full-viewport pin with a 64px sun, and let 11px text carry the page's
 * most important numbers. These tests pin the fix: the stage fills the pin,
 * the sun grows on its horizon, and nothing informative on the stage or its
 * clocks/chip sits under the 13px floor. */
describe("the stage answers the first viewport", () => {
  const stageSrc = readFileSync(
    join(import.meta.dir, "..", "src", "components", "TodayStage.tsx"),
    "utf8",
  );

  test("inside the scroll pin the stage is the whole viewport, not an island", () => {
    const block = blockAfter(".today-stage-pin .today-stage").replace(/\s+/g, " ");
    expect(block).toContain("width: 100%;");
    expect(block).toContain("height: 100%;");
    expect(block).toContain("border-radius: 0;");
  });

  test("one custom property sizes the sun, and the JSX keeps it in lockstep", () => {
    const stage = blockAfter(".today-stage {").replace(/\s+/g, " ");
    expect(stage).toContain("--stage-sun-size: clamp(140px, 15vw, 220px);");
    // The var is the display box; the JSX renders a 240px backing that
    // scales into it, so placement and pixels can never desync.
    expect(css).not.toContain("--stage-sun-size: 110px");
    // The horizon offset tracks the size so the centre stays put.
    const sunself = blockAfter(".stage-sunself").replace(/\s+/g, " ");
    expect(sunself).toContain("var(--stage-sun-size) / 2");
    // And the component renders the 240 backing the CSS scales.
    expect(stageSrc).toContain("size={240}");
    expect(stageSrc).not.toContain("size={64}");
  });

  test("stage, clock and chip type honour the 13px floor", () => {
    const px = (sel: string) => {
      const m = blockAfter(sel).match(/font-size:\s*([\d.]+)px/);
      return m ? Number(m[1]) : 0;
    };
    // The one-line plan is the page's headline — it reads larger than body.
    expect(px(".stage-next")).toBeGreaterThanOrEqual(17);
    expect(px(".stage-next-kicker")).toBeGreaterThanOrEqual(13);
    expect(px(".tz-clock-label")).toBeGreaterThanOrEqual(13);
    expect(px(".tz-clock-time")).toBeGreaterThanOrEqual(13);
    expect(px(".tz-clock-diff")).toBeGreaterThanOrEqual(13);
    expect(px(".tz-clocks-bar")).toBeGreaterThanOrEqual(13);
    expect(px(".trip-chip")).toBeGreaterThanOrEqual(13);
    expect(px(".trip-chip-change")).toBeGreaterThanOrEqual(13);
  });

  test("the run's door has a quiet home on the stage", () => {
    const block = blockAfter(".stage-start").replace(/\s+/g, " ");
    expect(block).toContain("margin-top:");
    expect(stageSrc).toContain("Make my plan");
    expect(stageSrc).toContain("stage-start");
  });
});
