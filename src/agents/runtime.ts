import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stepCountIs, streamText, tool, type ToolSet } from "ai";
import { z } from "zod";
import { evaluatePlan, fmtMin, passes, sunProgress } from "@/domain/circadian";
import { ADHERENCE_PROFILE, DEMO_TRIP, GARMIN_BASELINE } from "@/domain/fixtures";
import { foldCheckIns } from "@/domain/adherence";
import { loadMemory, memoryBrief, recordRun } from "@/domain/memory";import type {
  CalendarEvent,
  CalendarMove,
  CheckIn,
  Trip,
  Citation,
  CrewEvent,
  DayPlan,
  EvalResult,
} from "@/domain/types";
import { CREW, type CrewMember } from "./crew";
import { providerKind, resolveModel } from "./providers";
import { runReplay } from "./replay";
import { runMorningReplay } from "./morning-replay";
import { buildIcs, fetchCalendar, proposeMove } from "@/tools/calendar";
import { createPlanEvents, patchGoogleEvent } from "@/tools/calendar-google";
import { searchScience } from "@/tools/science";
import { getAdherenceProfile, getRecentNights, getWearableBaseline } from "@/tools/wearable";

const ARTIFACTS_DIR = path.join(process.cwd(), "artifacts");
const MAX_ATTEMPTS_PER_DAY = 2;

type Emit = (e: CrewEvent) => void;

/** A tool description before it becomes an AI-SDK Tool. runAgent wraps
 * execute for logging + event emission, then calls tool() once. */
interface ToolDef {
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  execute: (input: any, options?: unknown) => Promise<unknown> | unknown;
}

/** Runs the whole crew and yields events for the SSE route. Falls back to the
 * recorded transcript if the live provider throws — stage insurance. */
export function runCrew(opts?: {
  trip?: Trip;
  calendar?: CalendarEvent[];
  calendarSource?: "google" | "fixture";
  checkIns?: CheckIn[];
  startDayIndex?: number;
}): AsyncGenerator<CrewEvent> {
  const queue: CrewEvent[] = [];
  const notifier: { fn: (() => void) | null } = { fn: null };
  let finished = false;

  const emit: Emit = (e) => {
    queue.push(e);
    notifier.fn?.();
  };

  void (async () => {
    try {
      if (providerKind() === "replay") {
        await drain(replayFor(opts), emit);
      } else {
        const trip = opts?.trip ?? DEMO_TRIP;
        const cal = opts?.calendar
          ? { events: opts.calendar, source: opts.calendarSource ?? "fixture" }
          : await fetchCalendar(trip);
        await orchestrate(
          emit,
          trip,
          cal.events,
          cal.source,
          opts?.checkIns ?? [],
          opts?.startDayIndex ?? 0,
        );
      }
    } catch (err) {
      emit({
        type: "error",
        message: `crew uplink failed: ${err instanceof Error ? err.message : String(err)} — switching to recorded shift`,
        recoverable: true,
      });
      await drain(replayFor(opts), emit);
    } finally {
      finished = true;
      notifier.fn?.();
    }
  })();

  return (async function* () {
    for (;;) {
      if (queue.length) {
        yield queue.shift()!;
        continue;
      }
      if (finished) return;
      await new Promise<void>((r) => (notifier.fn = r));
    }
  })();
}

async function drain(gen: AsyncGenerator<CrewEvent>, emit: Emit) {
  for await (const e of gen) emit(e);
}

/** Recorded transcript for this run: a morning shift (check-ins or a later
 * start day) gets the replan script, otherwise the night script. */
function replayFor(opts?: { checkIns?: CheckIn[]; startDayIndex?: number; trip?: Trip }): AsyncGenerator<CrewEvent> {
  const checkIns = opts?.checkIns ?? [];
  const startDayIndex = opts?.startDayIndex ?? 0;
  return checkIns.length > 0 || startDayIndex > 0
    ? runMorningReplay({ startDayIndex, checkIns, trip: opts?.trip })
    : runReplay(opts?.trip);
}

// --- orchestrator ------------------------------------------------------------

interface RunState {
  calendar: CalendarEvent[];
  citations: Citation[];
  lockedDays: DayPlan[];
  evals: EvalResult[];
  log: { ts: string; entry: string }[];
  pendingPlan: DayPlan | null;
  ics: string;
  briefingText: string;
}

