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

/* The phone chrome on an installed app: the manifest says `standalone`, so
 * the document paints under the status bar and the home indicator. These pin
 * the three things that keep it usable there — insets that actually exist,
 * room for the tab bar once it grows by the inset, and a finger never being
 * handed a control iOS would zoom into or a box that swallows the scroll. */
describe("phone chrome keeps clear of the device", () => {
  const layoutSrc = readFileSync(
    join(import.meta.dir, "..", "src", "app", "layout.tsx"),
    "utf8",
  );

  test("the viewport claims the full screen, or the insets all read zero", () => {
    expect(layoutSrc).toContain('viewportFit: "cover"');
  });

  test("the tab bar pays the home-indicator inset, on the bottom and the sides", () => {
    const nav = (css.match(/\.bottom-nav \{\s*position: fixed;[\s\S]*?\}/)?.[0] ?? "").replace(/\s+/g, " ");
    expect(nav).toContain("calc(8px + env(safe-area-inset-bottom, 0px))");
    expect(nav).toContain("env(safe-area-inset-left, 0px)");
    expect(nav).toContain("env(safe-area-inset-right, 0px)");
  });

  test("the page reserves the bar's real height, inset included", () => {
    expect(css).toContain(".root { padding-bottom: calc(78px + env(safe-area-inset-bottom, 0px)); }");
  });

  test("the More sheet sits inside the same margins", () => {
    const sheet = (css.match(/\.more-sheet \{\s*position: fixed;[\s\S]*?\}/)?.[0] ?? "").replace(/\s+/g, " ");
    expect(sheet).toContain("calc(12px + env(safe-area-inset-bottom, 0px))");
    expect(sheet).toContain("env(safe-area-inset-left, 0px)");
  });

  test("no control under 16px is offered to a finger", () => {
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*input:not\(\[type="checkbox"\]\)[\s\S]*?font-size: 16px;/);
    // Boxes keep their size; only type is re-scaled.
    expect(css).toContain('input:not([type="checkbox"]):not([type="radio"]):not([type="range"])');
  });

  test("landscape does not inflate the type under the thumb", () => {
    expect(css).toContain("-webkit-text-size-adjust: 100%;");
    expect(css).toContain("text-size-adjust: 100%;");
  });

  test("the sleep dial leaves the scroll to the finger and the turn to a mouse", () => {
    const base = (css.match(/\.sleep-dial-svg \{[^}]*\}/)?.[0] ?? "").replace(/\s+/g, " ");
    expect(base).toContain("touch-action: pan-y");
    expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\) \{\s*\.sleep-dial-svg \{ touch-action: none; \}\s*\}/);
  });
});

/* A tap target audit, pinned. WCAG 2.2 AA asks 24×24 of every control; the
 * app's own idiom is 44. These were the controls under the 24px floor — all
 * of them 11px words with 0–3px of padding — plus the feed's two primary taps
 * and the CTAs, which sat 2–14px under 44 for a finger. */
