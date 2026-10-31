import { fmtMin } from "@/domain/circadian";
import type { NudgeCategory } from "@/domain/nudges";
import {
  CalendarClock,
  Coffee,
  Footprints,
  Moon,
  Plane,
  Sun,
  type LucideIcon,
} from "lucide-react";

/** Category glyph — shared by the rail, the arrival view and the sky strip
 *  so one kind keeps one mark and one hue (`--cat-*`) everywhere it renders. */
export const CAT_ICON: Record<NudgeCategory, LucideIcon> = {
  sunlight: Sun,
  sleep: Moon,
  nutrition: Coffee,
  run: Footprints,
  calendar: CalendarClock,
  flight: Plane,
};

export interface SkyStep {
  id: string;
  category: NudgeCategory;
  title: string;
  startMin: number;
  /** Wrap-aware like TravelerNudge: endMin < startMin crosses midnight. */
  endMin: number;
}

/** Windows draw as bands; moments draw as diamonds at the minute they land.
 *  Nutrition's step is a span from cutoff to dinner, but the ask that
 *  carries it is the cutoff — a moment. */
const BAND = new Set<NudgeCategory>(["sunlight", "sleep", "run", "flight"]);

const CAT_VAR: Record<NudgeCategory, string> = {
  sunlight: "var(--cat-light)",
  sleep: "var(--cat-sleep)",
  nutrition: "var(--cat-food)",
  calendar: "var(--cat-cal)",
  run: "var(--cat-run)",
  flight: "var(--cat-flight)",
};

/** The day seen from above: the same steps the rail lists, drawn as a strip
 *  of sky — light, run and sleep windows as bands, cutoffs and moved
 *  meetings as diamonds, a "now" caret when the day is today. Resolved steps
 *  dim, so the strip banks progress the way the rail does. Renders nothing
 *  for a day with no steps: an empty strip is a shape, not a plan. */
export function DaySkyStrip({
  steps,
  resolvedIds,
  nowMin,
  label,
}: {
  steps: SkyStep[];
  resolvedIds?: ReadonlySet<string>;
  nowMin?: number | null;
  label: string;
}) {
  if (!steps.length) return null;

  const bands = steps
    .filter((s) => BAND.has(s.category))
    .flatMap((s) => {
      const end = s.endMin <= s.startMin ? s.endMin + 1440 : s.endMin;
      const segs = [{ s: s.startMin, e: Math.min(end, 1440) }];
      if (end > 1440) segs.push({ s: 0, e: end - 1440 });
      return segs.map((seg) => ({ ...seg, step: s }));
    });
  const points = steps.filter((s) => !BAND.has(s.category));

  const pct = (m: number) => `${(m / 1440) * 100}%`;
  const resolved = (id: string) => resolvedIds?.has(id) ?? false;

  const summary = `${label}: ${steps
    .map((s) => `${s.title}, ${fmtMin(s.startMin)} to ${fmtMin(s.endMin)}`)
    .join("; ")}`;

  return (
    <div className="tl-sky" role="img" aria-label={summary}>
      <div className="tl-sky-base" />
      {[6, 12, 18].map((h) => (
        <div key={h} className="tl-sky-tick" style={{ left: `${(h / 24) * 100}%` }} />
      ))}
      {bands.map((b, i) => (
        <div
          key={`${b.step.id}-${i}`}
          className="tl-sky-band"
          style={{
            left: pct(b.s),
            width: pct(Math.max(b.e - b.s, 8)),
            background: CAT_VAR[b.step.category],
            opacity: resolved(b.step.id) ? 0.3 : 0.8,
          }}
        />
      ))}
      {points.map((p) => (
        <div
          key={p.id}
          className="tl-sky-dot"
          style={{
            left: pct(p.startMin),
            background: CAT_VAR[p.category],
            opacity: resolved(p.id) ? 0.3 : 1,
          }}
        />
      ))}
      {nowMin != null && (
        <div className="tl-sky-now" style={{ left: pct(nowMin) }} />
      )}
    </div>
  );
}
