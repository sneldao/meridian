// Route-aware plans for the recorded (replay) shift. Long eastward trips use
// the hand-scripted LHR→HND days; every other route gets a deterministic
// planner that drafts each day from the wearer's baseline and searches until
// the real scorer passes it. The drama is scripted; the verdicts are honest.

import { evaluatePlan, fmtMin, MAX_SHIFT_MIN_PER_DAY, passes } from "@/domain/circadian";
import { GARMIN_BASELINE } from "@/domain/fixtures";
import type { AdherenceProfile, CalendarEvent, Citation, DayPlan, Intervention, Trip } from "@/domain/types";
import { scriptedDays } from "./replay";

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;
const SCRIPTED_TOTAL = 380; // sum of |shiftMin| in scriptedDays

export interface ReplayPlan {
  days: DayPlan[];
  /** Deliberately bad first drafts (by dayIndex) that make recovery visible. */
  badFirstDrafts: Map<number, DayPlan>;
  scripted: boolean;
}

export function replayPlanFor(
  trip: Trip,
  calendar: CalendarEvent[],
  citations: Citation[],
  adherence: AdherenceProfile,
): ReplayPlan {
  const total = Math.abs(trip.requiredShiftMin);
  if (trip.direction === "east" && total >= SCRIPTED_TOTAL) {
    const days = scriptedDays(citations).map((d) => ({
      ...d,
      interventions: d.interventions.map((iv) => ({
        ...iv,
        note: iv.note.replace(/Tokyo/g, trip.destination.name),
      })),
    }));
    return { days, badFirstDrafts: scriptedBadDrafts(days), scripted: true };
  }
  const days = plannedDays(trip, calendar, citations, adherence);
  return { days, badFirstDrafts: genericBadDrafts(trip, days), scripted: false };
}

/** The original hand-written failures (calendar conflict on D-2, short sleep on D-1). */
function scriptedBadDrafts(days: DayPlan[]): Map<number, DayPlan> {
  return new Map([
    [
      1,
      {
        ...days[1],
        interventions: [
          { kind: "light_exposure", startMin: 6 * 60, endMin: 7 * 60 + 45, note: "Wide morning light block." },
          { kind: "sleep_window", startMin: 21 * 60 + 40, endMin: 4 * 60 + 30, note: `Bed 21:40, up 04:30.` },
        ],
      },
    ],
    [
      2,
      {
        ...days[2],
        targetBedtimeMin: 20 * 60,
        targetWakeMin: 3 * 60 + 5,
        interventions: [
          { kind: "sleep_window", startMin: 20 * 60, endMin: 3 * 60 + 5, note: "Aggressive early night." },
          { kind: "light_exposure", startMin: 3 * 60 + 30, endMin: 4 * 60 + 30, note: "Wake anchor." },
        ],
      },
    ],
  ]);
}

/** Route-independent failures: too fast on D-2, too little sleep on D-1. */
function genericBadDrafts(trip: Trip, days: DayPlan[]): Map<number, DayPlan> {
  const sign = trip.direction === "east" ? -1 : 1;
  const bad = new Map<number, DayPlan>();
  if (days[1]) bad.set(1, { ...days[1], shiftMin: sign * 120 });
  if (days[2]) {
    const d = days[2];
    const bed = wrap(d.targetWakeMin - 5 * 60); // 5 h in bed
    bad.set(2, {
      ...d,
      targetBedtimeMin: bed,
      interventions: d.interventions.map((iv) =>
        iv.kind === "sleep_window" ? { ...iv, startMin: bed, note: "Compress the night to force the shift." } : iv,
      ),
    });
  }
  return bad;
}

const PROTECTED = new Set(["light_exposure", "avoid_light", "nap", "exercise"]);
const overlaps = (s1: number, e1: number, s2: number, e2: number) => s1 < e2 && s2 < e1;

/** Slide a protected block off any blocking event on its day (light stays near wake). */
function dodge(iv: Intervention, events: CalendarEvent[]): Intervention {
  if (!PROTECTED.has(iv.kind) || iv.endMin === undefined) return iv;
  const len = wrap(iv.endMin - iv.startMin) || 60;
  for (const off of [0, -30, 30, -60, 60, -90, 90, -120, 120]) {
    const s = iv.startMin + off;
    const clash = events.some((e) => e.blocksInterventions !== false && overlaps(s, s + len, e.startMin, e.endMin));
    if (!clash) return { ...iv, startMin: wrap(s), endMin: wrap(s + len) };
  }
  return iv;
}

