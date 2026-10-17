import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckIn, CrewMemory } from "./types";
import { secondTripCopy, secondTripProof } from "./second-trip";

// Cross-run memory, kept deliberately boring: one JSON file in artifacts/.
// The analyst reads it before planning; each completed run appends to it.
// Same shape as a file-based memory tool — the merge path swaps the store,
// not the interface.

// One JSON file per traveller — the same tenant scoping the graph uses. No
// tenant = the demo/shared traveller (the existing crew-memory.json).

const MEMORY_DIR = path.join(process.cwd(), "artifacts");

const memoryPath = (tenant?: string) => {
  const safe = tenant?.replace(/[^a-z0-9_-]/gi, "").slice(0, 48);
  return path.join(MEMORY_DIR, safe ? `crew-memory-${safe}.json` : "crew-memory.json");
};

const EMPTY: CrewMemory = {
  runs: [],
  checkIns: [],
  learned: { skippedKinds: [], notes: [] },
};

export async function loadMemory(tenant?: string): Promise<CrewMemory> {
  try {
    const raw = await readFile(memoryPath(tenant), "utf8");
    const parsed = JSON.parse(raw) as Partial<CrewMemory>;
    return {
      runs: parsed.runs ?? [],
      checkIns: parsed.checkIns ?? [],
      learned: parsed.learned ?? { skippedKinds: [], notes: [] },
    };
  } catch {
    return { ...EMPTY };
  }
}

export async function recordCheckIn(checkIn: CheckIn, tenant?: string): Promise<CrewMemory> {
  const mem = await loadMemory(tenant);
  mem.checkIns.push(checkIn);
  mem.checkIns = mem.checkIns.slice(-200);
  if (checkIn.status === "skipped" || checkIn.status === "harder") {
    if (checkIn.kind && !mem.learned.skippedKinds.includes(checkIn.kind)) {
      mem.learned.skippedKinds.push(checkIn.kind);
    }
    if (checkIn.text) {
      mem.learned.notes.push(checkIn.text.slice(0, 140));
      mem.learned.notes = mem.learned.notes.slice(-20);
    }
  }
  if (checkIn.status === "done" && checkIn.startMin !== undefined) {
    mem.learned.earliestDoneMin =
      mem.learned.earliestDoneMin === undefined
        ? checkIn.startMin
        : Math.min(mem.learned.earliestDoneMin, checkIn.startMin);
  }
  await save(mem, tenant);
  return mem;
}

export async function recordRun(run: CrewMemory["runs"][number], tenant?: string): Promise<void> {
  const mem = await loadMemory(tenant);
  mem.runs.push(run);
  mem.runs = mem.runs.slice(-50);
  await save(mem, tenant);
}

export async function listCheckIns(tenant?: string): Promise<CheckIn[]> {
  return (await loadMemory(tenant)).checkIns;
}

async function save(mem: CrewMemory, tenant?: string) {
  const file = memoryPath(tenant);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(mem, null, 2));
}

/** One-paragraph brief for the analyst's prompt — memory in prose, not JSON. */
export function memoryBrief(mem: CrewMemory): string {
  const bits: string[] = [];
  if (mem.runs.length) {
    const last = mem.runs[mem.runs.length - 1];
    bits.push(`${mem.runs.length} prior shift(s); last locked ${last.lockedDays} days at score ${last.meanScore}.`);
  }
  if (mem.learned.skippedKinds.length) {
    bits.push(`Historically fails: ${mem.learned.skippedKinds.join(", ")}.`);
  }
  if (mem.learned.earliestDoneMin !== undefined) {
    const h = Math.floor(mem.learned.earliestDoneMin / 60);
    const m = String(mem.learned.earliestDoneMin % 60).padStart(2, "0");
    bits.push(`Earliest ask ever completed: ${h}:${m}.`);
  }
  if (mem.learned.notes.length) {
    bits.push(`In their own words: ${mem.learned.notes.slice(-3).map((n) => `"${n}"`).join("; ")}.`);
  }
  return bits.length ? bits.join(" ") : "No history — first shift.";
}

/** The cross-trip line for the analyst's prompt: what the crew carried from
 *  the traveller's last *different-route* trip into this one. CrewMemory
 *  runs carry only `tripLabel` ("LHR→HND"), so the proof is honest but thin:
 *  the route remembered, not the score. Null when there is no prior
 *  different-route trip — the prompt then carries no cross-trip claim at
 *  all, never an invented one. The Supabase-backed `secondTripProof` (with
 *  scores) is the surface proof; this is the prompt-side echo from the
 *  file-backed memory the analyst actually reads. */
export function crossTripBrief(
  mem: CrewMemory,
  currentRoute: { origin: string; destination: string },
): string | null {
  const labels = mem.runs
    .map((r) => r.tripLabel)
    .filter((l): l is string => typeof l === "string" && l.includes("→"));
  for (let i = labels.length - 1; i >= 0; i--) {
    const [origin, destination] = labels[i].split("→");
    if (!origin || !destination) continue;
    if (origin === currentRoute.origin && destination === currentRoute.destination) continue;
    return `Cross-trip: the crew remembers ${labels[i]} from a prior shift — not this route, so the plan starts from what that trip taught, not from zero.`;
  }
  return null;
}

/** `memoryBrief` plus the cross-trip line when one exists. The analyst
 *  prompt calls this instead of `memoryBrief` directly; with no prior
 *  different-route trip the output is exactly `memoryBrief` — no claim
 *  added, none removed. */
export function memoryBriefWithCrossTrip(
  mem: CrewMemory,
  currentRoute: { origin: string; destination: string },
): string {
  const base = memoryBrief(mem);
  const cross = crossTripBrief(mem, currentRoute);
  return cross ? `${base} ${cross}` : base;
}

// Re-exported so prompt call sites read one module for the memory brief
// family; the proof itself stays owned by `./second-trip`.
export { secondTripCopy, secondTripProof };
