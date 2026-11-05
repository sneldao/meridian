import { evaluatePlan, fmtMin, passes } from "@/domain/circadian";
import type { SolvedDay } from "@/domain/solver";
import { matchSampleProfileForTrip, splitSamplePlaces } from "@/lib/sample-taste";
import { cachedAnswerLabel } from "@/lib/taste-tier";
import type { TasteEntity, TasteItinerary } from "@/domain/taste";
import type {
  AdherenceProfile,
  AgentId,
  CalendarEvent,
  CalendarMove,
  Citation,
  CrewEvent,
  DayPlan,
  EvalResult,
  Trip,
  WearableBaseline,
} from "@/domain/types";

/* TaskRows for the AgentDrawer (docs/plan/agent-native.md step 5): the crew's
 * jobs as live status rows — "{status icon} {job label} {count/pill}" with
 * expandable detail underneath.
 *
 * Every count and step is quoted from state that already exists: the crew
 * event log while a shift runs (or after one finished), the solver's preview
 * numbers when none has. Nothing here invents progress — Running shows only
 * while the real stage is in flight, Failed only where a real path produced
 * an error, and Preview wherever the number came from the solver rather than
 * a crew shift. No fake latency, no demo failures.
 */

export type CrewJobStatus = "queued" | "running" | "completed" | "failed";

export interface CrewJobStep {
  text: string;
  tone?: "fail" | "note";
}

export interface CrewJob {
  id: "baseline" | "papers" | "plan" | "conflicts" | "calendar" | "places";
  /** Crew member owning the job; null for the scout — a tool, not a person. */
  agent: AgentId | null;
  owner: string;
  job: string;
  status: CrewJobStatus;
  /** Where the evidence came from — a crew shift or the solver's preview. */
  source: "run" | "preview";
  /** The result count inside the pill — real numbers only. */
  count?: string;
  steps: CrewJobStep[];
  /** A real retry exists for this failure (the crew can be run again). */
  canRetry: boolean;
}

/* Facts the app already computed outside a crew run — the same chain the
 * crew's account replays: previewPlan for the windows, evaluatePlan for the
 * conflict scan, matchSampleProfileForTrip for the crate, the restored plan
 * when a shift already locked one. */
export interface CrewJobFacts {
  baseline?: {
    chronotype: WearableBaseline["chronotype"];
    wakeMin: number;
    bedMin: number;
    sleepMin: number;
  } | null;
  /** Light + sleep scheduling over the best plan the surface has: the saved
   *  locked days when they exist, else the solver's preview days. `fromLocked`
   *  says which — a locked plan is real run output, not a preview. */
  light?: {
    windows: number;
    days: number;
    daysTotal: number;
    fromLocked: boolean;
  } | null;
  conflicts?: { flagged: number; daysChecked: number; fromLocked: boolean } | null;
  places?: { matched: number; provenance: string } | null;
  /** No crate packed — the scout honestly has nothing to match. */
  noCrate?: boolean;
}

export interface CrewJobFactsInput {
  trip: Trip;
  /** previewPlan output — the page already runs it for the stage. */
  solved?: Map<string, SolvedDay | null> | null;
  /** Locked days when a real shift (or its restore) produced them. */
  locked?: DayPlan[];
  calendar: CalendarEvent[];
  adherence: AdherenceProfile;
  baseline: WearableBaseline;
  favorites?: TasteEntity[];
  itinerary?: TasteItinerary | null;
}

