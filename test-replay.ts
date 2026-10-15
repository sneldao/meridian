import { runReplay } from "./src/agents/replay";
const counts: Record<string, number> = {};
for await (const e of runReplay()) {
  counts[e.type] = (counts[e.type] ?? 0) + 1;
  if (e.type === "eval_result") {
    console.log(`eval attempt ${e.attempt}: feasible=${e.result.feasible} score=${e.result.score} violations=${e.result.violations.map(v=>v.code).join(",") || "none"}`);
  }
  if (e.type === "day_locked") console.log(`LOCKED ${e.day.label} shift=${e.day.shiftMin} sun=${(e.sunProgress*100).toFixed(0)}%`);
  if (e.type === "calendar_move") console.log(`MOVE ${e.move.title} -> day${e.move.to.dayIndex} ${Math.floor(e.move.to.startMin/60)}:${String(e.move.to.startMin%60).padStart(2,"0")}`);
}
console.log(counts);
