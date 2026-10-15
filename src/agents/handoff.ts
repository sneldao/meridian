import type { ShiftCoverage, VoiceLine } from "@/domain/types";

// The spoken handoff script: Iris delivers the verdict in her own voice, then
// the narrator (Sarah) reads the summary. Synthesized as one text-to-dialogue
// call so the two voices share prosody context — they react to each other
// instead of reading adjacent scripts.
export function handoffLines(o: {
  locked: number;
  total: number;
  score: number;
  coverage: ShiftCoverage;
  summary: string;
  lead?: string;
}): VoiceLine[] {
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
