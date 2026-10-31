import { demoJourney, stakesGapHours, clockLabel, planRows } from "@/domain/demo-beats";
const j = demoJourney("jason");
console.log("moment:", j.moment.title, clockLabel(j.moment.localMin), "body(no plan)", clockLabel(j.moment.bodyWithoutPlanMin), "body(plan)", clockLabel(j.moment.bodyMin));
console.log("gap:", stakesGapHours(j.moment));
console.log("read.arrived:", j.read.arrived, "projection:", JSON.stringify(j.read.projection)?.slice(0, 120));
console.log("passport verdict:", j.passport?.verdict ?? "none");
console.log("plan rows:", planRows(j).length, planRows(j).map(r => `${r.time} ${r.label}`).join(" | "));
console.log("trip days:", j.trip.days.map(d => `${d.label}:${d.date}`).join(" "), "dep idx", j.trip.departureDayIndex);