async function orchestrate(emit: Emit, trip: Trip, calendarInput: CalendarEvent[], calendarSource: "google" | "fixture" = "fixture", checkIns: CheckIn[] = [], startDayIndex: number = 0) {
  const adherence = checkIns.length ? foldCheckIns(ADHERENCE_PROFILE, checkIns) : ADHERENCE_PROFILE;
  const memory = await loadMemory();
  let graphMem: { enabled: boolean; findings: { text: string; at: number; session: string; target?: string }[]; failures: { kind: string; status: string; text?: string; at: number }[] } = { enabled: false, findings: [], failures: [] };
  if (process.env.FALKORDB_URL) {
    try {
      const gm = await import("@/domain/graph-memory");
      if (gm.graphEnabled()) graphMem = await gm.loadGraphMemory();
    } catch {
      // optional graph memory never breaks the run
    }
  }
  const state: RunState = {
    calendar: calendarInput.map((e) => ({ ...e })),
    citations: [],
    lockedDays: [],
    evals: [],
    log: [],
    pendingPlan: null,
    ics: "",
    briefingText: "",
  };
  const logLine = (entry: string) =>
    state.log.push({ ts: new Date().toISOString(), entry });

  emit({
    type: "run_start",
    provider: providerKind(),
    trip,
    baseline: GARMIN_BASELINE,
    calendar: state.calendar,
  });
  for (const checkIn of checkIns) emit({ type: "check_in", checkIn });
  if (startDayIndex > 0) {
    emit({
      type: "replan",
      droppedDays: trip.days.filter((d) => d.dayIndex < startDayIndex).map((d) => d.dayIndex),
      reason: "morning shift: replanning remaining days with updated adherence",
    });
  }
  logLine("shift started — crew assembling");

  // 1. Analyst — reads the wearer.
  const analyst = await runAgent(
    CREW.analyst,
    {
      prompt:
        `Baseline + adherence profile are on your tools. Give the planner the constraints: chronotype, habitual window, and the compliance floor. Cross-run memory: ${memoryBrief(memory)} Graph memory: ${graphMem.enabled && graphMem.findings.length ? graphMem.findings.map((f) => `"${f.text}"`).join("; ") : "disabled or empty"}`,
      tools: {
        getWearableBaseline: bare("Read the wearer's wearable baseline", () => getWearableBaseline()),
        getRecentNights: bare("Read recent sleep nights", () => getRecentNights()),
        getAdherenceProfile: bare("Read the adherence profile", () => getAdherenceProfile()),
      },
    },
    emit,
    state,
  );
  logLine(`analyst: ${analyst.text}`);

  // 2. Researcher — pulls the literature.
  const research = await runAgent(
    CREW.researcher,
    {
      prompt:
        `${trip.direction === "east" ? "Eastward" : "Westward"} shift, ${Math.round(Math.abs(trip.requiredShiftMin) / 60)} time zones, ${trip.direction === "east" ? "advance" : "delay"} the clock. Find the strongest papers on timed light, melatonin timing and caffeine timing for phase ${trip.direction === "east" ? "advances" : "delays"}. Two+ searches, different angles.`,
      tools: {
        searchScience: {
          description: "Search scientific papers by meaning. Returns citations with DOIs.",
          inputSchema: z.object({ query: z.string(), k: z.number().default(5) }),
          execute: async ({ query, k }: { query: string; k: number }) => searchScience(query, k),
        },
      },
    },
    emit,
    state,
  );
  logLine(`researcher: ${research.toolCalls.length} searches, ${state.citations.length} citations kept`);

  // 3. Planner + evaluator loop — one day at a time, default-FAIL.
  for (const spec of trip.days.filter((d) => d.dayIndex >= startDayIndex)) {
    let day: DayPlan | null = null;
    let feedback = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_DAY && !day; attempt++) {
      state.pendingPlan = null;
      await runAgent(
        CREW.planner,
        {
          prompt: JSON.stringify(
            {
              task: `Submit ONE day plan for ${spec.label} (${spec.date}) via submitDayPlan.`,
              convention: "shiftMin negative = phase advance (eastward). Minutes are local-time-of-day.",
              requiredShiftMin: trip.requiredShiftMin,
              dayIndex: spec.dayIndex,
              analystConstraints: analyst.text,
              citations: state.citations.map((c) => ({ id: c.id, title: c.title })),
              adherenceFloorMin: adherence.ignoresInterventionsBeforeMin,
              calendar: state.calendar
                .filter((e) => e.dayIndex === spec.dayIndex)
                .map((e) => ({
                  title: e.title,
                  startMin: e.startMin,
                  endMin: e.endMin,
                  movable: e.movable,
                })),
              previousDays: state.lockedDays.map((d) => ({
                label: d.label,
                shiftMin: d.shiftMin,
                targetBedtimeMin: d.targetBedtimeMin,
                targetWakeMin: d.targetWakeMin,
              })),
              ...(feedback ? { evaluatorFeedback: feedback } : {}),
            },
            null,
            2,
          ),
          tools: {
            submitDayPlan: {
              description: "Submit the plan for this single day. Exactly one call.",
              inputSchema: z.object({
                shiftMin: z.number(),
                targetBedtimeMin: z.number(),
                targetWakeMin: z.number(),
                interventions: z.array(
                  z.object({
                    kind: z.enum([
                      "light_exposure",
                      "avoid_light",
                      "sleep_window",
                      "caffeine_cutoff",
                      "melatonin",
                      "exercise",
                      "meal_timing",
                      "nap",
                    ]),
                    startMin: z.number(),
                    endMin: z.number().optional(),
                    note: z.string(),
                    citationId: z.string().optional(),
                  }),
                ),
              }),
              execute: async (input: Omit<DayPlan, "dayIndex" | "label">) => {
                state.pendingPlan = { dayIndex: spec.dayIndex, label: spec.label, ...input };
                return "submitted";
              },
            },
          },
        },
        emit,
        state,
        "orchestrator",
      );

      const candidate = state.pendingPlan as DayPlan | null;
      if (!candidate) {
        emit({ type: "error", message: `planner submitted nothing for ${spec.label}`, recoverable: true });
        continue;
      }
      emit({ type: "plan_candidate", day: candidate });

      // Deterministic gate — the evaluator explains, the math decides.
      const result = evaluatePlan({
        trip,
        days: [...state.lockedDays, candidate],
        calendar: state.calendar,
        adherence,
      });
      state.evals.push(result);
      emit({ type: "eval_result", result, attempt });

      await runAgent(
        CREW.evaluator,
        {
          prompt: JSON.stringify({
            dayPlan: candidate,
            scorerVerdict: result,
          }),
          tools: {},
        },
        emit,
        state,
      );

      if (passes(result)) {
        day = candidate;
        state.lockedDays.push(day);
        emit({ type: "day_locked", day, sunProgress: sunProgress(trip, state.lockedDays) });
        logLine(`${spec.label} locked (${day.shiftMin}min, score ${result.score})`);
      } else {
        feedback = result.violations.map((v) => v.message).join(" ");
        logLine(`${spec.label} rejected (attempt ${attempt}): ${feedback}`);
      }
    }

    if (!day) {
      logLine(`${spec.label} unresolved after ${MAX_ATTEMPTS_PER_DAY} attempts`);
      emit({
        type: "error",
        message: `${spec.label} could not be planned within physiological limits — flagged for human review`,
        recoverable: true,
      });
    }
  }

  // 4. Negotiator — make the calendar yield.
  const lockedJson = state.lockedDays.map((d) => ({
    dayIndex: d.dayIndex,
    label: d.label,
    shiftMin: d.shiftMin,
    interventions: d.interventions.map((iv) => ({
      kind: iv.kind,
      startMin: iv.startMin,
      endMin: iv.endMin,
    })),
  }));

  await runAgent(
    CREW.negotiator,
    {
      prompt: JSON.stringify({
        task: "Move movable events so nothing collides with the locked plan, then commitPlan.",
        lockedPlan: lockedJson,
        calendar: state.calendar.map((e) => ({
          id: e.id,
          title: e.title,
          dayIndex: e.dayIndex,
          startMin: e.startMin,
          endMin: e.endMin,
          movable: e.movable,
          movedTo: e.movedTo,
        })),
      }),
      tools: {
        proposeMove: {
          description: "Move one movable event. Returns ok or a reason it was refused.",
          inputSchema: z.object({
            eventId: z.string(),
            toDayIndex: z.number(),
            toStartMin: z.number(),
            reason: z.string(),
          }),
          execute: async ({ eventId, toDayIndex, toStartMin, reason }: { eventId: string; toDayIndex: number; toStartMin: number; reason: string }) => {
            const r = proposeMove(state.calendar, eventId, toDayIndex, toStartMin);
            if (!r.ok) return { error: r.reason };
            if (calendarSource === "google") {
              const ev = state.calendar.find((e) => e.id === eventId)!;
              try {
                await patchGoogleEvent(ev, r.move, trip);
              } catch (err) {
                delete ev.movedTo; // real calendar kept the old time — roll back
                return { error: `calendar write failed: ${err instanceof Error ? err.message : String(err)}` };
              }
            }
            r.move.reason = reason;
            return r.move;
          },
        },
        commitPlan: bare("Commit the rescheduled calendar", async () => {
          state.ics = buildIcs(state.calendar, trip);
          let written = 0;
          if (calendarSource === "google") {
            written = await createPlanEvents(state.lockedDays, trip);
          }
          return { committed: state.calendar.filter((e) => e.movedTo).length, googleBlocksWritten: written };
        }),
      },
    },
    emit,
    state,
  );

  if (!state.ics) state.ics = buildIcs(state.calendar, trip);

  // 5. Briefing — the morning handoff.
  const scores = state.evals.filter((e) => e.feasible).map((e) => e.score);
  const meanScore = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : 0;

  const shifted = state.lockedDays.reduce((a, d) => a + Math.abs(d.shiftMin), 0);
  const summary = `Night shift complete. ${state.lockedDays.length} days locked, ${shifted} minutes of the ${Math.abs(trip.requiredShiftMin)}-minute shift covered before you land — the crew keeps working after touchdown. ${state.citations.length} papers cited. Calendar: ${state.calendar.filter((e) => e.movedTo).length} events rescheduled.`;

  emit({
    type: "briefing",
    summary,
    ics: state.ics,
    score: meanScore,
    citations: state.citations,
    days: state.lockedDays,
  });
  logLine(`briefing issued — score ${meanScore}`);

  await recordRun({
    at: Date.now(),
    tripLabel: `${trip.origin.code}→${trip.destination.code}`,
    lockedDays: state.lockedDays.length,
    meanScore,
  });
  await persistArtifacts(state, trip, calendarSource);
  emit({ type: "done" });
}

