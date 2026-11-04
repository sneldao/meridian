import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { join } from "path";
import { Stamp } from "@/components/ui/Stamp";
import { LandingDepth } from "@/components/LandingDepth";
import { SunSelf } from "@/components/SunSelf";
import { PerformanceBrief } from "@/components/PerformanceBrief";
import { crewHeaderCtaVisible } from "@/app/crew/page";
import { sunSelfRead } from "@/domain/sun-self";
import type { HeroMeeting } from "@/domain/hero";

/* Design reset Phase 0 — direct surface locks for the pieces the reset
 * added: the provenance stamp, the depth gate, the faceless sun's written
 * read, the crew header CTA's rerun rule, and the brief's provenance line. */

const read = sunSelfRead({ owedMin: 270, deliveredMin: 270, requiredMin: 540, direction: "east" });

describe("Stamp", () => {
  test("every kind renders its label and data-kind", () => {
    for (const [kind, label] of [
      ["example", "EXAMPLE"],
      ["preview", "PREVIEW"],
      ["locked", "LOCKED"],
      ["fictional", "FICTIONAL"],
    ] as const) {
      const h = renderToStaticMarkup(createElement(Stamp, { kind }));
      expect(h).toContain(`data-kind="${kind}"`);
      expect(h).toContain(label);
    }
  });

  test("className passes through; the CSS stays at the 13px floor", () => {
    const h = renderToStaticMarkup(createElement(Stamp, { kind: "example", className: "iday-stamp" }));
    expect(h).toContain("stamp iday-stamp");
    const css = readFileSync(join(import.meta.dir, "..", "src", "app", "globals.css"), "utf8");
    const stamp = css.slice(css.indexOf(".stamp {"), css.indexOf(".stamp {") + 400);
    expect(stamp).toContain("font-size: 13px");
    expect(stamp).toContain("var(--font-mono2)");
  });
});

describe("LandingDepth tone gate", () => {
  test("paper mounts nothing; ink mounts the artwork", () => {
    const paper = renderToStaticMarkup(createElement(LandingDepth));
    expect(paper).toBe("");
    const paperExplicit = renderToStaticMarkup(createElement(LandingDepth, { tone: "paper" }));
    expect(paperExplicit).toBe("");
    const ink = renderToStaticMarkup(createElement(LandingDepth, { tone: "ink" }));
    expect(ink).toContain("landing-depth");
    expect(ink).toContain("ld-ridge");
    expect(ink).toContain('aria-hidden="true"');
  });
});

describe("the faceless sun still says its mood", () => {
  test("the aria-label carries the mood word and the read's line", () => {
    const h = renderToStaticMarkup(createElement(SunSelf, { read, size: 64 }));
    expect(h).toContain('aria-label="Your meridian — lifting');
    expect(h).toContain(read.line.replace(/&/g, "&amp;"));
    expect(h).not.toContain("sunself-eye");
    expect(h).toContain("sunself-disc");
  });
});

describe("crew header CTA", () => {
  test("hidden idle without dev; returns once a run exists", () => {
    expect(crewHeaderCtaVisible(false, "idle")).toBe(false);
    expect(crewHeaderCtaVisible(false, "running")).toBe(true);
    expect(crewHeaderCtaVisible(false, "done")).toBe(true);
    expect(crewHeaderCtaVisible(false, "error")).toBe(true);
    expect(crewHeaderCtaVisible(true, "idle")).toBe(true);
  });
});

describe("PerformanceBrief provenance", () => {
  const moment: HeroMeeting = {
    title: "Investor meeting",
    localMin: 16 * 60,
    bodyMin: 8 * 60 + 30,
    bodyWithoutPlanMin: 7 * 60,
    status: "risk",
  } as HeroMeeting;

  test("preview still names the fixture inputs it hides", () => {
    const h = renderToStaticMarkup(
      createElement(PerformanceBrief, {
        moment,
        destination: "Tokyo",
        preview: true,
        eventSource: "fixture",
        exampleBaseline: true,
      }),
    );
    expect(h).toContain('data-kind="preview"');
    expect(h).toContain("Example event");
    expect(h).toContain("Example sleep profile");
    expect(h).toContain("not your measurements");
  });

  test("real sources claim no sample data", () => {
    const h = renderToStaticMarkup(
      createElement(PerformanceBrief, {
        moment,
        destination: "Tokyo",
        eventSource: "google",
      }),
    );
    expect(h).not.toContain('data-kind="example"');
    expect(h).not.toContain("Sample data");
  });

  test("no moment, no invented event — whatever the source", () => {
    for (const eventSource of ["google", "fixture", undefined] as const) {
      const h = renderToStaticMarkup(
        createElement(PerformanceBrief, { moment: null, destination: "Tokyo", eventSource }),
      );
      expect(h).not.toContain("Example event");
      expect(h).not.toContain('data-kind="example"');
      expect(h).not.toContain("Sample data");
    }
  });
});
