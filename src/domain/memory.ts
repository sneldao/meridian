import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckIn, CrewMemory } from "./types";

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
