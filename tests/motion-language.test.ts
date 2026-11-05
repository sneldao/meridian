import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { crewScript, crewStateAt } from "../src/domain/crew-performance";

/* Motion language · round 16 (docs/DESIGN.md).
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

  it("3 · the light pass: one sharp edge + a trailing gradient tail", () => {
    const pass = block(".light-pass");
    expect(pass).toContain("light-pass-travel");
    expect(pass).toContain("--dur-light-pass");
    // Sharp leading edge (2px) + trailing blurred tail that follows it.
    const edge = block(".light-pass::before");
    expect(edge).toContain("top: 0");
    expect(edge).toContain("height: 2px");
    const tail = block(".light-pass::after");
    expect(tail).toContain("top: 2px");
    expect(tail).toContain("blur(18px)");
    // Transform/opacity travel only — enters at 100vh, exits above the top.
    const kf = block("@keyframes light-pass-travel");
    expect(kf).toContain("translateY(100vh)");
    expect(kf).toContain("translateY(-180px)");
    expect(kf).toContain("opacity");
    expect(kf).not.toContain("box-shadow");
    // Reduced motion: the pass degrades to a short opacity fade — find
    // the specific reduce gate that contains the rule.
    const rmBlocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)];
    const lp = rmBlocks.find((b) => b[1].includes(".light-pass"));
    expect(lp).toBeTruthy();
    expect(lp![1]).toContain("light-pass-fade");
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
    // The section reveal used to ride rise-view here; its successor
    // land-rise is pinned one register stricter — transform only, never
    // opacity — by the "never taken out of the reading" test below.
    for (const kf of [recede, handOff]) {
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
    expect(rule).toContain("land-rise");
    expect(rule).toContain("animation-timeline: view()");
    const ruleIdx = css.indexOf(".today-flow > *");
    const supportsIdx = css.lastIndexOf("@supports (animation-timeline: view())", ruleIdx);
    expect(supportsIdx).toBeGreaterThan(0);
    expect(
      css.slice(supportsIdx, ruleIdx).includes("@media (prefers-reduced-motion: no-preference)"),
    ).toBe(true);
  });

  it("a scrolled section is never taken out of the reading", () => {
    // The rise moves a section into place; it never fades it away. A
    // scroll-driven fade leaves the words invisible until the traveller
    // scrolls to them — a blank band in a full-page capture, in print,
    // and on the block already on screen when the page loads.
    const kf = block("@keyframes land-rise");
    expect(kf).toMatch(/translate|transform/);
    expect(kf).not.toMatch(/opacity/);
    expect(kf).not.toContain("filter");
    // Every scroll-driven reveal on the landing and the flow uses it — read
    // from the animation's side: each land-rise rule's selector list must
    // name the section (rules may group selectors across lines, so matching
    // `${s} {` from the section's side misses them).
    const selectorLists: string[] = [];
    let from = 0;
    while (true) {
      const i = css.indexOf("land-rise", from);
      if (i < 0) break;
      const open = css.lastIndexOf("{", i);
      const prevClose = css.lastIndexOf("}", open);
      selectorLists.push(css.slice(prevClose + 1, open));
      from = i + 1;
    }
    for (const s of [".landing-iday", ".sample-journeys", ".everyday-rhythm", ".today-flow > *"]) {
      expect(
        selectorLists.some((list) => list.includes(s)),
        `${s} must rise, not fade`,
      ).toBe(true);
    }
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
      path.join(import.meta.dir, "..", "src", "lib", "glass-sun-svg.ts"),
      "utf8",
    );
    expect(glyph.match(/style=\{/g)?.length ?? 0).toBe(0);
    // The glyph comes from the domain read; the component never invents state.
    // The shared glass body: every feature is a read-derived string.
    expect(glyph).toContain("glassParams");
    expect(glyph).toContain("raysLit");
    expect(glyph).toContain("tiltDeg");
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





/* Rule 3 (amended) — ambient motion is allowed, but not on an element that
 * carries a readout. On the sun: halo opacity is glow, ray count is locked
 * days. Only the disc encodes nothing, so only the disc may loop while the
 * traveller is doing nothing. A one-shot caused by an arrival (the landing
 * hero's peek) is not ambient and stays allowed. */
