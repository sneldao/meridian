import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, unlinkSync } from "fs";
import path from "path";
import type { CrewEvent } from "@/domain/types";

export interface StampedCrewEvent {
  seq: number;
  runId: string;
  event: CrewEvent;
}

interface CrewRun {
  id: string;
  createdAt: number;
  events: StampedCrewEvent[];
  listeners: Set<(event: StampedCrewEvent) => void>;
  controller: AbortController;
  done: boolean;
  cancelled: boolean;
}

type Registry = Map<string, CrewRun>;

const registry = (): Registry => {
  const g = globalThis as typeof globalThis & { __meridianCrewRuns?: Registry };
  g.__meridianCrewRuns ??= new Map();
  return g.__meridianCrewRuns;
};

const TTL_MS = 2 * 60 * 60 * 1000;
const LOG_DIR = path.join(process.cwd(), "artifacts", "crew-runs");
const safeRunId = (id: string) => id.replace(/[^\w:-]/g, "_");
const runFile = (id: string) => path.join(LOG_DIR, `${safeRunId(id)}.jsonl`);

function removeRunFile(id: string) {
  try { unlinkSync(runFile(id)); } catch { /* ignore */ }
}

function sweep() {
  const now = Date.now();
  for (const [id, run] of registry()) {
    if (run.done && now - run.createdAt > TTL_MS) {
      registry().delete(id);
      removeRunFile(id);
    }
  }
}

function persist(stamped: StampedCrewEvent) {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(runFile(stamped.runId), `${JSON.stringify(stamped)}\n`);
  } catch {
    // Event replay is an availability feature; it must never break the run.
  }
}

function stamp(run: CrewRun, event: CrewEvent): StampedCrewEvent {
  const stamped = { seq: run.events.length + 1, runId: run.id, event };
  run.events.push(stamped);
  persist(stamped);
  if (event.type === "done") run.done = true;
  for (const listener of run.listeners) listener(stamped);
  return stamped;
}

function makeRun(id: string, createdAt = Date.now()): CrewRun {
  return {
    id,
    createdAt,
    events: [],
    listeners: new Set(),
    controller: new AbortController(),
    done: false,
    cancelled: false,
  };
}

function hydrate(id: string): CrewRun | undefined {
  const file = runFile(id);
  if (!existsSync(file)) return undefined;
  try {
    if (Date.now() - statSync(file).mtimeMs > TTL_MS) {
      removeRunFile(id);
      return undefined;
    }
  } catch {
    return undefined;
  }
  const run = makeRun(id);
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const stamped = JSON.parse(line) as StampedCrewEvent;
      if (!stamped || typeof stamped.seq !== "number" || stamped.runId !== id) return undefined;
      run.events.push(stamped);
      if (stamped.event.type === "done") run.done = true;
    }
  } catch {
    return undefined;
  }
  if (!run.events.length) return undefined;
  registry().set(id, run);
  if (!run.done) {
    stamp(run, {
      type: "error",
      message: "The crew process restarted before this run finished — its recorded events are replayed, but it cannot continue.",
      recoverable: true,
    });
    stamp(run, { type: "done" });
  }
  return run;
}

export function crewRun(runId: string): CrewRun | undefined {
  sweep();
  return registry().get(runId) ?? hydrate(runId);
}

export function startCrewRun(runId: string): { run: CrewRun; signal: AbortSignal } {
  sweep();
  const existing = crewRun(runId);
  if (existing) return { run: existing, signal: existing.controller.signal };
  const run = makeRun(runId);
  registry().set(runId, run);
  return { run, signal: run.controller.signal };
}

export function appendCrewEvent(runId: string, event: CrewEvent): StampedCrewEvent {
  const run = crewRun(runId);
  if (!run) throw new Error(`unknown crew run ${runId}`);
  return stamp(run, event);
}

export function eventsAfter(runId: string, afterSeq: number): StampedCrewEvent[] {
  return crewRun(runId)?.events.filter((e) => e.seq > afterSeq) ?? [];
}

export function subscribeCrewRun(
  runId: string,
  listener: (event: StampedCrewEvent) => void,
): () => void {
  const run = crewRun(runId);
  if (!run) return () => {};
  run.listeners.add(listener);
  return () => run.listeners.delete(listener);
}

export function finishCrewRun(runId: string): void {
  const run = crewRun(runId);
  if (run) run.done = true;
}

export function cancelCrewRun(runId: string): boolean {
  const run = crewRun(runId);
  if (!run || run.done) return false;
  run.cancelled = true;
  run.controller.abort(new Error("run cancelled by traveller"));
  return true;
}

export function isCrewRunCancelled(runId: string): boolean {
  return crewRun(runId)?.cancelled ?? false;
}
