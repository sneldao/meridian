import type { DayPlan, ShiftCoverage, VoiceLine } from "@/domain/types";
import { buildHuddle, trimHuddle } from "@/lib/voice/huddle";

// The spoken handoff script. When day data is available the whole crew talks
// the plan over — the huddle — synthesized as one text-to-dialogue call so the
// voices share prosody context and audibly react to each other. Briefings
// recorded before the huddle existed fall back to the two-voice read: Iris
// delivers the verdict, then the narrator (Sarah) reads the summary.
export function handoffLines(o: {
  locked: number;
  total: number;
  score: number;
  coverage: ShiftCoverage;
  summary: string;
  lead?: string;
  days?: DayPlan[];
  citationTitles?: string[];
}): VoiceLine[] {
  const huddle = o.days?.length
    ? trimHuddle(
        buildHuddle({
          score: o.score,
          days: o.days,
          coverage: o.coverage,
          citationTitles: o.citationTitles,
        }),
      )
    : [];
  if (huddle.length) {
    if (o.lead) huddle[0] = { ...huddle[0], text: `${o.lead} ${huddle[0].text}` };
    return huddle;
  }

  const pct = Math.round(o.coverage.ratio * 100);
  const verdict = o.coverage.complete
    ? `full coverage — fully adapted on landing`
    : `${pct} percent covered before touchdown`;
  return [
    {
      agent: "evaluator",
      text: `${o.lead ?? "Shift wrapped."} ${o.locked} of ${o.total} days locked, verdict passes at ${o.score.toFixed(2)} — ${verdict}.`,
    },
    { agent: "narrator", text: o.summary },
  ];
}
