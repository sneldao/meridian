import { fmtMin } from "@/domain/circadian";
import type { AgentId, DayPlan, ShiftCoverage } from "@/domain/types";

// The morning huddle: the crew talking *to* each other about the plan that just
// locked, in one Text to Dialogue request so they share prosody and audibly
// react. Every number is read off the briefing — this is a delivery format for
// real run output, not a canned pitch, and because it is derived
// deterministically the same handoff hashes to the same cached take.

export interface HuddleLine {
  agent: AgentId;
  text: string;
}

export interface HuddleInput {
  score: number;
  days: DayPlan[];
  coverage?: ShiftCoverage;
  citationTitles?: string[];
}

const signed = (min: number) => `${min < 0 ? "minus " : ""}${Math.abs(Math.round(min))} minutes`;

export function buildHuddle({ score, days, coverage, citationTitles }: HuddleInput): HuddleLine[] {
  if (days.length === 0) return [];

  const first = days[0];
  const last = days[days.length - 1];
  const totalShift = days.reduce((n, d) => n + Math.abs(d.shiftMin), 0);

  const move =
    days
      .flatMap((d) => d.interventions.map((iv) => ({ d, iv })))
      .find(({ iv }) => iv.kind === "light_exposure" || iv.kind === "sleep_window")
      ?.d;
  const moveIv = move?.interventions.find((iv) => iv.kind === "light_exposure" || iv.kind === "sleep_window");

  const lines: HuddleLine[] = [
    {
      agent: "evaluator",
      text: `Plan's graded. Score ${score.toFixed(2)}, ${days.length} day${days.length === 1 ? "" : "s"} locked, every one feasible.`,
    },
    {
      agent: "planner",
      text: `${first.label} through ${last.label}: ${signed(totalShift)} of phase shift total. Bedtime ends at ${fmtMin(last.targetBedtimeMin)}, wake at ${fmtMin(last.targetWakeMin)}.`,
    },
  ];

  if (coverage) {
    lines.push({
      agent: "analyst",
      text: coverage.complete
        ? `That's the whole move — ${coverage.achievedMin} of ${coverage.requiredMin} minutes covered before touchdown.`
        : `We cover ${Math.round(coverage.ratio * 100)} percent. ${Math.round(coverage.residualMin / 6) / 10} hours still owed when they land, and the baseline says that person is already running short.`,
    });
  }

  if (move && moveIv) {
    lines.push({
      agent: "negotiator",
      text: `Calendar yields around it: ${move.label} at ${fmtMin(moveIv.startMin)} — ${moveIv.note}`,
    });
  } else {
    lines.push({ agent: "negotiator", text: "Calendar's already clear. Nothing with attendees had to move." });
  }

  const citation = citationTitles?.[0];
  if (citation) {
    lines.push({ agent: "researcher", text: `And it is not guesswork. ${citation}.` });
  }

  return lines;
}

/** Text to Dialogue terminates early past ~2,000 characters. Keep it honest. */
export function trimHuddle(lines: HuddleLine[]): HuddleLine[] {
  const out: HuddleLine[] = [];
  let chars = 0;
  for (const line of lines) {
    if (chars + line.text.length > 2000) break;
    out.push(line);
    chars += line.text.length;
  }
  return out;
}
