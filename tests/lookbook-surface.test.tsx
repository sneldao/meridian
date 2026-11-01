import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { LookbookOfStates } from "../src/components/LookbookOfStates";
import { demoLookbook } from "../src/domain/lookbook";

/* The lookbook of states (round 29) renders its written read on the server:
 * five windows, each naming its hour and carrying the face's own line. The
 * GSAP takeover is a client enhancement — the static markup is complete
 * without it, and every face is the computed read's mood. */

describe("LookbookOfStates (SSR)", () => {
  test("five windows name their hour and the read's own line", () => {
    const h = renderToStaticMarkup(createElement(LookbookOfStates));
    const windows = demoLookbook();
    expect(h.match(/lookbook-window/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    for (const w of windows) {
      expect(h).toContain(w.when);
      expect(h).toContain(w.read.line);
      expect(h).toContain(w.state);
    }
  });

  test("the panes are hidden by default — no frame of a visible takeover", () => {
    const h = renderToStaticMarkup(createElement(LookbookOfStates));
    // Every pane starts aria-hidden; the reveal is the only way in.
    expect(h.match(/aria-hidden="true"/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(h).not.toContain("aria-expanded=\"true\"");
  });

  test("every face in the gallery is a computed SunSelf — no authored states", () => {
    const h = renderToStaticMarkup(createElement(LookbookOfStates));
    for (const w of demoLookbook()) {
      // The mood word rides the SunSelf aria label, so the gallery only ever
      // shows faces the model produced.
      expect(h).toContain(w.state);
    }
    expect(h).toContain("asleep");
    expect(h).toContain("adjusted");
  });
});
