import { computeTripTrajectory } from "@/domain/misalignment";
import type {
  CheckIn,
  DayPlan,
  ShiftCoverage,
  Trip,
  WearableBaseline,
} from "@/domain/types";

// What landing actually looked like, scored against what the gate promised.
//
// The vision's payoff is *"first morning in the destination, scored against what
// was promised at the gate"* — which needs both sides, and until now only one
// was persisted. The briefing carries `coverage`, but `meridian:lastPlan` dropped
// it, so there was no promise on file to be honest against.
//
// Pure and separately tested: the numbers on the arrival screen are a claim about
// the traveller's trip, and an arrival screen that flatters is worse than none.

/** What the gate said, as stored on the saved plan. */
export interface GatePromise {
  coverage: ShiftCoverage;
  /** Mean plan score at the gate, when the saved plan carried one. */
  score?: number;
  savedAt: string;
}

/** The shape `meridian:lastPlan` is written in. Kept loose on read — an old
 *  plan saved before coverage existed must still load, just as `unknown`. */
export interface SavedPlanLike {
  summary?: string;
  score?: number;
  coverage?: ShiftCoverage;
  savedAt?: string;
  days?: unknown[];
  /** The wearer's baseline, saved with the plan so the landing can be scored
   *  against the same model the clock was showing. Absent on plans saved
   *  before it — those fall back to the gate's own numbers. */
  baseline?: WearableBaseline;
}

/**
 * What the body clock is projected to be when the traveller lands, and what
 * the plan's timing actually delivered.
 *
 * This is the loop the whole product turns on: the gate scored the plan's
 * *declared* shift, the clock shows the *modelled* one, and the landing says
 * which of the two the traveller actually got. A plan that claimed 100% and
 * delivered 40% is the case the page exists to name.
 */