export function buildCrewJobFacts(input: CrewJobFactsInput): CrewJobFacts {
  const facts: CrewJobFacts = {
    baseline: {
      chronotype: input.baseline.chronotype,
      wakeMin: input.baseline.avgWakeMin,
      bedMin: input.baseline.avgBedtimeMin,
      sleepMin: input.baseline.avgSleepMin,
    },
  };
  try {
    const solvedDays = [...(input.solved?.values() ?? [])]
      .filter((s): s is SolvedDay => !!s)
      .map((s) => s.plan);
    const locked = input.locked ?? [];
    // The saved plan outranks the preview: it is what a real shift verified.
    const days = locked.length ? locked : solvedDays;
    const fromLocked = locked.length > 0;
    const windows = days.reduce(
      (n, d) =>
        n +
        d.interventions.filter(
          (iv) => iv.kind === "light_exposure" || iv.kind === "sleep_window",
        ).length,
      0,
    );
    facts.light = {
      windows,
      days: days.length,
      daysTotal: input.trip.days.length,
      fromLocked,
    };
    const verdict = evaluatePlan({
      trip: input.trip,
      days,
      calendar: input.calendar,
      adherence: input.adherence,
      baseline: input.baseline,
    });
    facts.conflicts = {
      flagged: conflictFlags(verdict),
      daysChecked: days.length,
      fromLocked,
    };
  } catch {
    /* The solver/gate can disagree with a route — leave the facts absent
     * rather than guess a number. */
  }

  const it = input.itinerary;
  if (it) {
    facts.places = {
      matched: it.suggestions.length + (it.firstNight ? 1 : 0),
      provenance: placeProvenance(it),
    };
  } else {
    const favorites = input.favorites ?? [];
    if (!favorites.length) {
      facts.noCrate = true;
    } else {
      try {
        const matched = matchSampleProfileForTrip(input.trip.destination.name, favorites);
        if (matched) {
          const { daytime, evening } = splitSamplePlaces(matched.places);
          /* Same count the crew's account shows: distinct places the crate
           * actually matched — the evening list re-includes daytime venues. */
          facts.places = {
            matched: new Set([...daytime, ...evening].map((p) => p.id ?? p.name)).size,
            provenance: "recorded sample — not a live lookup",
          };
        } else {
          facts.places = { matched: 0, provenance: "places resolve with the crew" };
        }
      } catch {
        facts.places = { matched: 0, provenance: "places resolve with the crew" };
      }
    }
  }
  return facts;
}

export function placeProvenance(it: TasteItinerary): string {
  /* A live rung that failed on the way down gets named — the Scout row
   * says the recorded sample answered *because* live was unreachable. */
  const fell = it.liveUnavailable ? " · live lookup unavailable" : "";
  /* The device-cache rung names itself and its stamp — a saved live
   * answer, never the live lookup it came from. */
  if (it.tier === "cached") return cachedAnswerLabel(it.resolvedAt, it.liveUnavailable);
  if (it.sampleSource === "imagined") return `imagined sample${fell} — not a live lookup`;
  if (it.sampleSource === "recorded") return `recorded Qloo sample${fell} — not a live lookup`;
  return "Qloo place lookup";
}

/** The conflict count the crew's account reports: calendar conflicts the
 *  gate wrote violations for, plus movable-event overlaps it only notes. */
function conflictFlags(result: EvalResult): number {
  return (
    result.violations.length +
    result.notes.filter((n) => n.includes("overlaps movable")).length
  );
}

const windowsOf = (days: DayPlan[]) =>
  days.reduce(
    (n, d) =>
      n +
      d.interventions.filter(
        (iv) => iv.kind === "light_exposure" || iv.kind === "sleep_window",
      ).length,
    0,
  );

export interface CrewJobsArgs {
  phase: "idle" | "running" | "done";
  /** The run's event log — ledgerEvents(run), agent_token already folded out. */
  events: CrewEvent[];
  activeAgent?: AgentId;
  /** The agent holding the baton when the stream died — survives the reducer
   *  reset that clears `events` (the feed keeps its own log). */
  lastActiveAgent?: AgentId;
  /** A dead run's own words, from the page-level stream error. */
  runError?: string | null;
  /** Facts computed outside a run — see buildCrewJobFacts. */
  facts?: CrewJobFacts | null;
  /** A retry really exists: a trip is loaded and no run is in flight. */
  canRetry?: boolean;
}

