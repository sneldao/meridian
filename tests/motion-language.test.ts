import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { crewScript, crewStateAt } from "../src/domain/crew-performance";

/* Motion language · round 16 (design.md).
 *
 * The language is a contract, so the contract is a test: surfaces morph
 * instead of expanding, typed routes wipe like light, mode switches pass a
 * light sweep, places morph into their pages, and /history is a deck.
 * Reduced motion keeps its guard over every piece of choreography, and the
 * whole language rides transform/opacity plus the paint-only allowance
 * (clip-path) — no box-shadow or filter animations creep in. */

const css = fs.readFileSync(
  path.join(import.meta.dir, "..", "src", "app", "globals.css"),
  "utf8",
);

/** Extract one rule block by a selector fragment, following braces from
 *  the first `{` after the fragment (multi-selector rules included). */
function block(selector: string): string {
  const i = css.indexOf(selector);
  if (i < 0) throw new Error(`selector not found: ${selector}`);
  const start = css.indexOf("{", i);
  if (start < 0) throw new Error(`no block after: ${selector}`);
  let depth = 0;
  let out = "";
  for (let j = start; j < css.length; j++) {
    const ch = css[j];
    out += ch;
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return out;
    }
  }
  throw new Error(`unbalanced braces after: ${selector}`);
}

const MORPH_PAIRS = ["morph-more", "morph-settings", "morph-trip", "morph-voice"];
const PLACE_NAMES = ["place-crew", "place-shift", "place-team"];

describe("motion language — the five rules are declared", () => {
  it("1 · surface morphs: every trigger/panel pair owns exactly one shared name", () => {
    for (const name of MORPH_PAIRS) {
      expect(css).toContain(`view-transition-name: ${name};`);
    }
    // One trigger class per pair, named in CSS, applied conditionally in React.
    expect(css).toContain(".vt-morph-more");
    expect(css).toContain(".vt-morph-settings");
    expect(css).toContain(".vt-morph-trip");
    expect(css).toContain(".vt-morph-voice");
    // Morph groups settle on the vocabulary, not raw milliseconds.
    const group = block("::view-transition-group(morph-more),");
    expect(group).toContain("var(--dur-settle)");
    expect(group).toContain("var(--ease-settle)");
  });

  it("2 · the dawn reveal: typed route changes wipe from the horizon", () => {
    const fwdOld = block(
      "html:active-view-transition-type(nav-forward)::view-transition-old(root)",
    );
    const fwdNew = block(
      "html:active-view-transition-type(nav-forward)::view-transition-new(root)",
    );
    const backNew = block(
      "html:active-view-transition-type(nav-back)::view-transition-new(root)",
    );
    // Forward: the old page settles away, the new one rises from below the
    // horizon via clip-path (the paint-only allowance).
    expect(fwdOld).toContain("vt-set-away");
    expect(fwdNew).toContain("vt-rise-in");
    expect(block("@keyframes vt-rise-in")).toContain("clip-path: inset(100% 0 0 0)");
    // Back: the sun goes down — the incoming page descends from the top.
    expect(backNew).toContain("vt-descend-in");
    expect(block("@keyframes vt-descend-in")).toContain("clip-path: inset(0 0 100% 0)");
  });

  it("3 · the light sweep: two staggered, transform-only layers", () => {
    const gold = block(".light-sweep-layer.gold");
    const ground = block(".light-sweep-layer.ground");
    expect(gold).toContain("sweep-pass");
    expect(ground).toContain("sweep-pass");
    // The ground band is the page's own surface, not a hardcoded colour.
    expect(ground).toContain("background: var(--m-bg)");
    // Staggered: the ground layer rides 90ms behind the gold.
    expect(ground).toContain("90ms");
    // Transform-only pass.
    const pass = block("@keyframes sweep-pass");
    expect(pass).toContain("translateY");
    expect(pass).not.toContain("box-shadow");
    expect(pass).not.toContain("filter");
  });

  it("4 · places morph into pages: rows and destination headers share names", () => {
    for (const name of PLACE_NAMES) {
      // The More sheet and the desktop menu scope the row side…
      expect(css).toContain(`.more-sheet [data-place="${name.replace("place-", "")}"]`);
      expect(css).toContain(`.menu [data-place="${name.replace("place-", "")}"]`);
      // …and the destination header takes the same name.
      expect(css).toContain(`[data-place-head="${name.replace("place-", "")}"] { view-transition-name: ${name}; }`);
    }
  });

  it("5 · the trips deck: sticky stacking with a scroll-driven recede", () => {
    const card = block(".trip-deck-card");
    expect(card).toContain("position: sticky");
    expect(card).toContain("var(--deck-i");
    const recede = block("@keyframes deck-recede");
    expect(recede).toContain("transform: scale(0.955)");
    // The recede exists only behind the support and motion guards.
    const supportsIdx = css.indexOf("@supports (animation-timeline: view())");
    const recedeIdx = css.indexOf("@keyframes deck-recede");
    expect(supportsIdx).toBeGreaterThan(0);
    expect(recedeIdx).toBeGreaterThan(supportsIdx);
    const guard = css
      .slice(supportsIdx, recedeIdx)
      .includes("@media (prefers-reduced-motion: no-preference)");
    expect(guard).toBe(true);
  });

  it("reduced motion still stands everything down", () => {
    // The global animation stand-down and the wildcard view-transition
    // guard from the previous motion pass are untouched.
    expect(css).toContain(
      "@media (prefers-reduced-motion: reduce) {\n  *,\n  *::before,\n  *::after {",
    );
    const rm = block("::view-transition-old(*),");
    expect(rm).toContain("animation-duration: 0s !important");
    // The dawn reveal rides inside its own no-preference guard.
    const guard = css.indexOf(
      "html:active-view-transition-type(nav-forward)::view-transition-old(root)",
    );
    const noPref = css.lastIndexOf("@media (prefers-reduced-motion: no-preference)", guard);
    const reduced = css.lastIndexOf("@media (prefers-reduced-motion: reduce)", guard);
    expect(noPref).toBeGreaterThan(reduced);
  });

  it("no new box animation debt was introduced by the language", () => {
    // The box-animation allowance is frozen at zero (design contract); the
    // motion language must stay inside transform/opacity/clip-path.
    const boxAnim = /animation[^;{}]*\b(box-shadow|filter)\b/gi;
    expect(css.match(boxAnim) ?? []).toHaveLength(0);
  });
});

