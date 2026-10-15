// Post-commit gate check: run the live orchestrator against the replay provider
// for the three eval scenarios and assert that no negotiator move survives which
// breaks the locked plan. Uses the same matrix as scripts/eval.ts.
//
//   bun run scripts/verify-commit.ts

import { buildTrip, calendarFor } from "../src/domain/fixtures";
import { runCrew } from "../src/agents/runtime";
import type { CrewEvent } from "../src/domain/types";

const SCENARIOS = [
  { name: "LHR→HND eastward", trip: buildTrip("LHR", "HND", "2026-10-18") },
  { name: "LHR→JFK westward", trip: buildTrip("LHR", "JFK", "2026-10-18") },
  { name: "LHR→MEX westward", trip: buildTrip("LHR", "MEX", "2026-10-18") },
];

let failed = 0;

for (const { name, trip } of SCENARIOS) {
  const stream = runCrew({ trip, calendar: calendarFor(trip), calendarSource: "fixture" }) as AsyncGenerator<CrewEvent>;
  let locked = 0;
  let moves = 0;
  let reverted = false;
  let coverage: { ratio: number; residualMin: number; complete: boolean } | null = null;
  let briefing = "";

  for await (const e of stream) {
    if (e.type === "day_locked") locked++;
    if (e.type === "calendar_move") moves++;
    if (e.type === "error" && e.message.includes("broke the locked plan")) reverted = true;
    if (e.type === "briefing") {
      coverage = e.coverage;
      briefing = e.summary;
    }
  }

  const ok = !reverted && locked === trip.days.length;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  console.log(`      ${locked}/${trip.days.length} days locked · ${moves} moves${reverted ? " (REVERTED)" : ""}`);
  if (coverage) {
    console.log(
      `      shift ${Math.round(coverage.ratio * 100)}% covered · ${Math.round(coverage.residualMin / 6) / 10}h residual${coverage.complete ? " · fully adapted" : ""}`,
    );
  }
  console.log(`      ${briefing}\n`);
}

console.log(failed === 0 ? "all scenarios committed a sound calendar" : `${failed} scenario(s) failed`);
process.exit(failed === 0 ? 0 : 1);
