import type { CheckIn, ShiftCoverage, Trip } from "@/domain/types";

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