describe("motion language — round 18 closed the drawer critique", () => {
  it("1 · the crew panel morphs out of its trigger", () => {
    expect(css).toContain(".vt-morph-crew { view-transition-name: morph-crew; }");
    expect(css).toContain("::view-transition-group(morph-crew),");
    const drawer = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "components", "AgentDrawer.tsx"),
      "utf8",
    );
    // The panel always carries the name — it only mounts while open, so the
    // name can never double-book against the trigger.
    expect(drawer).toContain("vt-morph-crew");
    const home = fs.readFileSync(path.join(import.meta.dir, "..", "src", "app", "page.tsx"), "utf8");
    expect(home).toContain("more-sheet-item vt-morph-crew");
  });

  it("2 · the disclosure never stacks a sheet on a sheet", () => {
    const sheet = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "components", "MoreSheet.tsx"),
      "utf8",
    );
    // The More sheet swaps its own body in place…
    expect(sheet).toContain("DisclosureBody");
    expect(sheet).not.toContain("<DisclosureSheet");
    // …while the settings sheet and the shift page morph their rows into
    // the shared disclosure panel.
    expect(css).toContain(".vt-morph-disclosure { view-transition-name: morph-disclosure; }");
    const disclosure = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "components", "dial", "DisclosureSheet.tsx"),
      "utf8",
    );
    expect(disclosure).toContain("panelClassName");
    expect(disclosure).toContain("export function DisclosureBody()");
    const shift = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "app", "shift", "page.tsx"),
      "utf8",
    );
    // The shift trigger keeps the name only while the panel is gone.
    expect(shift).toContain('sheetOpen ? "" : " vt-morph-disclosure"');
  });

  it("3 · expanders breathe in instead of materializing", () => {
    const feed = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "components", "NudgeFeedScreen.tsx"),
      "utf8",
    );
    expect(feed).toContain('className="drawer rise"');
    expect(feed).toContain('className="drawer tl-drawer rise"');
    const home = fs.readFileSync(path.join(import.meta.dir, "..", "src", "app", "page.tsx"), "utf8");
    expect(home).toContain('className="card rise"');
  });

  it("4 · the feed reads as a sequence, not a wall", () => {
    const rule = block(".tl-rows > .tl-row");
    expect(rule).toContain("tl-enter");
    expect(rule).toContain("animation-timeline: view()");
    const enter = block("@keyframes tl-enter");
    // The translate property keeps the swipe gesture's inline transform
    // untouched — a transform here would fight it.
    expect(enter).toContain("translate: 0 14px");
    expect(enter).not.toContain("transform");
    // Guarded like the deck: the nearest support + motion guards wrap it.
    const ruleIdx = css.indexOf(".tl-rows > .tl-row");
    const supportsIdx = css.lastIndexOf("@supports (animation-timeline: view())", ruleIdx);
    expect(supportsIdx).toBeGreaterThan(0);
    expect(ruleIdx).toBeGreaterThan(supportsIdx);
    expect(
      css.slice(supportsIdx, ruleIdx).includes("@media (prefers-reduced-motion: no-preference)"),
    ).toBe(true);
  });
});

