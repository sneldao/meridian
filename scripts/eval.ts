// Eval harness — not a hillclimbing loop, the scaffolding for one.
//
// Runs the real crew (whatever AGENT_PROVIDER is set — replay is free,
// anthropic spends tokens) against a small fixed scenario matrix, scores
// each run the same way the product does (the deterministic circadian
// gate), and persists one row per scenario so quality is a trend line,
// not a vibe. Calendar is forced to fixtures so eval runs never touch a
// real connected Google Calendar.
//
// Usage:
//   bun run eval            # run the scenario matrix, persist + print
//   bun run eval --report   # print the trend from persisted history, no run

import { buildTrip, calendarFor } from "../src/domain/fixtures";
import { runCrew } from "../src/agents/runtime";
import { providerKind } from "../src/agents/providers";
import { persistEval, listEvals, supabaseEnabled, type EvalPayload } from "../src/tools/supabase";
import type { CrewEvent } from "../src/domain/types";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const LOCAL_LOG = path.join(process.cwd(), "artifacts", "evals.json");

// Three fixed scenarios: the demo route (eastward, tight calendar), a
// westward route (exercises the other half of the scorer — delay plans,
// evening light), and the ICP-2 persona's longer westward delay. Same
// matrix every run — that's what makes the trend mean something.
const SCENARIOS: { name: string; trip: ReturnType<typeof buildTrip> }[] = [
  { name: "LHR→HND eastward (Alex, the demo route)", trip: buildTrip("LHR", "HND", "2026-10-18") },
  { name: "LHR→JFK westward", trip: buildTrip("LHR", "JFK", "2026-10-18") },
  { name: "LHR→MEX westward (Valentina)", trip: buildTrip("LHR", "MEX", "2026-10-18") },
];

async function runScenario(name: string, trip: ReturnType<typeof buildTrip>): Promise<EvalPayload> {
  const started = Date.now();
  let provider = providerKind();
  let fallback = false;
  let toolCalls = 0;
  let attempts = 0;
  let daysLocked = 0;
  let meanScore: number | null = null;
  let coverageRatio: number | null = null;
  let residualMin: number | null = null;
  const violations: Record<string, number> = {};

  const stream = runCrew({ trip, calendar: calendarFor(trip), calendarSource: "fixture" }) as AsyncGenerator<CrewEvent>;
  for await (const e of stream) {
    if (e.type === "run_start") provider = e.provider as typeof provider;
    if (e.type === "error") fallback = true;
    if (e.type === "tool_call") toolCalls++;
    if (e.type === "eval_result") {
      attempts++;
      for (const v of e.result.violations) violations[v.code] = (violations[v.code] ?? 0) + 1;
    }
    if (e.type === "day_locked") daysLocked++;
    // briefing fires once at the end — score is the mean of every feasible
    // attempt this run (runtime.ts), our one source of truth for quality.
    if (e.type === "briefing") {
      meanScore = e.days.length ? e.score : null;
      coverageRatio = e.days.length ? e.coverage.ratio : null;
      residualMin = e.coverage.residualMin;
    }
  }

  return {
    savedAt: new Date().toISOString(),
    scenario: name,
    provider,
    fallback,
    daysLocked,
    daysTotal: 5,
    meanScore,
    // Adequacy, tracked separately from feasibility: a run can lock every day
    // and still leave the wearer hours out of sync on landing. Lock rate alone
    // cannot see that, so coverage is a first-class column.
    coverageRatio,
    residualMin,
    attempts,
    toolCalls,
    violations,
    durationMs: Date.now() - started,
  };
}

async function appendLocal(row: EvalPayload) {
  await mkdir(path.dirname(LOCAL_LOG), { recursive: true });
  let existing: EvalPayload[] = [];
  try {
    existing = JSON.parse(await readFile(LOCAL_LOG, "utf8"));
  } catch {
    // first run — no file yet
  }
  existing.push(row);
  await writeFile(LOCAL_LOG, JSON.stringify(existing, null, 2));
}