describe("ambient motion stays off the readout", () => {
  // Comments are stripped so a rule's selector is the selector, not the
  // paragraph above it.
  const style = css.replace(/\/\*[\s\S]*?\*\//g, "");

  const loopingSelectors = () =>
    [...style.matchAll(/([^{}]+)\{([^}]*animation:[^}]*infinite[^}]*)\}/g)]
      .map((m) => m[1].trim())
      .filter((sel) => sel.includes("sunself"));

  it("no sun element carries an idle loop (Phase 2)", () => {
    // The glass is a still instrument — breath and stage breathe are
    // retired; motion is caused (pulse, ripple, follow).
    expect(loopingSelectors()).toEqual([]);
  });

  it("the face stays retired — no face geometry in the stylesheet", () => {
    // Design reset Phase 0: eyes, lids and mouth are gone, so no selector may
    // name them again (a returning loop or fill would silently re-draw a face).
    expect(style).not.toMatch(/sunself-(eye|lid|mouth|face)/);
  });

  it("the breath stands down under reduced motion", () => {
    // block() searches from the file start, so every reduce block has to be
    // cut out from its own index instead.
    const frag = "@media (prefers-reduced-motion: reduce) {";
    const guards: string[] = [];
    for (let i = style.indexOf(frag); i >= 0; i = style.indexOf(frag, i + 1)) {
      let depth = 0;
      let j = i + frag.length - 1;
      for (; j < style.length; j++) {
        if (style[j] === "{") depth++;
        if (style[j] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      guards.push(style.slice(i, j + 1));
    }
    expect(guards.length).toBeGreaterThan(0);
    expect(guards.some((g) => g.includes(".sunself-disc") && /animation:\s*none/.test(g))).toBe(true);
  });
});

/* Phase 0 of the design reset — the 60s travelling shade measured out as
 * motion nobody could see, so it is retired rather than re-tuned. These
 * guards pin the absence: the loop must not come back under another name,
 * and the static beam tint it hung on stays. The clock-phase helper lives
 * on in src/lib/clock-phase.ts with its own unit test for Phase 2 reuse. */
describe("the retired beam shade stays retired", () => {
  const style = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const page = fs.readFileSync(path.join(import.meta.dir, "..", "src", "app", "page.tsx"), "utf8");

  it("the travelling layer and its keyframes are gone", () => {
    expect(style).not.toContain(".beam::after");
    expect(style).not.toContain("beam-travel");
    expect(style).not.toContain("--beam-phase");
  });

  it("the page no longer writes a beam phase", () => {
    expect(page).not.toContain("--beam-phase");
    expect(page).not.toMatch(/setInterval\([^)]*beam/i);
  });

  it("the static tint stays — atmosphere, not motion", () => {
    const beam = block(".beam {");
    expect(beam).toContain("radial-gradient");
    expect(beam).not.toContain("animation");
  });
});

describe("clockPhaseDelay", () => {
  it("puts a 60s loop in phase with the minute it was read in", async () => {
    const { clockPhaseDelay, minutePhaseSec } = await import("@/lib/clock-phase");
    const d = new Date("2026-11-03T12:00:37.250Z");
    expect(minutePhaseSec(d)).toBeCloseTo(37.25, 3);
    expect(clockPhaseDelay(d)).toBe("-37.25s");
  });
});

/* Round 52 — Rule 3's caused half, held to round 51's perceptibility test.
 * Measured with real pointer input before this existed: 18 of 21 controls on
 * /, 16 of 24 on /crew and 11 of 11 on /demo changed by nothing at all while
 * held. They had hover, which is what a mouse gets and a finger never does. */
describe("a press is answered", () => {
  const style = css.replace(/\/\*[\s\S]*?\*\//g, "");

  it("the floor covers every control that can be pressed", () => {
    for (const sel of [
      "button:active:not(:disabled)",
      '[role="button"]:active:not(:disabled)',
      "summary:active",
      "a[href]:active",
    ])
      expect(style).toContain(sel);
  });

  it("the floor answers with opacity, never a transform", () => {
    // A scale or transform on a `static` button creates a containing block,
    // so an absolutely positioned child would re-home only while held.
    const floor = block("button:active:not(:disabled)");
    expect(floor).toContain("opacity: 0.86");
    expect(floor).not.toMatch(/\b(scale|transform):/);
    expect(block("a[href]:active")).toContain("opacity: 0.62");
  });

  it("a small target gets an answer that reads at its size", () => {
    expect(block(".demo-dot:active:not(:disabled)")).toContain("scale: 1.4");
  });

  it("the small-target exception still wins the cascade it needs", () => {
    // `.demo-dot:active:not(:disabled)` ties the floor on specificity, so it
    // has to come later in the file or the 9px dot goes back to no answer.
    expect(
      style.indexOf(".demo-dot:active:not(:disabled)") >
        style.indexOf("button:active:not(:disabled)"),
    ).toBe(true);
  });
});
