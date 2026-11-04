import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// The stage backdrop contract in CSS: one shared rule paints the modeled sky,
// the terracotta accent is gone from every stage surface, and the night theme
// sits on the same ink family the stages use.

const css = readFileSync(join(import.meta.dir, "../src/app/globals.css"), "utf8");

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