describe("touch targets", () => {
  /** The box height a single-line control's own declarations produce. */
  const box = (needle: string) => {
    const block = blockAfter(needle);
    const font = Number(/font-size:\s*([\d.]+)px/.exec(block)?.[1] ?? 16);
    const lead = Number(/line-height:\s*([\d.]+)/.exec(block)?.[1] ?? 1.5);
    const raw = /padding:\s*([^;]+);/.exec(block)?.[1].trim() ?? "0";
    const pad = raw.split(/\s+/).map((v) => Number(/([\d.]+)px/.exec(v)?.[1] ?? 0));
    const [top, bottom] = pad.length >= 3 ? [pad[0], pad[2]] : [pad[0] ?? 0, pad[0] ?? 0];
    return Math.round((font * lead + top + bottom) * 10) / 10;
  };

  test("no small control sits under the 24px floor", () => {
    const floors: Array<[string, number]> = [
      [".tl-why {", 24],
      [".insight-ask {", 24],
      [".feed-pin-ask {\n  flex: none;", 24],
      [".scrub-reset {", 24],
      [".demo-skip {\n  margin-left: auto;", 24],
      [".tier-badge-btn {", 24],
      [".tier-badge-refresh {", 24],
    ];
    for (const [selector, min] of floors) {
      const height = box(selector);
      expect({ selector, height, cleared: height >= min }).toEqual({ selector, height, cleared: true });
    }
  });

  test("the scrubbed reset also clears the readability floor", () => {
    const block = blockAfter(".scrub-reset {");
    const size = Number(/font-size:\s*([\d.]+)px/.exec(block)?.[1] ?? 0);
    expect(size).toBeGreaterThanOrEqual(11);
  });

  test("the phone's time column can hold a full range", () => {
    // `.tl-time b` prints `HH:MM–HH:MM` (11 glyphs) nowrap at 15px. A fixed
    // 60px column made the range overrun into the step title; the phone rule
    // has to leave room for the content it actually renders.
    // The feed's own phone rule (the room variant's 96px is a different,
    // narrower scope and appears earlier in the cascade).
    const at = css.indexOf("grid-template-columns: 22px 104px 1fr");
    expect(at).toBeGreaterThan(-1);
    const cols = /grid-template-columns: 22px (\d+)px 1fr/.exec(css.slice(at));
    expect(Number(cols![1])).toBeGreaterThanOrEqual(100);
    // And it sits under the phone breakpoint, not the desktop rule.
    expect(css.slice(Math.max(0, at - 700), at)).toContain("@media (max-width: 720px)");
    expect(css).not.toContain("grid-template-columns: 22px 60px 1fr");
  });

  test("the dial, the chips and the icon buttons reach 44 for a finger", () => {
    const blocks = (css.match(/@media \(pointer: coarse\) \{[\s\S]*?\n\}/g) ?? []).join("\n");
    const rules = blocks.split("}").map((r) => r.replace(/\s+/g, " "));
    const at44 = (selector: string) => rules.some((r) => r.includes(selector) && r.includes("44px"));
    for (const selector of [
      ".dial-btn",
      ".dac-done",
      ".chip",
      ".arr-btn",
      ".day",
      ".setup-back",
      ".crew-ask-go",
      ".demo-nav",
      ".hist-empty-cta",
    ]) {
      expect({ selector, at44: at44(selector) }).toEqual({ selector, at44: true });
    }
    // The small words and pills in tight rows keep their size and gain a
    // ring instead: 26.5px box + 10px inset each side clears 44.
    for (const ring of [".insight-ask", ".feed-pin-ask", ".tl-why", ".tier-badge-btn", ".tier-badge-refresh", ".offline-toggle"]) {
      expect({ ring, hasRing: rules.some((r) => r.includes(`${ring}::after`) && r.includes("inset: -10px")) }).toEqual({ ring, hasRing: true });
      expect({ ring, positioned: rules.some((r) => r.includes("position: relative") && r.includes(ring)) }).toEqual({ ring, positioned: true });
    }
    // The 9px pagination dot keeps its size and gains a ring instead.
    expect(blocks).toContain("inset: -17.5px");
    expect(blocks).toContain(".demo-dots { gap: 34px; }");
  });

  test("a finger gets 44 on the feed's two taps and the primary CTAs", () => {
    const block = (css.match(/@media \(pointer: coarse\) \{\s*\.tl-done[\s\S]*?padding-block: 13px;[\s\S]*?\}/)?.[0] ?? "").replace(/\s+/g, " ");
    expect(block).toContain(".tl-done, .tl-skip { min-height: 44px; }");
    expect(block).toContain(".p1, .p2 { padding-block: 13px; }");
    // 12px type at 1.5 leading + 13px of padding on both sides is exactly 44.
    expect(12 * 1.5 + 13 * 2).toBe(44);
  });
});