describe("motion language — the hooks and markup exist", () => {
  it("the morph wrapper degrades instead of failing", async () => {
    const { useMorphTransition } = await import("../src/lib/use-morph-transition");
    function Probe() {
      const morph = useMorphTransition();
      // Without the API (jsdom), morph() must apply the update directly.
      morph(() => {});
      return React.createElement("div", null, "morph");
    }
    expect(renderToStaticMarkup(React.createElement(Probe))).toContain("morph");
  });

  it("the light sweep renders nothing at rest and respects reduced motion", async () => {
    const { useLightSweep } = await import("../src/components/LightSweep");
    function Probe() {
      const { sweep, node } = useLightSweep();
      sweep(); // jsdom's matchMedia says reduce-by-default → stays quiet
      return React.createElement("div", null, node);
    }
    const html = renderToStaticMarkup(React.createElement(Probe));
    expect(html).not.toContain("light-sweep-layer");
  });

  it("the deck markup is wired on /history", () => {
    const page = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "app", "history", "page.tsx"),
      "utf8",
    );
    expect(page).toContain('className="trip-deck"');
    expect(page).toContain('className="trip-deck-card"');
  });

  it("place rows no longer pre-close their container", () => {
    const sheet = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "components", "MoreSheet.tsx"),
      "utf8",
    );
    // The place link carries its name and lets navigation do the closing;
    // only the sheet's ✕ button (which appears first in the markup) still
    // hands back to onClose, and that close is itself a morph.
    expect(sheet).toContain("data-place={p.href.slice(1)}");
    expect(sheet.indexOf("onClick={onClose}")).toBeLessThan(sheet.indexOf("data-place"));
  });
});

