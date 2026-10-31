import { runCrew } from "../src/agents/runtime";
import { resolveCrewQuestion } from "../src/lib/crew-questions";
import { buildTrip, calendarFor } from "../src/domain/fixtures";

const trip = buildTrip("LHR", "HND", "2026-11-04");
const gen = runCrew({ trip, calendar: calendarFor(trip) });
for await (const e of gen) {
  if (e.type === "crew_question") {
    console.log("QUESTION:", e.question.text, "| options:", e.question.options.map(o => o.id).join(","));
    console.log("resolve:", JSON.stringify(resolveCrewQuestion(e.question.id, "earlier45")));
  }
  if (e.type === "crew_answer") console.log("ANSWER:", JSON.stringify(e));
  if (e.type === "day_locked") {
    const l = e.day.interventions.find(i => i.kind === "light_exposure");
    console.log(`LOCKED ${e.day.label} shift ${e.day.shiftMin} light ${l?.startMin}`);
    break;
  }
  if (e.type === "error") console.log("ERR:", e.message);
}
console.log("done");
