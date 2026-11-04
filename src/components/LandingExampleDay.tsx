"use client";

import { InteractiveDay } from "@/components/InteractiveDay";
import { buildDayScene } from "@/domain/day-scene";
import { buildDemoScenario } from "@/domain/demo-scenarios";

/* The example day the visitor can touch, as its own section of the ink
 * Statement landing (design reset Phase 1). Extracted from LandingHero so
 * the hero carries only the statement: headline, one sentence, quiet links.
 * The day shown is Diego's dispatch — the film sends viewers to the
 * landing, and the example below the form continues his story instead of
 * switching travellers on them. */

const demo = buildDemoScenario("diego", "2026-11-04");
const scene = buildDayScene({ ...demo, dayIndex: demo.event.dayIndex })!;

export function LandingExampleDay() {
  return (
    <section className="landing-iday" aria-labelledby="landing-iday-heading">
      <div className="landing-iday-frame">
        <div className="landing-iday-bar">
          <h2 className="landing-iday-title" id="landing-iday-heading">Explore an example day</h2>
        </div>
        <InteractiveDay
          scene={scene}
          requiredMin={Math.abs(demo.trip.requiredShiftMin)}
          direction={demo.trip.direction}
          example
        />
      </div>
    </section>
  );
}