async function loadHistory(): Promise<EvalPayload[]> {
  if (supabaseEnabled()) return listEvals();
  try {
    return JSON.parse(await readFile(LOCAL_LOG, "utf8"));
  } catch {
    return [];
  }
}

function printRow(r: EvalPayload) {
  const lockRate = `${r.daysLocked}/${r.daysTotal}`;
  const score = r.meanScore !== null ? r.meanScore.toFixed(2) : "—";
  const vio = Object.entries(r.violations)
    .map(([k, n]) => `${k}×${n}`)
    .join(", ") || "none";
  const cov = r.coverageRatio !== null && r.coverageRatio !== undefined ? `${Math.round(r.coverageRatio * 100)}%` : "—";
  console.log(
    `  ${lockRate.padEnd(5)} score ${score.padEnd(5)} shift ${cov.padEnd(5)} attempts ${String(r.attempts).padEnd(2)} tools ${String(r.toolCalls).padEnd(3)} ${r.provider}${r.fallback ? "(fallback)" : ""}  violations: ${vio}`,
  );
}

async function report() {
  const history = await loadHistory();
  console.log(`\n${history.length} eval runs on record (${supabaseEnabled() ? "Supabase" : "local artifacts/evals.json"})\n`);
  const byScenario = new Map<string, EvalPayload[]>();
  for (const r of history) {
    if (!byScenario.has(r.scenario)) byScenario.set(r.scenario, []);
    byScenario.get(r.scenario)!.push(r);
  }
  for (const [scenario, runs] of byScenario) {
    runs.sort((a, b) => a.savedAt.localeCompare(b.savedAt));
    const lockRate = runs.reduce((s, r) => s + r.daysLocked / r.daysTotal, 0) / runs.length;
    const scored = runs.filter((r) => r.meanScore !== null);
    const meanScore = scored.length ? scored.reduce((s, r) => s + (r.meanScore ?? 0), 0) / scored.length : null;
    const covered = runs.filter((r) => typeof r.coverageRatio === "number");
    const meanCoverage = covered.length
      ? covered.reduce((s, r) => s + (r.coverageRatio ?? 0), 0) / covered.length
      : null;
    const allViolations: Record<string, number> = {};
    for (const r of runs) for (const [k, n] of Object.entries(r.violations)) allViolations[k] = (allViolations[k] ?? 0) + n;
    const topViolations = Object.entries(allViolations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, n]) => `${k}×${n}`)
      .join(", ") || "none";
    const trend = runs.map((r) => (r.daysLocked === r.daysTotal ? "●" : r.daysLocked >= r.daysTotal - 1 ? "◐" : "○")).join("");

    console.log(`${scenario}`);
    console.log(`  ${runs.length} runs · avg lock rate ${(lockRate * 100).toFixed(0)}% · avg score ${meanScore?.toFixed(2) ?? "—"} · avg shift covered ${meanCoverage !== null ? `${Math.round(meanCoverage * 100)}%` : "—"}`);
    console.log(`  trend (oldest→newest): ${trend}`);
    console.log(`  top violations: ${topViolations}\n`);
  }
}

async function main() {
  if (process.argv.includes("--report")) {
    await report();
    return;
  }

  console.log(`Running eval matrix on AGENT_PROVIDER=${providerKind()}${supabaseEnabled() ? " · persisting to Supabase" : " · persisting to artifacts/evals.json"}\n`);
  for (const { name, trip } of SCENARIOS) {
    process.stdout.write(`${name} ... `);
    const row = await runScenario(name, trip);
    console.log("done");
    printRow(row);
    const persisted = await persistEval(row);
    if (!persisted) await appendLocal(row);
  }
  console.log("\nRun `bun run eval -- --report` to see the trend across all recorded runs.");
}

main();
