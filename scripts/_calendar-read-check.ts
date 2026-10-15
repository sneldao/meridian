import { buildTrip } from "@/domain/fixtures";
import { fetchGoogleCalendar, googleCalendarEnabled } from "@/tools/calendar-google";

const trip = buildTrip("LHR", "HND", "2026-10-18");
console.log("google backend enabled:", googleCalendarEnabled());
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const events = await fetchGoogleCalendar(trip);
    console.log(`attempt ${attempt}: ok, ${events.length} event(s) in trip window`);
    const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    trip.days.forEach((d, i) => {
      const inDay = events.filter((e) => e.dayIndex === i);
      console.log(
        `${d.label} ${d.date}: ${inDay.length}`,
        inDay.map((e) => `${fmt(e.startMin)}-${fmt(e.endMin)} ${e.movable ? "movable" : "fixed"}`).join(", "),
      );
    });
    process.exit(0);
  } catch (err) {
    console.log(`attempt ${attempt}: ${err instanceof Error ? err.message : String(err)}`);
    await new Promise((r) => setTimeout(r, 3000));
  }
}
process.exit(1);
