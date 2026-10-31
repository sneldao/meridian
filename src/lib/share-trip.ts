import type { Trip } from "@/domain/types";

export function shareTripContext(trip: Trip) {
  return {
    origin: { code: trip.origin.code, name: trip.origin.name },
    destination: { code: trip.destination.code, name: trip.destination.name },
    requiredShiftMin: trip.requiredShiftMin,
    direction: trip.direction,
    departureDayIndex: trip.departureDayIndex,
    days: trip.days.map(({ dayIndex, label, date }) => ({ dayIndex, label, date })),
  };
}
