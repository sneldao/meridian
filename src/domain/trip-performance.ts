import { heroMeeting, type HeroMeeting } from "@/domain/hero";
import type { CalendarEvent, DayPlan, Trip, WearableBaseline } from "@/domain/types";

export function performanceMoment(input: {
  trip: Trip;
  calendar: CalendarEvent[];
  plans: DayPlan[];
  baseline?: WearableBaseline;
}): HeroMeeting | null {
  const candidate = heroMeeting({ ...input, locked: [] });
  if (!candidate) return null;
  const event = input.calendar.find((e) => e.id === candidate.eventId);
  if (!event) return null;
  const dayIndex = event.movedTo?.dayIndex ?? event.dayIndex;
  return heroMeeting({
    trip: input.trip,
    calendar: [event],
    locked: input.plans.filter((day) => day.dayIndex < dayIndex),
    baseline: input.baseline,
  });
}