function draftDay(
  trip: Trip,
  dayIndex: number,
  shiftMin: number,
  cumulative: number,
  calendar: CalendarEvent[],
  citations: Citation[],
): DayPlan {
  const spec = trip.days[dayIndex];
  const dayEvents = calendar.filter((e) => e.dayIndex === dayIndex);
  const bed = wrap(GARMIN_BASELINE.avgBedtimeMin + cumulative);
  // Wake no later than the first fixed commitment that would land inside the
  // sleep window (e.g. a 07:30 team breakfast on a delay day). The search in
  // plannedDays then shrinks the shift until the night still clears 6 h.
  const rawWake = wrap(GARMIN_BASELINE.avgWakeMin + cumulative);
  const morningFrom = bed < rawWake ? bed : 0;
  const wall = dayEvents
    .filter((e) => e.blocksInterventions !== false && e.startMin >= morningFrom && e.startMin < rawWake)
    .reduce((m, e) => Math.min(m, e.startMin), rawWake);
  const wake = wall;
  const east = trip.direction === "east";
  const cite = (i: number) => citations[i % Math.max(1, citations.length)]?.id;
  const ivs: Intervention[] = east
    ? [
        { kind: "light_exposure", startMin: wrap(wake + 5), endMin: wrap(wake + 65), note: "Bright light within an hour of the new wake target — the advance anchor.", citationId: cite(2) },
        { kind: "caffeine_cutoff", startMin: wrap(bed - 8 * 60 - 5), note: "Last coffee 8h before the new bedtime.", citationId: cite(0) },
        { kind: "avoid_light", startMin: wrap(bed - 60), endMin: bed, note: "Screens down — protect the earlier bedtime.", citationId: cite(3) },
      ]
    : [
        { kind: "avoid_light", startMin: wake, endMin: wrap(wake + 60), note: "Dark glasses for the first hour — morning light would pull the clock back.", citationId: cite(3) },
        { kind: "caffeine_cutoff", startMin: wrap(bed - 8 * 60 - 5), note: "Cutoff tracks the later bedtime.", citationId: cite(0) },
        { kind: "light_exposure", startMin: wrap(bed - 180), endMin: wrap(bed - 120), note: "Evening light — the delay lever.", citationId: cite(2) },
      ];
  return {
    dayIndex,
    label: spec.label,
    shiftMin,
    targetBedtimeMin: bed,
    targetWakeMin: wake,
    interventions: [
      ...ivs.map((iv) => dodge(iv, dayEvents)),
      { kind: "sleep_window", startMin: bed, endMin: wake, note: `Bed ${fmtMin(bed)}, up ${fmtMin(wake)}.` },
    ],
  };
}

/** Search each day: largest feasible shift (≤ 90 min, ≤ what's left) the scorer passes. */
function plannedDays(trip: Trip, calendar: CalendarEvent[], citations: Citation[], adherence: AdherenceProfile): DayPlan[] {
  const sign = trip.direction === "east" ? -1 : 1;
  let remaining = Math.abs(trip.requiredShiftMin);
  let cumulative = 0;
  const locked: DayPlan[] = [];
  for (let i = 0; i < trip.days.length; i++) {
    const daysLeft = trip.days.length - i;
    const target = Math.min(MAX_SHIFT_MIN_PER_DAY, remaining, Math.ceil(remaining / daysLeft / 5) * 5);
    let chosen: DayPlan | null = null;
    for (let s = target; s >= 5 && !chosen; s -= 5) {
      const day = draftDay(trip, i, sign * s, cumulative + sign * s, calendar, citations);
      if (passes(evaluatePlan({ trip, days: [...locked, day], calendar, adherence, baseline: GARMIN_BASELINE }))) chosen = day;
    }
    // Hold the clock (shift 0) if nothing passes — never emit an unscored plan.
    chosen ??= draftDay(trip, i, 0, cumulative, calendar, citations);
    locked.push(chosen);
    cumulative += chosen.shiftMin;
    remaining = Math.max(0, remaining - Math.abs(chosen.shiftMin));
  }
  return locked;
}
