import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stepCountIs, streamText, tool, type ToolSet } from "ai";
import { z } from "zod";
import { evaluatePlan, effectiveCalendar, fmtMin, coverageOf, passes, sunProgress, PROTECTED_KINDS } from "@/domain/circadian";
import { solveDay } from "@/domain/solver";
import { ScopeGuard, scrub } from "@/domain/scope";
import { ADHERENCE_PROFILE, DEMO_TRIP, GARMIN_BASELINE } from "@/domain/fixtures";
import { foldCheckIns } from "@/domain/adherence";
import { loadMemory, memoryBrief, recordRun } from "@/domain/memory";import type {
  AdherenceProfile,
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
import { handoffLines } from "./handoff";
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

    // The solver does the placement: a feasible skeleton the scorer has
    // already accepted, handed to Otto as the draft to refine. Otto owns the
    // intent — the shift to claim, the notes, the citations — but starts from
    // times that are known to fit rather than guessing them. null means no
    // template placement passed the gate: worth saying so plainly in the
    // prompt, since solver-infeasible is a strong hint, not a proof.
    const solved = solveDay({
      trip,
      spec,
      lockedDays: state.lockedDays,
      calendar: state.calendar,
      adherence,
      baseline: GARMIN_BASELINE,
    });
    logLine(
      solved
        ? `solver draft ${spec.label}: shift ${solved.plan.shiftMin}min, ${solved.plan.interventions.length} interventions, score ${solved.result.score}`
        : `solver found no template placement for ${spec.label} — planner proceeds unassisted`,
    );

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
              // The only ids the gate will accept. Without this the planner is
              // asked to attribute work to papers it was never shown.
              validCitationIds: state.citations.map((c) => c.id),
              shiftCoveredSoFarMin: coverageOf(trip, state.lockedDays).achievedMin,
              adherenceFloorMin: adherence.ignoresInterventionsBeforeMin,
              solverDraft: solved
                ? solved.plan
                : "no feasible template placement — draft from scratch",
              solverNote:
                "solverDraft is a feasible skeleton that already passed the scorer. Adopt its times; adjust shift, notes and citations to intent. The scorer re-checks whatever you submit.",
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
      // `citations` is passed so the gate can reject a citationId that is not in
      // the research set, rather than trusting the planner's attribution.
      const result = evaluatePlan({
        trip,
        days: [...state.lockedDays, candidate],
        calendar: state.calendar,
        adherence,
        citations: state.citations,
        baseline: GARMIN_BASELINE,
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
        logLine(
          `${spec.label} locked (${day.shiftMin}min, score ${result.score}, coverage ${Math.round(result.coverage.ratio * 100)}%)`,
        );
      } else {
        // Feed back the machine-readable codes plus the rejected draft itself.
        // Violations alone tell the planner what broke but not what it last
        // proposed, so a retry can re-emit the same plan and burn both attempts.
        feedback = JSON.stringify({
          rejectedPlan: candidate,
          violations: result.violations.map((v) => ({ code: v.code, message: v.message })),
        });
        logLine(`${spec.label} rejected (attempt ${attempt}): ${result.violations.map((v) => v.code).join(", ")}`);
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

  // 4. Negotiator — make the calendar yield. Snapshot first: the moves it
  // makes are the last thing this run writes, so they are the last thing that
  // can be wrong. verifyCommittedCalendar() below is the gate that refuses them.
  const preNegotiation = state.calendar.map((e) => ({ ...e }));
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

            // Preflight the move against the locked plan before it touches
            // anything. proposeMove knows about event-vs-event clashes; only the
            // scorer knows whether this slot lands on a light anchor or a sleep
            // window. Refuse here so the negotiator can try another slot rather
            // than have the whole move set rolled back afterwards.
            const clash = moveBreaksLockedPlan(r.move, state.lockedDays);
            if (clash) return { error: clash };

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

  // The gate does not stop at the plan. Rex's moves are re-checked against the
  // locked days with moves folded in — if the negotiator created a collision
  // the scorer would have rejected, the entire move set is reverted and the
  // wearer keeps their original calendar rather than a broken one.
  const verdict = verifyCommittedCalendar(state.calendar, state.lockedDays, trip, state.citations, adherence);
  if (verdict.length) {
    for (const e of state.calendar) delete e.movedTo;
    state.calendar = preNegotiation.map((e) => ({ ...e }));
    state.ics = "";
    logLine(`negotiator moves reverted — ${verdict.join("; ")}`);
    emit({
      type: "error",
      message: `Calendar rescheduling broke the locked plan (${verdict.join("; ")}) — reverted to your original calendar.`,
      recoverable: true,
    });
  } else if (state.calendar.some((e) => e.movedTo)) {
    logLine(`negotiator verified — ${state.calendar.filter((e) => e.movedTo).length} moves hold against the locked plan`);
  }

  if (!state.ics) state.ics = buildIcs(state.calendar, trip);

  // 5. Briefing — the morning handoff.
  const scores = state.evals.filter((e) => e.feasible).map((e) => e.score);
  const meanScore = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : 0;

  const coverage = coverageOf(trip, state.lockedDays);
  const moved = state.calendar.filter((e) => e.movedTo).length;
  // State the outcome the wearer actually gets. "Complete" is reserved for a
  // fully covered shift; otherwise say what is still owed and that the plan
  // continues past touchdown, rather than rounding a shortfall into a win.
  const shiftLine = coverage.complete
    ? `${coverage.achievedMin} of ${coverage.requiredMin} minutes shifted — fully adapted on landing.`
    : `${coverage.achievedMin} of ${coverage.requiredMin} minutes shifted (${Math.round(coverage.ratio * 100)}%) — ${Math.round(coverage.residualMin / 6) / 10}h still owed at touchdown, and the crew keeps working after you land.`;
  const summary = `Night shift complete. ${state.lockedDays.length} of ${trip.days.length} days locked. ${shiftLine} ${state.citations.length} papers cited. Calendar: ${moved} events rescheduled.`;

  emit({
    type: "briefing",
    summary,
    ics: state.ics,
    score: meanScore,
    citations: state.citations,
    days: state.lockedDays,
    coverage,
    lines: handoffLines({
      locked: state.lockedDays.length,
      total: trip.days.length,
      score: meanScore,
      coverage,
      summary,
    }),
  });
  logLine(`briefing issued — score ${meanScore}, coverage ${Math.round(coverage.ratio * 100)}%`);

  await recordRun({
    at: Date.now(),
    tripLabel: `${trip.origin.code}→${trip.destination.code}`,
    lockedDays: state.lockedDays.length,
    meanScore,
  });
  try {
    const { persistRun } = await import("@/tools/supabase");
    await persistRun({
      savedAt: new Date().toISOString(),
      trip: {
        origin: { code: trip.origin.code },
        destination: { code: trip.destination.code },
        requiredShiftMin: trip.requiredShiftMin,
        direction: trip.direction,
      },
      score: meanScore,
      summary: state.lockedDays.length ? `${state.lockedDays.length} days locked` : "shift complete",
      days: state.lockedDays.map((d) => ({ label: d.label, shiftMin: d.shiftMin })),
      provider: providerKind(),
    });
  } catch {
    // Optional Supabase persistence; file memory remains source of truth.
  }
  await persistArtifacts(state, trip, calendarSource);
  emit({ type: "done" });
}

// --- agent plumbing ----------------------------------------------------------

function bare(description: string, execute: () => unknown): ToolDef {
  return { description, inputSchema: z.object({}), execute: async () => execute() };
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) =>
  aStart < bEnd && bStart < aEnd;

function interventionSpan(iv: { startMin: number; endMin?: number }): [number, number] {
  let end = iv.endMin ?? iv.startMin + 30;
  if (end <= iv.startMin) end += 1440; // overnight window
  return [iv.startMin, end];
}
// NOTE both this helper and the scorer's calendar check match windows by
// dayIndex, so the post-midnight tail of a wrapping window is only ever
// compared against its own day's events. See the KNOWN LIMITATION test in
// tests/negotiator-verify.test.ts — fixing it properly means normalising every
// span to absolute multi-day minutes across the scorer, the negotiator and the
// calendar lens, which is a refactor of the working gate rather than a patch.

/** Why this move would break the locked plan, or null if it is safe. Rex moves
 *  an event; it must not park that event on top of a light anchor or a sleep
 *  window the scorer already accepted. */
function moveBreaksLockedPlan(move: CalendarMove, lockedDays: DayPlan[]): string | null {
  for (const day of lockedDays) {
    if (day.dayIndex !== move.to.dayIndex) continue;
    for (const iv of day.interventions) {
      if (!PROTECTED_KINDS.has(iv.kind)) continue;
      const [s, e] = interventionSpan(iv);
      if (overlaps(move.to.startMin, move.to.endMin, s, e)) {
        return `"${move.title}" would land on ${day.label}'s ${iv.kind.replace(/_/g, " ")} (${fmtMin(iv.startMin)})`;
      }
    }
  }
  return null;
}

/** Every event sitting on a protected intervention of a locked day.
 *
 *  Deliberately stricter than the scorer, which downgrades an overlap with a
 *  *movable* event to a note on the grounds that "the negotiator can clear it".
 *  That is the right call while the plan is still being negotiated and the wrong
 *  one afterwards: once Rex is done, the calendar has had its chance to yield,
 *  so anything still overlapping a light anchor or sleep window is a clash —
 *  movable or not. */
function scheduleClashes(calendar: CalendarEvent[], lockedDays: DayPlan[]): string[] {
  const out: string[] = [];
  for (const ev of calendar) {
    if (ev.blocksInterventions === false) continue;
    for (const day of lockedDays) {
      if (day.dayIndex !== ev.dayIndex) continue;
      for (const iv of day.interventions) {
        if (!PROTECTED_KINDS.has(iv.kind)) continue;
        const [s, e] = interventionSpan(iv);
        if (!overlaps(ev.startMin, ev.endMin, s, e)) continue;
        out.push(
          `"${ev.title}" ${day.label} ${fmtMin(ev.startMin)}–${fmtMin(ev.endMin)} overlaps ${iv.kind.replace(/_/g, " ")} at ${fmtMin(iv.startMin)}`,
        );
      }
    }
  }
  return out;
}

/** Re-check the calendar as the user will actually receive it: the scorer over
 *  the moved calendar, plus the stricter post-commit clash rule. Returns only
 *  what the negotiator's moves *introduced* — a clash that already existed in
 *  the plan is the planner's problem, not the negotiator's — so an empty result
 *  means the committed calendar is as sound as the plan it was built from. */
function verifyCommittedCalendar(
  calendar: CalendarEvent[],
  lockedDays: DayPlan[],
  trip: Trip,
  citations: Citation[],
  adherence: AdherenceProfile,
): string[] {
  if (!lockedDays.length) return [];
  const baseline = new Set([
    ...evaluatePlan({ trip, days: lockedDays, calendar, adherence, citations, baseline: GARMIN_BASELINE }).violations.map((v) => v.message),
    ...scheduleClashes(calendar, lockedDays),
  ]);
  const committed = [
    ...evaluatePlan({
      trip,
      days: lockedDays,
      calendar: effectiveCalendar(calendar),
      adherence,
      citations,
      baseline: GARMIN_BASELINE,
    }).violations.map((v) => v.message),
    ...scheduleClashes(effectiveCalendar(calendar), lockedDays),
  ];
  return committed.filter((m) => !baseline.has(m));
}

interface AgentRunResult {
  text: string;
  toolCalls: { name: string; input: unknown; output: unknown }[];
}

/** Exported for tests: the negotiator's move preflight and the post-commit
 *  verification are the only things standing between the crew's calendar and a
 *  broken .ics, and neither is reachable through runCrew without a live key. */
export const __internals = { moveBreaksLockedPlan, verifyCommittedCalendar };

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

  // The scorer gates submitted plan notes; this gates the prose that streams to
  // the user and feeds the next agent's prompt. Same rules, same module — see
  // domain/scope. Deltas arrive mid-word, so ScopeGuard holds a tail back and
  // redacts anything touching the cut.
  let text = "";
  const guard = new ScopeGuard();
  for await (const part of result.fullStream) {
    const p = part as { type: string; text?: string };
    if (p.type === "text-delta" && p.text) {
      text += p.text;
      const safe = guard.push(p.text);
      if (safe) emit({ type: "agent_token", agent: member.id, text: safe });
    }
  }
  const tail = guard.flush();
  if (tail) emit({ type: "agent_token", agent: member.id, text: tail });

  emit({ type: "agent_end", agent: member.id });
  // Scrub the authoritative full text too: the guard above optimises for what
  // is *shown*, but `text` is what the planner reads as constraints, so it must
  // be clean regardless of how the stream chunked.
  return { text: scrub(text).trim(), toolCalls };
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