describe("motion language · round 20 — today opens as a stage", () => {
  it("the stage pins and recedes only where scroll-driven motion is supported", () => {
    // Height and stickiness are the choreography — under reduced motion or
    // without animation-timeline the stage must be an ordinary section.
    for (const sel of [".today-stage-wrap", ".today-stage-pin"]) {
      const idx = css.indexOf(`${sel} {`);
      expect(idx).toBeGreaterThan(0);
      const supportsIdx = css.lastIndexOf("@supports (animation-timeline: view())", idx);
      expect(supportsIdx).toBeGreaterThan(0);
      const guardSlice = css.slice(supportsIdx, idx);
      expect(guardSlice).toContain("@media (prefers-reduced-motion: no-preference)");
      // Same nesting as the deck and the feed cadence: capability outside,
      // motion preference inside.
      expect(guardSlice.indexOf("@supports")).toBeLessThan(
        guardSlice.indexOf("@media (prefers-reduced-motion: no-preference)"),
      );
    }
    expect(block(".today-stage-wrap")).toContain("view-timeline: --stage block");
    expect(block(".today-stage-pin")).toContain("position: sticky");
  });

  it("the recede and the hand-off ride transform + opacity only", () => {
    const recede = block("@keyframes stage-recede");
    const handOff = block("@keyframes stage-hand-off");
    const riseView = block("@keyframes rise-view");
    for (const kf of [recede, handOff, riseView]) {
      expect(kf).toMatch(/opacity/);
      expect(kf).toMatch(/transform|translate/);
      expect(kf).not.toContain("box-shadow");
      expect(kf).not.toContain("filter");
    }
  });

  it("the recede is timeline-scoped to the stage wrapper", () => {
    const stage = block(".today-stage {\n      animation: stage-recede");
    expect(stage).toContain("animation-timeline: --stage");
    expect(stage).toContain("animation-range: exit");
  });

  it("the sections below rise on arrival, guarded like the feed cadence", () => {
    const rule = block(".today-flow > *");
    expect(rule).toContain("rise-view");
    expect(rule).toContain("animation-timeline: view()");
    const ruleIdx = css.indexOf(".today-flow > *");
    const supportsIdx = css.lastIndexOf("@supports (animation-timeline: view())", ruleIdx);
    expect(supportsIdx).toBeGreaterThan(0);
    expect(
      css.slice(supportsIdx, ruleIdx).includes("@media (prefers-reduced-motion: no-preference)"),
    ).toBe(true);
  });

  it("the stage lives in its own component with a one-style budget for the sky", () => {
    const stage = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "components", "TodayStage.tsx"),
      "utf8",
    );
    // Exactly one inline style: the modeled sky's vars. Everything else is
    // classed and token-driven.
    expect(stage.match(/style=\{/g)?.length ?? 0).toBe(1);
    expect(stage).toContain("stageSkyFor");
    // The next line comes from the same derivation the feed trusts.
    expect(stage).toContain("pickNextStep");
  });

  it(".root clips without becoming a scroll container", () => {
    // overflow: hidden would make .root the nearest scrollport and silently
    // freeze every scroll-driven timeline inside it (the stage recede, the
    // feed cadence, the trips deck). clip cuts without containerising.
    const root = block(".root {");
    expect(root).toContain("overflow: clip");
    expect(root).not.toContain("overflow: hidden");
  });
});

describe("motion language · round 21 — the stamp lands", () => {
  it("the peak beat rides transform + opacity only", () => {
    for (const name of ["@keyframes stamp-land", "@keyframes stamp-burst"]) {
      const kf = block(name);
      expect(kf).toMatch(/opacity/);
      expect(kf).toContain("transform");
      expect(kf).not.toContain("box-shadow");
      expect(kf).not.toContain("filter");
    }
  });

  it("the stamp choreography stands down under reduced motion", () => {
    for (const sel of [".demo-passport-frame", ".demo-stamp-burst"]) {
      const idx = css.indexOf(`${sel} {`);
      expect(idx).toBeGreaterThan(0);
      const guardIdx = css.lastIndexOf(
        "@media (prefers-reduced-motion: no-preference)",
        idx,
      );
      expect(guardIdx).toBeGreaterThan(0);
    }
  });

  it("the payoff beat is sendable", () => {
    const demo = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "components", "DemoBeats.tsx"),
      "utf8",
    );
    // One tap: native share where available, clipboard as the honest
    // fallback — and the component keeps its zero-inline-style budget.
    expect(demo).toContain("navigator.share");
    expect(demo).toContain("navigator.clipboard.writeText");
    expect(demo).toContain("Send this to a jet-lagged friend");
    expect(demo.match(/style=\{/g)?.length ?? 0).toBe(0);
  });
});