// --- agent plumbing ----------------------------------------------------------

function bare(description: string, execute: () => unknown): ToolDef {
  return { description, inputSchema: z.object({}), execute: async () => execute() };
}

interface AgentRunResult {
  text: string;
  toolCalls: { name: string; input: unknown; output: unknown }[];
}

async function runAgent(
  member: CrewMember,
  opts: { prompt: string; tools: Record<string, ToolDef> },
  emit: Emit,
  state: RunState,
  role: "orchestrator" | "specialist" = "specialist",
): Promise<AgentRunResult> {
  emit({
    type: "agent_start",
    agent: member.id,
    title: `${member.name} · ${member.callsign}`,
  });

  const toolCalls: AgentRunResult["toolCalls"] = [];
  const wrappedTools: ToolSet = Object.fromEntries(
    Object.entries(opts.tools).map(([name, def]) => [
      name,
      tool({
        description: def.description,
        inputSchema: def.inputSchema,
        execute: async (input: unknown, options: unknown) => {
          emit({ type: "tool_call", agent: member.id, tool: name, detail: summarizeInput(input) });
          const output = await def.execute(input, options);
          emit({
            type: "tool_result",
            agent: member.id,
            tool: name,
            detail: summarizeOutput(output),
          });
          toolCalls.push({ name, input, output });
          // Surface citations + moves as first-class events.
          if (name === "searchScience" && Array.isArray(output)) {
            for (const c of output as Citation[]) {
              state.citations.push(c);
              emit({ type: "citation", agent: member.id, citation: c });
            }
          }
          if (name === "proposeMove" && output && typeof output === "object" && "to" in (output as object)) {
            emit({ type: "calendar_move", move: output as CalendarMove });
          }
          return output;
        },
      }),
    ]),
  );

  const result = streamText({
    model: resolveModel(role),
    system: member.system,
    prompt: opts.prompt,
    tools: wrappedTools,
    stopWhen: stepCountIs(8),
    temperature: 0.6,
  });

  let text = "";
  for await (const part of result.fullStream) {
    const p = part as { type: string; text?: string };
    if (p.type === "text-delta" && p.text) {
      text += p.text;
      emit({ type: "agent_token", agent: member.id, text: p.text });
    }
  }

  emit({ type: "agent_end", agent: member.id });
  return { text: text.trim(), toolCalls };
}

