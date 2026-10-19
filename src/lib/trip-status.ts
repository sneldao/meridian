import type { Trip } from "@/domain/types";

/** The trip is over once the last planned day has fully passed at the
 *  destination's clock — compared as calendar dates, not by dividing elapsed
 *  minutes, which drifts by one whenever the local time isn't midnight.
 *  Judged at the destination rather than the viewer's timezone: a traveller
 *  whose trip ended at 21:00 Tokyo time shouldn't still be told there are
 *  days left because it's lunchtime at home. */
export function isTripFinished(trip: Trip | null, now: Date): boolean {
  if (!trip) return false;
  const last = trip.days[trip.days.length - 1];
  if (!last?.date) return false;
  const todayAtDest = new Date(
    now.getTime() + trip.destination.utcOffsetMin * 60000,
  )
    .toISOString()
    .slice(0, 10);
  return (
    Date.parse(`${todayAtDest}T00:00:00Z`) >
    Date.parse(`${last.date}T00:00:00Z`)
  );
}
