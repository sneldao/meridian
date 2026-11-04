import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { glassParams } from "../src/lib/glass-sun";
import { glassSunSvgGroup, safeIdPrefix, type GlassSunPalette } from "../src/lib/glass-sun-svg";
import { sunSelfSvgGroup } from "../src/lib/sun-self-svg";
import { GlassSun } from "../src/components/GlassSun";

import type { SunSelfRead } from "../src/domain/sun-self";
import { sunSelfRead, sunSelfSleeping } from "../src/domain/sun-self";

/* Design reset Phase 2 — the glass instrument's contract: exact params,
 * shared geometry, safe ids/attributes, honest fallback + a11y. */

const make = (over: Partial<SunSelfRead>): SunSelfRead => ({
  lid: 0, glow: 0, tiltDeg: 0, raysLit: 0, rayCount: 12, mood: "sleeping",
  line: "test line", ...over,
});

const PAL: GlassSunPalette = {
  rim: "#888", rimHi: "#fff", core: "#fc6", coreSoft: "#fc6",
  halo: "#fc6", rayLit: "#e96", rayDim: "#ccc", horizon: "#e96",
};

describe("glassParams — exact mapping, no re-derivation", () => {


  test("sleeping / drained / half / adjusted values", () => {
    // Real reads: the sleeping sun carries lid 1 — full debt, not zero.
    const sleep = glassParams(sunSelfSleeping());
    expect(sleep.debt).toBe(sunSelfSleeping().lid);
    expect(sleep.progress).toBe(sunSelfSleeping().glow);
    const sleepP = glassParams(make({}));
    expect(sleepP.debt).toBe(0);
    // Sleeping = full debt: smoked bloom, rough rim, near-zero fringe.
    const sl = sunSelfSleeping();
    expect(sleep.bloom).toBeCloseTo(0.08 + 0.16 * sl.lid);
    expect(sleep.coreLight).toBeCloseTo(0.18 + 0.62 * sl.glow);
    expect(sleep.roughness).toBeCloseTo(0.08 + 0.18 * sl.lid);
    expect(sleep.dispersion).toBeCloseTo(0.012 + 0.016 * (1 - sl.lid));

    // Drained, nothing delivered: lid is capped below 1 while awake.
    const dr = sunSelfRead({ owedMin: 540, deliveredMin: 0, requiredMin: 540, direction: "east", daysLocked: 0 });
    const d = glassParams(dr);
    expect(d.bloom).toBeCloseTo(0.08 + 0.16 * dr.lid);
    expect(d.roughness).toBeCloseTo(0.08 + 0.18 * dr.lid);
    expect(d.dispersion).toBeCloseTo(0.012 + 0.016 * (1 - dr.lid));

    const h = glassParams(sunSelfRead({ owedMin: 270, deliveredMin: 270, requiredMin: 540, direction: "east", daysLocked: 2 }));
    expect(h.progress).toBeCloseTo(0.5);
    expect(h.raysLit).toBe(Math.min(12, Math.round(h.raysLit)));

    const a = glassParams(sunSelfRead({ owedMin: 0, deliveredMin: 540, requiredMin: 540, direction: "east", daysLocked: 7 }));
    expect(a.coreLight).toBeCloseTo(0.8);
    expect(a.raysLit).toBe(Math.min(12, a.raysLit));
  });

  test("bounds clamp, NaN falls back, raysLit never inferred from count", () => {
    const oob = glassParams(make({ lid: 2, glow: -1, raysLit: 99, rayCount: 12 }));
    expect(oob.debt).toBe(1);
    expect(oob.progress).toBe(0);
    expect(oob.raysLit).toBe(12); // clamped to count, not equated to it
    const nan = glassParams(make({ lid: NaN, glow: NaN, tiltDeg: NaN }));
    expect(nan.debt).toBe(0);
    expect(nan.progress).toBe(0);
    expect(nan.angleRad).toBe(0);
    // rayCount stays 12 while a partial read has fewer lit ticks.
    const partial = glassParams(make({ raysLit: 3 }));
    expect(partial.rayCount).toBe(12);
    expect(partial.raysLit).toBe(3);
  });
});