export interface CrewJobsResult {
  jobs: CrewJob[];
  /** Errors the log could not attribute to a single job (uplink failures,
   *  pre-shift failures) — named plainly at the section head. */
  notes: string[];
}

export function deriveCrewJobs(args: CrewJobsArgs): CrewJobsResult {
  const evs = args.events;
  const running = args.phase === "running";
  const ran = evs.length > 0;
  const notes: string[] = [];

  // --- Walk the log once ----------------------------------------------------
  /* A for..of (not forEach): narrowing must see the run_start assignments —
   * writes inside a callback would be ignored by control-flow analysis and
   * pin these to null at every use site below. */
  let trip: Trip | null = null;
  let baseline: WearableBaseline | null = null;
  const firstStart = new Map<AgentId, number>();
  const ended = new Set<AgentId>();
  const toolSteps = new Map<AgentId, CrewJobStep[]>();
  const citations: Citation[] = [];
  const evals: { label: string; result: EvalResult }[] = [];
  const locked: DayPlan[] = [];
  const moves: CalendarMove[] = [];
  const attemptsByLabel = new Map<string, number>();
  let pendingLabel: string | undefined;
  let questionText: string | null = null;
  let answerText: string | null = null;
  let approvalFailed: string | null = null;
  let approvalRejected = false;
  let restored = false;
  let itinerary: TasteItinerary | undefined;
  let doneEvent = false;
  let tasteCallSeen = false;
  const errors: { i: number; message: string; recoverable: boolean }[] = [];

  for (const [i, e] of evs.entries()) {
    switch (e.type) {
      case "run_start":
        trip = e.trip;
        baseline = e.baseline;
        break;
      case "agent_start":
        if (!firstStart.has(e.agent)) firstStart.set(e.agent, i);
        break;
      case "agent_end":
        ended.add(e.agent);
        break;
      case "tool_call": {
        if (e.tool === "destinationTaste") tasteCallSeen = true;
        const arr = toolSteps.get(e.agent) ?? [];
        arr.push({ text: `→ ${e.tool}${e.detail ? ` ${e.detail}` : ""}` });
        toolSteps.set(e.agent, arr);
        break;
      }
      case "tool_result": {
        const arr = toolSteps.get(e.agent) ?? [];
        arr.push({ text: e.detail || `${e.tool} returned`, tone: "note" });
        toolSteps.set(e.agent, arr);
        break;
      }
      case "citation":
        citations.push(e.citation);
        break;
      case "plan_candidate":
        attemptsByLabel.set(e.day.label, (attemptsByLabel.get(e.day.label) ?? 0) + 1);
        pendingLabel = e.day.label;
        break;
      case "eval_result":
        evals.push({ label: pendingLabel ?? "the draft", result: e.result });
        break;
      case "day_locked":
        locked.push(e.day);
        break;
      case "calendar_move":
        moves.push(e.move);
        break;
      case "calendar_restore":
        restored = true;
        break;
      case "approval_result":
        if (e.status === "failed") approvalFailed = e.message;
        else if (e.status === "rejected") approvalRejected = true;
        break;
      case "crew_question":
        questionText = e.question.text;
        break;
      case "crew_answer":
        answerText = e.skipped
          ? "no answer — the crew decided"
          : `you answered: ${e.label}${e.effect ? ` — ${e.effect}` : ""}`;
        break;
      case "briefing":
        itinerary = e.tasteItinerary;
        break;
      case "done":
        doneEvent = true;
        break;
      case "error":
        errors.push({ i, message: e.message, recoverable: e.recoverable });
        break;
      default:
        break;
    }
  }

  const firstAnalyst = firstStart.get("analyst") ?? -1;
  const firstResearcher = firstStart.get("researcher") ?? -1;
  const firstPlanner = firstStart.get("planner") ?? -1;
  const firstEvaluator = firstStart.get("evaluator") ?? -1;
  const firstNegotiator = firstStart.get("negotiator") ?? -1;
  const briefingIdx = evs.findIndex((e) => e.type === "briefing");

  /* Errors attribute to the stage that was open when they landed:
   * analyst → researcher → the planner/evaluator loop → negotiator → run.
   * Anything outside those windows is a run-level note, not a job failure. */
  const errorSteps = new Map<CrewJob["id"], CrewJobStep[]>();
  const attrError = (i: number): CrewJob["id"] | "run" => {
    if (firstNegotiator >= 0 && i >= firstNegotiator && (briefingIdx < 0 || i < briefingIdx))
      return "calendar";
    if (firstPlanner >= 0 && i >= firstPlanner && (firstNegotiator < 0 || i < firstNegotiator))
      return "plan";
    if (firstResearcher >= 0 && i >= firstResearcher && (firstPlanner < 0 || i < firstPlanner))
      return "papers";
    if (firstAnalyst >= 0 && i >= firstAnalyst && (firstResearcher < 0 || i < firstResearcher))
      return "baseline";
    return "run";
  };
  for (const err of errors) {
    const scope = attrError(err.i);
    if (scope === "run") notes.push(err.message);
    else {
      const arr = errorSteps.get(scope) ?? [];
      arr.push({ text: err.message, tone: "fail" });
      errorSteps.set(scope, arr);
    }
  }

  // A run that died mid-stream: the reducer reset cleared the log, the
  // feed's own entries still know who held the baton last. Real failure,
  // real retry — never staged.
  const deadRun = !ran && !!args.runError && !running;

  /* Status law: Failed only on real evidence; Running only while the stage
   * is genuinely in flight; Completed when the stage ended or its output
   * exists; Queued otherwise. A finished run leaves a started-but-unclosed
   * turn counted as completed — the work it did is the evidence. */
  const resolve = (o: {
    active: boolean;
    finished: boolean;
    started: boolean;
    hasOutput: boolean;
    failed: boolean;
  }): CrewJobStatus =>
    o.failed
      ? "failed"
      : o.active
        ? "running"
        : o.finished || o.hasOutput || (o.started && !running)
          ? "completed"
          : "queued";

  const canRetry = args.canRetry === true;
  const jobs: CrewJob[] = [];
  const facts = args.facts;

  // --- 1 · Mara — reads the baseline ---------------------------------------
  {
    const started = firstAnalyst >= 0;
    const active = running && args.activeAgent === "analyst";
    const finished =
      ended.has("analyst") || firstResearcher >= 0 || firstPlanner >= 0 || briefingIdx >= 0 || doneEvent;
    const steps: CrewJobStep[] = [...(toolSteps.get("analyst") ?? [])];
    if (questionText) steps.push({ text: `asked — ${questionText}`, tone: "note" });
    if (answerText) steps.push({ text: answerText, tone: "note" });
    steps.push(...(errorSteps.get("baseline") ?? []));

    let status: CrewJobStatus;
    let source: CrewJob["source"] = "run";
    let count: string | undefined;
    if (ran) {
      status = resolve({ active, finished, started, hasOutput: steps.length > 0, failed: false });
      if (baseline) count = `${baseline.chronotype} · wake ${fmtMin(baseline.avgWakeMin)}`;
    } else if (facts?.baseline) {
      source = "preview";
      status = "completed";
      count = `${facts.baseline.chronotype} · wake ${fmtMin(facts.baseline.wakeMin)}`;
      steps.unshift({
        text: `baseline — ${facts.baseline.chronotype} chronotype · bed ${fmtMin(facts.baseline.bedMin)} · wake ${fmtMin(facts.baseline.wakeMin)}`,
      });
    } else {
      status = "queued";
    }
    if (deadRun && args.lastActiveAgent === "analyst") {
      status = "failed";
      steps.push({ text: args.runError!, tone: "fail" });
    }
    jobs.push({
      id: "baseline",
      agent: "analyst",
      owner: "Mara",
      job: "reads the baseline",
      status,
      source,
      count,
      steps,
      canRetry: status === "failed" && canRetry,
    });
  }

  // --- 2 · Jun — pulls the science ------------------------------------------
  {
    const started = firstResearcher >= 0;
    const active = running && args.activeAgent === "researcher";
    const finished = ended.has("researcher") || firstPlanner >= 0 || briefingIdx >= 0 || doneEvent;
    const steps: CrewJobStep[] = [...(toolSteps.get("researcher") ?? [])];
    for (const c of citations.slice(0, 6)) {
      steps.push({
        text: `kept — ${c.title}${c.year ? ` (${c.year})` : ""}${c.source === "verified-fallback" ? " · verified fallback" : ""}`,
        tone: "note",
      });
    }
    steps.push(...(errorSteps.get("papers") ?? []));

    let status: CrewJobStatus = "queued";
    const count = citations.length
      ? `${citations.length} ${citations.length === 1 ? "paper" : "papers"}`
      : undefined;
    if (ran) {
      status = resolve({
        active,
        finished,
        started,
        hasOutput: citations.length > 0,
        failed: false,
      });
    }
    if (deadRun && args.lastActiveAgent === "researcher") {
      status = "failed";
      steps.push({ text: args.runError!, tone: "fail" });
    }
    jobs.push({
      id: "papers",
      agent: "researcher",
      owner: "Jun",
      job: "pulls the science",
      status,
      source: "run",
      count,
      steps,
      canRetry: status === "failed" && canRetry,
    });
  }

  // --- 3 · Otto — builds the shift plan (light + sleep scheduling) ----------
  {
    const started = firstPlanner >= 0;
    // The planner+evaluator loop is one in-flight stage: Otto's job is
    // running whenever the loop is open, whichever of the pair holds the mic.
    const loopOpen =
      started && firstNegotiator < 0 && briefingIdx < 0 && !doneEvent;
    const active = running && loopOpen;
    const finished = firstNegotiator >= 0 || briefingIdx >= 0 || doneEvent;
    const planErrors = errorSteps.get("plan") ?? [];

    const steps: CrewJobStep[] = [...(toolSteps.get("planner") ?? [])];
    if (trip) {
      for (const spec of trip.days) {
        const lk = locked.find((d) => d.label === spec.label);
        const dayEvals = evals.filter((v) => v.label === spec.label);
        const att = attemptsByLabel.get(spec.label) ?? 0;
        if (lk) {
          steps.push({
            text: `${lk.label} locked — ${lk.shiftMin}min shift · ${lk.interventions.length} steps`,
          });
        } else if (dayEvals.length && !passes(dayEvals[dayEvals.length - 1].result)) {
          const worst = dayEvals[dayEvals.length - 1].result.violations[0]?.message;
          steps.push({
            text: `${spec.label} rejected${att > 1 ? ` after ${att} attempts` : ""}${worst ? ` — ${worst}` : ""}`,
            tone: "fail",
          });
        } else if (att > 0) {
          steps.push({ text: `${spec.label} — draft ${att} with the scorer`, tone: "note" });
        }
      }
    }
    steps.push(...planErrors);

    const totalDays = trip?.days.length ?? facts?.light?.daysTotal ?? 0;
    // Terminal failure: the loop finished and locked nothing despite attempts.
    const planFailed =
      (finished || (!running && ran)) &&
      locked.length === 0 &&
      attemptsByLabel.size > 0 &&
      planErrors.length > 0;

    let status: CrewJobStatus;
    let source: CrewJob["source"] = "run";
    let count: string | undefined;
    if (ran) {
      status = resolve({
        active,
        finished,
        started,
        hasOutput: locked.length > 0 || attemptsByLabel.size > 0,
        failed: planFailed,
      });
      count = finished
        ? `${windowsOf(locked)} windows scheduled`
        : `${locked.length} of ${totalDays} days locked`;
    } else if (facts?.light) {
      const l = facts.light;
      source = l.fromLocked ? "run" : "preview";
      status = "completed";
      count = `${l.windows} windows scheduled`;
      steps.push({
        text: `${l.windows} windows across ${l.days} ${l.days === 1 ? "day" : "days"}${l.fromLocked ? " — the saved plan" : ""}`,
      });
    } else {
      status = "queued";
    }
    if (deadRun && args.lastActiveAgent === "planner") {
      status = "failed";
      steps.push({ text: args.runError!, tone: "fail" });
    }
    jobs.push({
      id: "plan",
      agent: "planner",
      owner: "Otto",
      job: "builds the shift plan",
      status,
      source,
      count,
      steps,
      canRetry: status === "failed" && canRetry,
    });
  }

  // --- 4 · Iris — grades every plan (conflict watching) ---------------------
  {
    const started = firstEvaluator >= 0 || evals.length > 0;
    const active = running && args.activeAgent === "evaluator";
    const finished = firstNegotiator >= 0 || briefingIdx >= 0 || doneEvent;

    const steps: CrewJobStep[] = evals.map((v) => {
      const ok = passes(v.result);
      const worst = v.result.violations[0]?.message;
      return {
        text: `${v.label} — ${ok ? `PASS ${v.result.score.toFixed(2)}` : `FAIL${worst ? ` · ${worst}` : ""}`}`,
        tone: ok ? undefined : "fail",
      };
    });
    steps.push(...(errorSteps.get("conflicts") ?? []));

    const flagged = evals.reduce((n, v) => n + conflictFlags(v.result), 0);

    let status: CrewJobStatus;
    let source: CrewJob["source"] = "run";
    let count: string | undefined;
    if (ran) {
      status = resolve({
        active,
        finished,
        started,
        hasOutput: evals.length > 0,
        failed: false,
      });
      count = evals.length
        ? `${evals.length} checks · ${flagged ? `${flagged} flagged` : "clear"}`
        : undefined;
    } else if (facts?.conflicts) {
      const c = facts.conflicts;
      source = c.fromLocked ? "run" : "preview";
      status = "completed";
      count = c.flagged ? `${c.flagged} flagged` : "clear";
      steps.push({
        text: `${c.daysChecked} ${c.daysChecked === 1 ? "day" : "days"} scanned — ${c.flagged ? `${c.flagged} conflict${c.flagged === 1 ? "" : "s"} flagged` : "nothing flagged"}`,
      });
    } else {
      status = "queued";
    }
    if (deadRun && args.lastActiveAgent === "evaluator") {
      status = "failed";
      steps.push({ text: args.runError!, tone: "fail" });
    }
    jobs.push({
      id: "conflicts",
      agent: "evaluator",
      owner: "Iris",
      job: "watches for conflicts",
      status,
      source,
      count,
      steps,
      canRetry: status === "failed" && canRetry,
    });
  }

  // --- 5 · Rex — makes the calendar fit -------------------------------------
  {
    const started = firstNegotiator >= 0;
    const active = running && args.activeAgent === "negotiator";
    const finished = briefingIdx >= 0 || doneEvent || ended.has("negotiator");
    const calErrors = errorSteps.get("calendar") ?? [];

    const steps: CrewJobStep[] = [...(toolSteps.get("negotiator") ?? [])];
    for (const m of moves) {
      steps.push({
        text: `${m.title} — ${fmtMin(m.from.startMin)} → ${fmtMin(m.to.startMin)}${m.reason ? ` · ${m.reason}` : ""}`,
      });
    }
    if (approvalRejected) steps.push({ text: "calendar write declined — originals kept", tone: "note" });
    if (approvalFailed) steps.push({ text: approvalFailed, tone: "fail" });
    if (restored) steps.push({ text: "moves reverted — original calendar kept", tone: "fail" });
    steps.push(...calErrors);

    // The verify gate rolling the moves back, or the calendar write itself
    // failing, is the job's real failure — the plan stays, the calendar keeps
    // its original times.
    const calFailed = approvalFailed !== null || restored || calErrors.length > 0;

    let status: CrewJobStatus = "queued";
    let count: string | undefined;
    if (ran) {
      status = resolve({
        active,
        finished,
        started,
        hasOutput: moves.length > 0 || calFailed,
        failed: calFailed && (finished || !running),
      });
      if (status === "completed") {
        count = moves.length
          ? `${moves.length} ${moves.length === 1 ? "move" : "moves"}`
          : "fit as-is";
      }
    }
    if (deadRun && args.lastActiveAgent === "negotiator") {
      status = "failed";
      steps.push({ text: args.runError!, tone: "fail" });
    }
    jobs.push({
      id: "calendar",
      agent: "negotiator",
      owner: "Rex",
      job: "makes the calendar fit",
      status,
      source: "run",
      count,
      steps,
      canRetry: status === "failed" && canRetry,
    });
  }

  // --- 6 · Scout — matches places to the crate ------------------------------
  {
    const steps: CrewJobStep[] = [];
    let status: CrewJobStatus = "queued";
    let source: CrewJob["source"] = "run";
    let count: string | undefined;

    if (itinerary) {
      const it = itinerary;
      const matched = it.suggestions.length + (it.firstNight ? 1 : 0);
      for (const s of it.suggestions) {
        steps.push({
          text: `${s.place.name} — ${s.label} ${fmtMin(s.startMin)}–${fmtMin(s.endMin)}`,
        });
      }
      if (it.firstNight) steps.push({ text: `first night — ${it.firstNight.name}` });
      if (it.alternatives?.length)
        steps.push({ text: `${it.alternatives.length} alternates held`, tone: "note" });
      steps.push({ text: placeProvenance(it), tone: "note" });
      if (it.memory)
        steps.push({
          text: `memory — ${it.memory.kept} kept · ${it.memory.suppressed} suppressed`,
          tone: "note",
        });
      if (it.crewNote) steps.push({ text: it.crewNote, tone: "note" });
      if (it.status === "unavailable") {
        status = "failed";
        steps.unshift({ text: "the place lookup was unavailable", tone: "fail" });
      } else {
        status = "completed";
        count =
          it.status === "no-matches" || matched === 0
            ? "no places matched"
            : `${matched} ${matched === 1 ? "place" : "places"}`;
      }
    } else if (ran) {
      if (doneEvent || briefingIdx >= 0) {
        // The shift finished with no itinerary — the honest read is that
        // there was no crate to match.
        status = "completed";
        count = "no crate packed";
        steps.push({ text: "no crate packed — nothing to match", tone: "note" });
      } else if (tasteCallSeen) {
        // A destinationTaste call is genuinely in flight inside the planner's
        // turn — the lookup is real work, not a staged spinner.
        status = "running";
      }
    } else if (facts?.places) {
      source = placesSource(facts.places.provenance);
      status = "completed";
      count = facts.places.matched
        ? `${facts.places.matched} ${facts.places.matched === 1 ? "place" : "places"}`
        : "places resolve with the crew";
      steps.push({ text: facts.places.provenance, tone: "note" });
    } else if (facts?.noCrate) {
      steps.push({ text: "no crate packed — nothing to match", tone: "note" });
    }
    jobs.push({
      id: "places",
      agent: null,
      owner: "Scout",
      job: "matches places to your crate",
      status,
      source,
      count,
      steps,
      canRetry: status === "failed" && canRetry,
    });
  }

  return { jobs, notes };
}

/* A saved itinerary is real run output; a crate matched against the bundled
 * sample is preview evidence — the lookup has not run yet. */
function placesSource(provenance: string): CrewJob["source"] {
  return provenance === "Qloo place lookup" ? "run" : "preview";
}