export interface LandingProjection {
  /** Hours the body clock is projected to be from the destination's night. */
  hours: number;
  lowHours: number;
  highHours: number;
  /** The same gap with no plan at all — what doing nothing would leave. */
  baselineHours: number;
  /** Hours of the required shift the plan's timing actually delivered. */
  deliveredHours: number;
  /** Hours of the required shift the plan claimed (the gate's coverage). */
  claimedHours: number;
  /** The required shift, in hours. */
  requiredHours: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * The landing projection, from the saved plan and the baseline it was built
 * on. Null when either is missing — an old plan, or a traveller who never
 * gave a baseline, gets the gate's numbers and nothing invented.
 */
export function landingProjection(
  trip: Trip,
  planRaw: string | null,
  baseline?: WearableBaseline,
): LandingProjection | null {
  if (!baseline || !planRaw) return null;
  let plan: SavedPlanLike;
  try {
    plan = JSON.parse(planRaw) as SavedPlanLike;
  } catch {
    return null;
  }
  const days = Array.isArray(plan.days) ? (plan.days as DayPlan[]) : [];
  if (!days.length) return null;

  const traj = computeTripTrajectory({ trip, days, baseline, calendar: [] });
  const arrivalIdx = trip.departureDayIndex + 1;
  const point = traj.find((t) => t.dayIndex === arrivalIdx) ?? traj[traj.length - 1];
  if (!point) return null;

  const requiredHours = Math.abs(trip.requiredShiftMin) / 60;
  // The claim is measured *up to the landing day*, because that is the moment
  // the delivery is measured at. A plan that banks hours after touchdown has
  // not delivered them by the time the traveller lands, and comparing the
  // whole plan against the landing would make every plan look like a liar.
  const claimedMin = days
    .filter((d) => d.dayIndex <= arrivalIdx)
    .reduce((sum, d) => sum + Math.abs(d.shiftMin), 0);
  return {
    hours: point.misalignmentHours,
    lowHours: point.misalignmentLowHours,
    highHours: point.misalignmentHighHours,
    baselineHours: point.baselineMisalignmentHours,
    deliveredHours: round1(Math.max(0, requiredHours - point.misalignmentHours)),
    claimedHours: round1(claimedMin / 60),
    requiredHours: round1(requiredHours),
  };
}

/** Reads the gate promise out of a saved plan, or null when there isn't one.
 *  Absence is honest: an old plan predating `coverage` reports no promise
 *  rather than a zeroed one, which would read as "the crew promised nothing". */
export function readGatePromise(raw: string | null): GatePromise | null {
  if (!raw) return null;
  let plan: SavedPlanLike;
  try {
    plan = JSON.parse(raw) as SavedPlanLike;
  } catch {
    return null;
  }
  if (!plan?.coverage) return null;
  return {
    coverage: plan.coverage,
    score: typeof plan.score === "number" ? plan.score : undefined,
    savedAt: typeof plan.savedAt === "string" ? plan.savedAt : "",
  };
}

export interface ArrivalRead {
  /** True once the traveller is past the flight — the first morning in the
   *  destination. The destination clock, not the viewer's. */
  arrived: boolean;
  /** Days since touchdown, 0 on arrival day. */
  daysSinceArrival: number;
  /** Days of the trip that are still ahead. */
  daysRemaining: number;
  /** The gate's promise, if one was saved. */
  promise: GatePromise | null;
  /** Followed / marked / missed across every check-in recorded for the trip. */
  followed: number;
  missed: number;
  partial: number;
  /** 0..1 — followed over (followed + partial + missed). Null with no marks,
   *  because "nobody has said anything" is not 0%. */
  followRate: number | null;
  /** What the body clock is projected to be at landing, when the plan and the
   *  baseline are both on file. */
  projection: LandingProjection | null;
}

/**
 * The arrival read for `trip`, given the saved plan and the check-ins the
 * traveller has recorded.
 *
 * Arrival is judged at the destination's clock (see `dayPlace`): a traveller
 * whose flight lands at 07:50 Tokyo time is *not* still on D-1 just because it
 * is still the previous evening in London.
 */
export function arrivalRead(
  trip: Trip,
  planRaw: string | null,
  checkIns: CheckIn[],
  now: Date,
  baseline?: WearableBaseline,
): ArrivalRead {
  const arrivalDayIndex = trip.departureDayIndex + 1;
  const arrivalSpec = trip.days.find((d) => d.dayIndex === arrivalDayIndex);

  let arrived = false;
  let daysSinceArrival = 0;
  if (arrivalSpec?.date) {
    // Minutes since local midnight at the destination on the arrival date.
    const place = trip.destination;
    const arrivalUtcMin =
      Date.parse(`${arrivalSpec.date}T00:00:00Z`) / 60000 - place.utcOffsetMin;
    const nowUtcMin = now.getTime() / 60000;
    daysSinceArrival = Math.floor((nowUtcMin - arrivalUtcMin) / 1440);
    arrived = daysSinceArrival >= 0;
  }

  // Days the trip still has, counted from the last planned day. Measured in
  // whole days between calendar dates at the destination, not by dividing
  // elapsed minutes — the division form drifts by one whenever the local time
  // of day isn't midnight, which made a finished trip report "1 day left".
  const lastSpec = trip.days[trip.days.length - 1];
  let daysRemaining = 0;
  if (lastSpec?.date && arrived) {
    const todayAtDest = new Date(
      now.getTime() + trip.destination.utcOffsetMin * 60000,
    ).toISOString().slice(0, 10);
    const daysBetween = (a: string, b: string) =>
      Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
    daysRemaining = Math.max(0, daysBetween(todayAtDest, lastSpec.date));
  }

  // Only this trip's marks count. A check-in carries a dayIndex, so anything
  // outside the trip's range belongs to another journey.
  const inTrip = new Set(trip.days.map((d) => d.dayIndex));
  const mine = checkIns.filter((c) => inTrip.has(c.dayIndex));
  const followed = mine.filter((c) => c.status === "done").length;
  const missed = mine.filter((c) => c.status === "skipped").length;
  const partial = mine.filter((c) => c.status === "partial").length;
  const total = mine.length;
  const followRate = total ? followed / total : null;

  return {
    arrived,
    daysSinceArrival: Math.max(0, daysSinceArrival),
    daysRemaining,
    promise: readGatePromise(planRaw),
    followed,
    missed,
    partial,
    followRate,
    projection: landingProjection(trip, planRaw, baseline),
  };
}

/** The trip debrief: score, what worked, what the crew learned, and the next
 *  trip. Bet 4 — the retention story made navigable. Pure composition over
 *  `arrivalRead` + `arrivalRows` + `secondTripProof`-shaped history: the
 *  debrief names the gate score, the follow-through, the single strongest
 *  adherence signal, and — when a prior different-route trip exists — what
 *  the crew carried in. Null sections render nothing; the debrief never
 *  invents a lesson the marks don't support. */
export interface DebriefLesson {
  /** "followed the light", "kept the run", "held the window" — grounded in
   *  check-in statuses, never generic praise. */
  label: string;
  detail: string;
}

export interface TripDebrief {
  headline: string;
  gateScore: number | null;
  followRate: number | null;
  followed: number;
  missed: number;
  /** The one adherence signal worth carrying forward, or null when the
   *  marks don't support one. */
  lesson: DebriefLesson | null;
  /** Route label of the prior different-route trip, if any — the proof the
   *  loop is compounding, not restarting. */
  carriedFrom: string | null;
}

/** Minimal shape for the prior-trip read — duck-typed onto the Supabase
 *  `listRuns()` rows and the local history entries alike. */
export interface DebriefRun {
  savedAt?: string;
  trip?: { origin?: { code?: string }; destination?: { code?: string } } | null;
  score?: number;
}

export function tripDebrief(
  read: ArrivalRead,
  destName: string,
  checkIns: CheckIn[],
  currentRoute: { origin: string; destination: string },
  priorRuns: DebriefRun[],
): TripDebrief {
  const headline = arrivalHeadline(read, destName);
  const gateScore = read.promise?.score ?? null;
  const kinds = checkIns.filter((c) => c.status === "done" && c.kind).map((c) => c.kind!);
  const counts = new Map<string, number>();
  for (const k of kinds) counts.set(k, (counts.get(k) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const lesson: DebriefLesson | null = top
    ? {
        label: top[0].replace(/_/g, " "),
        detail: `${top[1]} time${top[1] === 1 ? "" : "s"} followed — the crew weights this first next trip.`,
      }
    : null;
  let carriedFrom: string | null = null;
  for (let i = priorRuns.length - 1; i >= 0; i--) {
    const o = priorRuns[i]?.trip?.origin?.code;
    const d = priorRuns[i]?.trip?.destination?.code;
    if (!o || !d) continue;
    if (o === currentRoute.origin && d === currentRoute.destination) continue;
    carriedFrom = `${o} → ${d}`;
    break;
  }
  return {
    headline,
    gateScore,
    followRate: read.followRate,
    followed: read.followed,
    missed: read.missed,
    lesson,
    carriedFrom,
  };
}

/** One honest sentence for the arrival screen. Never rounds a shortfall up. */
export function arrivalHeadline(read: ArrivalRead, destName: string): string {
  const { coverage } = read.promise ?? { coverage: null };
  // The projection, when it exists, is the honest number: what the model says
  // the body clock will be. The gate's coverage is what the plan *claimed*.
  const p = read.projection;
  if (p) {
    const band = p.lowHours === p.highHours ? "" : ` (${p.lowHours.toFixed(1)}–${p.highHours.toFixed(1)}h)`;
    const delivery = p.deliveredHours > 0
      ? `Your plan's timing carried ${p.deliveredHours.toFixed(1)}h of the ${p.requiredHours.toFixed(1)}h shift`
      : `Your plan's timing carried none of the ${p.requiredHours.toFixed(1)}h shift`;
    const counterfactual = p.baselineHours > p.hours
      ? `; doing nothing would have left you ${p.baselineHours.toFixed(1)}h off.`
      : ".";
    return `You landed about ${p.hours.toFixed(1)}h from ${destName} time${band}. ${delivery}${counterfactual}`;
  }
  if (!coverage) {
    return `You're in ${destName}. This trip's plan wasn't saved, so there's nothing to score against — the self-report still counts.`;
  }
  const owed = Math.round(coverage.residualMin / 6) / 10;
  if (coverage.complete || coverage.residualMin <= 0) {
    return `You landed fully adapted. Every hour of the shift was banked before you flew.`;
  }
  const banked = Math.round(coverage.ratio * 100);
  return `You landed ${owed}h from ${destName} time — ${banked}% of the shift banked before you flew, and the crew kept working after touchdown.`;
}