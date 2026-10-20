import type { Citation, DayPlan, Trip, WearableBaseline } from "@/domain/types";

/** Rebuilds the locked-days map from the saved plan + saved trip, but only
 *  when the pair still describes the route on screen: same airports and the
 *  same departure-day date. Any drift — a different trip, an edited date,
 *  corrupt JSON — returns null and Home stays on the example preview. */
export function restorePlan(
  lastPlanRaw: string | null,
  lastTripRaw: string | null,
  route: { origin: string; dest: string; date: string },
): {
  locked: Map<string, DayPlan>;
  citations: Citation[];
  /** The baseline the plan was built on, when the saved plan carries one —
   *  it is what the clock's projection needs, and the only way the clock can
   *  still work with no network. */
  baseline?: WearableBaseline;
  /** The trip the plan belongs to, for the same reason. */
  trip?: Trip;
} | null {
  if (!lastPlanRaw || !lastTripRaw) return null;
  try {
    const plan = JSON.parse(lastPlanRaw);
    const trip = JSON.parse(lastTripRaw);
    if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) return null;
    if (!trip?.origin?.code || !trip?.destination?.code) return null;
    if (trip.origin.code !== route.origin || trip.destination.code !== route.dest) {
      return null;
    }
    const depDay = Array.isArray(trip.days)
      ? trip.days.find(
          (d: { dayIndex?: number }) => d.dayIndex === trip.departureDayIndex,
        )
      : null;
    if (!depDay || depDay.date !== route.date) return null;
    return {
      locked: new Map<string, DayPlan>(
        plan.days
          .filter((d: DayPlan) => typeof d?.label === "string")
          .map((d: DayPlan) => [d.label, d]),
      ),
      citations: Array.isArray(plan.citations) ? plan.citations : [],
      baseline: plan.baseline as WearableBaseline | undefined,
      trip: trip as Trip,
    };
  } catch {
    return null;
  }
}
