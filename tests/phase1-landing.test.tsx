import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { TripEntryScreen } from "../src/components/TripEntryScreen";
import { RoutePicker } from "../src/components/RoutePicker";

/* Design reset Phase 1 — the Statement landing's structure locks: the form
 * comes before the sample content, the ink root only covers setup/boot,
 * and the gap report goes through a stable callback (the update-depth
 * regression must not come back). */

const page = readFileSync(join(import.meta.dir, "..", "src", "app", "page.tsx"), "utf8");

describe("the setup branch is the ink Statement", () => {
  test("order: hero → form → example day → sample journeys → rhythm", () => {
    const hero = page.indexOf("<LandingHero");
    const form = page.indexOf("<TripEntryScreen");
    const example = page.indexOf("<LandingExampleDay");
    const samples = page.indexOf("<SampleJourneys");
    const rhythm = page.indexOf("<EverydayRhythm />");
    expect(hero).toBeGreaterThan(-1);
    expect(hero).toBeLessThan(form);
    expect(form).toBeLessThan(example);
    expect(example).toBeLessThan(samples);
    expect(samples).toBeLessThan(rhythm);
    expect(page).toContain('className="landing-statement"');
    expect(page).toContain('tone="ink"');
  });

  test("the ink root covers setup and unresolved boot only", () => {
    expect(page).toContain('entry === null || entry.mode === "setup" ? "root landing-ink" : "root"');
  });

  test("the gap report rides a stable callback (update-depth regression)", () => {
    expect(page).toContain("handleVisitorGap");
    expect(page).toContain("useCallback");
    expect(page).toContain("onGapChange={handleVisitorGap}");
    // The inline-lambda form that looped forever must not return.
    expect(page).not.toContain("onGapChange={(gap, covPct) =>");
  });
});

describe("the landing form (SSR)", () => {
  test("a prefilled draft resolves mono codes over Fraunces city names", () => {
    const h = renderToStaticMarkup(
      createElement(TripEntryScreen, {
        initialDate: "2026-11-04",
        onContinue: () => {},
        onExploreExample: () => {},
        initialRoute: { origin: "LHR", dest: "HND", date: "2026-11-04" },
      }),
    );
    expect(h).toContain("rp-picker--landing");
    expect(h).toContain("rp-city");
    expect(h).toContain("London");
    expect(h).toContain("Tokyo");
    expect(h).toContain("Model preview — estimated shift coverage");
    expect(h).toContain("using example sleep timing");
    expect(h).not.toContain("lands ");
  });

  test("other surfaces keep their own RoutePicker markup", () => {
    const cream = renderToStaticMarkup(
      createElement(RoutePicker, { origin: "", dest: "", date: "2026-11-04", surface: "cream", onChange: () => {} }),
    );
    expect(cream).not.toContain("rp-picker--landing");
    expect(cream).toContain("rp-field--from");
    const dark = renderToStaticMarkup(
      createElement(RoutePicker, { origin: "", dest: "", date: "2026-11-04", surface: "default", onChange: () => {} }),
    );
    expect(dark).toContain("rp-picker");
    expect(dark).not.toContain("rp-picker--landing");
  });
});

describe("the headline's motion stays honest", () => {
  const css = readFileSync(join(import.meta.dir, "..", "src", "app", "globals.css"), "utf8");

  test("char rise lives inside a no-preference gate, settle token, blur kept", () => {
    // Precise gate check: the .lh-char animation declaration must sit inside
    // a `@media (prefers-reduced-motion: no-preference)` block, not merely
    // appear somewhere after one.
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/g)];
    const charBlocks = blocks.filter((b) => b[1].includes(".landing-hero .lh-char"));
    expect(charBlocks.length).toBe(1);
    expect(charBlocks[0][1]).toContain("lh-char-rise");
    expect(charBlocks[0][1]).toContain("560ms var(--ease-settle)");
    // The animation name appears only inside that gated block.
    const mentions = [...css.matchAll(/\.landing-hero \.lh-char/g)].length;
    expect(mentions).toBe(1);
    expect(css).toContain("blur(6px)");
  });

  test("the retired orbit/peek machinery stays gone", () => {
    for (const gone of ["lh-sun-orbit", "lh-sun-peek", "landing-cta-land", "data-peek"]) {
      expect(css).not.toContain(gone);
    }
  });
});