describe("motion language · round 23 — the sun-self", () => {
  it("the pulse is transform-only and guarded", () => {
    const kf = block("@keyframes sunself-pulse");
    expect(kf).toContain("transform");
    expect(kf).not.toContain("opacity");
    expect(kf).not.toContain("box-shadow");
    expect(kf).not.toContain("filter");
    const idx = css.indexOf(".sunself.enter {");
    expect(idx).toBeGreaterThan(0);
    const guardIdx = css.lastIndexOf("@media (prefers-reduced-motion: no-preference)", idx);
    expect(guardIdx).toBeGreaterThan(0);
  });

  it("the glyph is computed, not authored — one component, zero inline styles", () => {
    const glyph = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "components", "SunSelf.tsx"),
      "utf8",
    );
    expect(glyph.match(/style=\{/g)?.length ?? 0).toBe(0);
    // The face comes from the domain read; the component never invents state.
    expect(glyph).toContain("SunSelfRead");
    expect(glyph).toContain("read.raysLit");
    expect(glyph).toContain("read.lid");
  });
});

describe("motion language · round 28 — the crew performs in view", () => {
  it("the choreography is opacity + transform, flattened under reduced motion", () => {
    for (const sel of [".crew-perf-line", ".crew-perf-day", ".crew-perf-cue"]) {
      const body = block(sel + " {");
      // The law is about what *animates*: transition/animation properties
      // may only name opacity and transform. Static layout values are
      // fine — they never move.
      const animated = [...body.matchAll(/(?:transition(?:-property)?|animation):\s*([^;]+);/g)]
        .map((m) => m[1]);
      expect(animated.length, `${sel} must animate`).toBeGreaterThan(0);
      for (const a of animated) {
        expect(a, `${sel} animates only opacity/transform: ${a}`)
          .not.toMatch(/\b(width|height|max-height|min-height|margin|padding|inset|top|left|right|bottom)\b/);
      }
    }
    const flat = ".crew-perf-line, .crew-perf-day, .crew-perf-cue { opacity: 1; transform: none; }";
    const flatIdx = css.indexOf(flat);
    expect(flatIdx).toBeGreaterThan(0);
    // The flatten rule sits directly inside the reduced-motion guard: the
    // guard is the last reduce query before it, with nothing between.
    const guardIdx = css.lastIndexOf("@media (prefers-reduced-motion: reduce)", flatIdx);
    expect(guardIdx).toBeGreaterThan(0);
    const afterGuard = guardIdx + "@media (prefers-reduced-motion: reduce)".length;
    expect(css.slice(afterGuard, flatIdx)).not.toContain("@media");
  });

  it("the script is lines first, then draft → locked per day, and never un-locks", () => {
    const steps = crewScript(4, 3);
    expect(steps.length).toBe(4 + 6);
    // Lines all speak before the first draft.
    expect(steps.slice(0, 4).every((s) => s.phase === "line")).toBe(true);
    expect(steps[4]).toEqual({ index: 0, phase: "draft" });
    // Monotone: once a day locks it stays locked at every later position.
    const lockedBefore = new Set<number>();
    for (let pos = 0; pos < steps.length; pos++) {
      const st = crewStateAt(steps, pos);
      for (const d of lockedBefore) expect(st.days[d]).toBe("locked");
      st.days.forEach((phase, i) => {
        if (phase === "locked") lockedBefore.add(i);
      });
    }
    const final = crewStateAt(steps, steps.length - 1);
    expect(final.days.every((d) => d === "locked")).toBe(true);
    expect(final.linesSpoken).toBe(4);
  });

  it("the component never invents a figure — stamps render the verdict data", () => {
    const comp = fs.readFileSync(
      path.join(import.meta.dir, "..", "src", "components", "CrewPerformance.tsx"),
      "utf8",
    );
    expect(comp.match(/style=\{/g)?.length ?? 0).toBe(0);
    expect(comp).toContain("d.verdict.pass");
    expect(comp).toContain("d.verdict.score.toFixed(2)");
    expect(comp).toContain("d.verdict.violations");
    // The landing strip plays once seen, not on load.
    expect(comp).toContain("IntersectionObserver");
  });
});
