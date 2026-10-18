import type { DayPlan } from "@/domain/types";

/** Rebuilds the locked-days map from the saved plan + saved trip, but only
 *  when the pair still describes the route on screen: same airports and the
 *  same departure-day date. Any drift — a different trip, an edited date,
 *  corrupt JSON — returns null and Home stays on the example preview. */
export function restorePlan(
  lastPlanRaw: string | null,
  lastTripRaw: string | null,
  route: { origin: string; dest: string; date: string },
): Map<string, DayPlan> | null {
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
    return new Map<string, DayPlan>(
      plan.days
        .filter((d: DayPlan) => typeof d?.label === "string")
        .map((d: DayPlan) => [d.label, d]),
    );
  } catch {
    return null;
  }
}
