"use client";

import { useMemo } from "react";
import { CrewPerformance } from "@/components/CrewPerformance";
import { crewPerformance } from "@/domain/crew-performance";
import { demoJourney } from "@/domain/demo-beats";

/* Round 28: the differentiator stops hiding behind the More menu. A compact
 * crew performance sits in the landing's first viewport — agents speak, cues
 * land, days lock with the gate's real verdict — computed from the same demo
 * journey the artifacts show, and playing once when scrolled into view. */
export function LandingCrewStrip() {
  const perf = useMemo(() => crewPerformance(demoJourney("miles")), []);
  // Brisker than the demo beat: the strip plays in the first viewport, so it
  // must finish before the visitor scrolls (~7s, not ~13s).
  return <CrewPerformance perf={perf} compact beatMs={[700, 450]} />;
}