function summarizeInput(input: unknown): string {
  if (input && typeof input === "object") {
    const i = input as Record<string, unknown>;
    if (typeof i.query === "string") return `"${i.query}"`;
    if (typeof i.eventId === "string") return `${i.eventId} → day ${i.toDayIndex} ${fmtMin(Number(i.toStartMin))}`;
    if (typeof i.shiftMin === "number") return `shift ${i.shiftMin}min, ${(i.interventions as unknown[])?.length ?? 0} interventions`;
  }
  return "";
}

function summarizeOutput(output: unknown): string {
  if (Array.isArray(output)) return `${output.length} results`;
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    if (typeof o.error === "string") return `refused: ${o.error}`;
    if (typeof o.committed === "number") return `${o.committed} events committed`;
    if (typeof o.title === "string") return `${o.title}`;
  }
  return "ok";
}

async function persistArtifacts(state: RunState, trip: Trip, calendarSource: string) {
  await mkdir(ARTIFACTS_DIR, { recursive: true });
  await writeFile(
    path.join(ARTIFACTS_DIR, "shift-plan.json"),
    JSON.stringify({ trip, days: state.lockedDays, provider: providerKind(), calendarBackend: calendarSource }, null, 2),
  );
  await writeFile(
    path.join(ARTIFACTS_DIR, "shift-log.json"),
    JSON.stringify(state.log, null, 2),
  );
  if (state.ics) {
    await writeFile(path.join(ARTIFACTS_DIR, "calendar-plan.ics"), state.ics);
  }
}
