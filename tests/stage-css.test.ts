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
    const block = blockAfter(".hero, .clock-stage, .arr, .hero .hl .bg.term");
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

  test("the night theme sits on the ink family", () => {
    const block = blockAfter('html[data-theme="night"]');
    expect(block).toContain("--m-bg: #0b0e16");
  });

  test("the warm-brown surface scale is gone from the file", () => {
    for (const hex of ["#201a14", "#2b231b", "#332a20", "#4a3d30", "#3d332a", "#6f6055"]) {
      expect(css.toLowerCase()).not.toContain(hex);
    }
  });
});
