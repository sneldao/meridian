import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
