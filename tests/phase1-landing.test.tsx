import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync } from "fs";
import { join } from "path";
import { readStylesheet } from "./css";
import { TripEntryScreen } from "../src/components/TripEntryScreen";
import { RoutePicker } from "../src/components/RoutePicker";

/* Design reset Phase 1 — the Statement landing's structure locks: the form
 * comes before the sample content, the ink root only covers setup/boot,
 * and the gap report goes through a stable callback (the update-depth
 * regression must not come back). */

const page = readFileSync(join(import.meta.dir, "..", "src", "app", "page.tsx"), "utf8");

describe("the setup branch is the ink Statement", () => {
  test("order: hero → form+feature → rail → instrument+day → journeys", () => {
    const hero = page.indexOf("<LandingHero");
    const form = page.indexOf("<TripEntryScreen");
    const feature = page.indexOf("<AdvertsFeature");
    const rail = page.indexOf("<AdvertsRail");
    const instrument = page.indexOf("<LandingInstrument");
    const example = page.indexOf("<LandingExampleDay");
    const samples = page.indexOf("<SampleJourneys");
    expect(hero).toBeGreaterThan(-1);
    expect(hero).toBeLessThan(form);
    // The feature frame rides inside the entry stage as its second column.
    expect(form).toBeLessThan(feature);
    expect(feature).toBeLessThan(rail);
    // The instrument pairs with the example day it explains.
    expect(rail).toBeLessThan(instrument);
    expect(instrument).toBeLessThan(example);
    expect(example).toBeLessThan(samples);
    // EverydayRhythm was cut — the close lands harder after the adverts.
    // Neither mount nor import may return (the file itself stays).
    expect(page).not.toContain("<EverydayRhythm");
    expect(page).not.toContain("components/EverydayRhythm");
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
  const css = readStylesheet();

  test("line rise lives inside a no-preference gate, settle token, blur kept", () => {
    // The fallback intro moved from per-char spans to the Filament WebGL
    // effect (src/lib/tca). What stays pinned: the plain-DOM intro is one
    // line rise, gated on no-preference, on the settle token, blur kept.
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/g)];
    const lineBlocks = blocks.filter((b) => b[1].includes(".landing-hero .lh-line"));
    expect(lineBlocks.length).toBe(1);
    expect(lineBlocks[0][1]).toContain("lh-char-rise");
    expect(lineBlocks[0][1]).toContain("560ms var(--ease-settle)");
    expect(css).toContain("blur(6px)");
    // The Filament contract: DOM letters mask to transparent under the
    // WebGL canvas, never removed — layout + AT keep the real text.
    expect(css).toContain("[data-effect='filament'].is-masked [data-line]");
  });

  test("the retired orbit/peek machinery stays gone", () => {
    for (const gone of ["lh-sun-orbit", "lh-sun-peek", "landing-cta-land", "data-peek"]) {
      expect(css).not.toContain(gone);
    }
  });
});
