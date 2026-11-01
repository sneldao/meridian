import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { CrewPerformance } from "../src/components/CrewPerformance";
import { LandingCrewStrip } from "../src/components/LandingCrewStrip";
import { crewPerformance } from "../src/domain/crew-performance";
import { demoJourney } from "../src/domain/demo-beats";

/* The crew performance (round 28) renders the gate's own transcript: every
 * stamp is a real verdict, every cue a real intervention, and the server
 * markup starts mid-performance (pos 0) — the choreography is a client
 * enhancement over a complete static read. */

describe("CrewPerformance (SSR)", () => {
  const perf = crewPerformance(demoJourney("miles"));

  test("renders agents, lanes and stamps — zero inline styles", () => {
    const h = renderToStaticMarkup(createElement(CrewPerformance, { perf }));
    for (const l of perf.lines) expect(h).toContain(l.agent);
    expect(h).toContain("crew-perf-lane");
    // Stamps start unissued (pos 0 → no day locked yet).
    expect(h).not.toContain("Passes");
    expect(h).not.toContain("Needs a fix");
    expect(h.match(/style=\{/g)?.length ?? 0).toBe(0);
    // The written read carries the honesty clause either way.
    expect(h).toContain("the gate&#x27;s own verdict");
  });

  test("every cue diamond maps to a real intervention start", () => {
    const h = renderToStaticMarkup(createElement(CrewPerformance, { perf }));
    for (const day of perf.days) {
      for (const cue of day.cues) {
        expect(h).toContain(`points="${cue.startMin},2`);
      }
    }
  });

  test("the landing strip is the compact form of the same data", () => {
    const h = renderToStaticMarkup(createElement(LandingCrewStrip));
    expect(h).toContain("crew-perf-compact");
    expect(h).toContain("Mara");
    expect(h).toContain("Rex");
  });
});