describe("glassSunSvgGroup — shared body, safe ids, no face", () => {
  const read = make({ lid: 0.4, glow: 0.5, raysLit: 3, tiltDeg: 10 });

  test("geometry fits the 120-box: disc30, ticks33–37, halo40", () => {
    const s = glassSunSvgGroup(read, { r: 42, palette: PAL, prefix: "a" });
    expect(s).toContain('r="30" class="sunself-disc"');
    expect(s).toContain('y1="23" x2="60" y2="27"');
    expect(s).toContain('r="40" class="sunself-halo"');
    expect(s).toContain('scale(1.400)');
    expect((s.match(/sunself-ray lit/g) ?? []).length).toBe(3);
    expect((s.match(/sunself-ray /g) ?? []).length).toBe(12);
  });

  test("ids are unique per prefix and sanitised", () => {
    const a = glassSunSvgGroup(read, { r: 42, palette: PAL, prefix: "one" });
    const b = glassSunSvgGroup(read, { r: 42, palette: PAL, prefix: "two" });
    expect(a).toContain('id="one-core"');
    expect(b).toContain('id="two-core"');
    expect(a).not.toEqual(b);
    expect(safeIdPrefix("a<b>c'd")).toBe("a_b_c_d");
    const bad = glassSunSvgGroup(read, { r: 42, palette: PAL, prefix: "a<b" });
    expect(bad).toContain("a_b-core");
  });

  test("palette attributes are escaped — an attribute can't break out", () => {
    const evil = { ...PAL, rim: '"><script>alert(1)</script><"' };
    const s = glassSunSvgGroup(read, { r: 42, palette: evil, prefix: "x" });
    expect(s).not.toContain("<script>");
    expect(s).toContain("&lt;script&gt;");
  });

  test("no face geometry ever", () => {
    for (const face of ["sunself-eye", "sunself-lid", "sunself-mouth", "sunself-face"]) {
      expect(glassSunSvgGroup(read, { r: 42, palette: PAL, prefix: "f" })).not.toContain(face);
    }
  });
});

describe("the export delegate keeps read/caption parity", () => {
  test("sunSelfSvgGroup renders the glass body with the export palette", () => {
    const read = make({ lid: 0.5, glow: 0.5, raysLit: 4, mood: "half-lit" });
    const s = sunSelfSvgGroup(read, { r: 30, palette: { disc: "#fc6", rayLit: "#e96", rayDim: "#ccc", halo: "#fc6" } });
    expect(s).toContain("sunself-disc");
    expect(s).toContain("url(#");
    expect((s.match(/sunself-ray lit/g) ?? []).length).toBe(4);
  });
});

describe("GlassSun — wrapper, a11y, renderer flag", () => {
  const read = make({ lid: 0.3, glow: 0.5, raysLit: 3, mood: "half-lit", line: "halfway home" });

  test("non-speak: span wrapper, svg role=img with the full label, no click", () => {
    const h = renderToStaticMarkup(createElement(GlassSun, { read, size: 96 }));
    expect(h).not.toContain("<button");
    // Wrapper carries role=img + the full label — the svg and canvas are
    // both aria-hidden so AT gets the read under EITHER backend.
    expect(h).toContain('role="img"');
    expect(h).toContain("Your meridian — half-lit — halfway home");
    expect(h).toContain('data-renderer="svg"');
    expect((h.match(/aria-hidden="true"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("speak: native button labelled once, svg aria-hidden inside", () => {
    const h = renderToStaticMarkup(createElement(GlassSun, { read, size: 120, speak: true }));
    expect(h).toContain("<button");
    expect(h).toContain('aria-hidden="true"');
    // One accessible label — on the button, not duplicated on the svg.
    expect((h.match(/aria-label/g) ?? []).length).toBe(1);
  });

  test("small glyph stays svg-only (no gl canvas upgrade path in SSR)", () => {
    const h = renderToStaticMarkup(createElement(GlassSun, { read, size: 34 }));
    expect(h).toContain('data-renderer="svg"');
  });
});
