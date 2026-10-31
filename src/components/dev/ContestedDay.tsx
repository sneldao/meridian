"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { solveDay } from "@/domain/solver";
import { evaluatePlan, fmtMin, passes } from "@/domain/circadian";
import {
  describeDrift,
  draftDrift,
  mergeWithDraft,
  type PlanSubmission,
} from "@/domain/draft";
import {
  ADHERENCE_PROFILE,
  DEMO_TRIP,
  GARMIN_BASELINE,
  calendarFor,
} from "@/domain/fixtures";
import type { DayPlan, EvalResult, Intervention } from "@/domain/types";
import { INTERVENTION_ICONS } from "@/lib/intervention-icons";
import { springLock } from "@/lib/motion";

// The contested day — a dev workbench prototype for the "plan vs actual"
// surface. The solver and the gate run live (real solveDay / evaluatePlan);
// only the planner's move is scripted, so the drama is honest: the draft is
// the ghost, the submission slides in on top of it, and the gate stamps or
// bounces the result. What a real crew run would feed it rides the
// plan_candidate event's new solverDraft field.

const MIN_PER_DAY = 1440;
const HOURS = [0, 6, 12, 18, 24];
const pct = (min: number) =>
  ((((min % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY) / MIN_PER_DAY) * 100;

function sleepSegments(plan: DayPlan): { left: number; width: number }[] {
  const start = pct(plan.targetBedtimeMin);
  const end = pct(plan.targetWakeMin);
  if (end > start) return [{ left: start, width: end - start }];
  return [
    { left: start, width: 100 - start },
    { left: 0, width: end },
  ];
}

const firstOfKind = (plan: DayPlan | null, kind: string): Intervention | undefined =>
  plan?.interventions.find((iv) => iv.kind === kind);

// --- scripted planner moves -------------------------------------------------
// Each is a PlanSubmission: what Otto chose to change over the draft.

/** Move one cue by delta minutes; every other kind stays submitted-as-kept. */
function moveCue(draft: DayPlan, kind: string, delta: number, extra: Partial<PlanSubmission> = {}): PlanSubmission {
  return {
    ...extra,
    interventions: draft.interventions.map((iv) =>
      iv.kind === kind
        ? {
            kind: iv.kind,
            note: iv.note,
            startMin: (iv.startMin + delta + MIN_PER_DAY) % MIN_PER_DAY,
            ...(iv.endMin !== undefined
              ? { endMin: (iv.endMin + delta + MIN_PER_DAY) % MIN_PER_DAY }
              : {}),
          }
        : { kind: iv.kind, note: iv.note },
    ),
  };
}

const KEEP_ALL = (draft: DayPlan): PlanSubmission => ({
  interventions: draft.interventions.map((iv) => ({ kind: iv.kind, note: iv.note })),
});

interface ContestAttempt {
  /** What the scripted planner did, in one clause. */
  move: string;
  submission: PlanSubmission;
  candidate: DayPlan;
  verdict: EvalResult;
}

interface ContestBeat {
  label: string;
  draft: DayPlan | null;
  attempts: ContestAttempt[];
}

/** One day's argument, computed once: real solver, real gate, authored moves. */
function buildBeats(): ContestBeat[] {
  const trip = DEMO_TRIP;
  const calendar = calendarFor(trip);
  const adherence = ADHERENCE_PROFILE;
  const baseline = GARMIN_BASELINE;
  const locked: DayPlan[] = [];
  const judge = (candidate: DayPlan) =>
    evaluatePlan({ trip, days: [...locked, candidate], calendar, adherence, citations: [], baseline });
  const attempt = (draft: DayPlan, move: string, submission: PlanSubmission): ContestAttempt => {
    const candidate = mergeWithDraft(draft, submission);
    return { move, submission, candidate, verdict: judge(candidate) };
  };

  const beats: ContestBeat[] = [];
  for (const spec of trip.days.slice(0, 3)) {
    const solved = solveDay({ trip, spec, lockedDays: locked, calendar, adherence, baseline });
    if (!solved) continue;
    const draft = solved.plan;
    const bedtime = draft.targetBedtimeMin;
    const caffe = firstOfKind(draft, "caffeine_cutoff");

    const attempts: ContestAttempt[] =
      spec.dayIndex === 0
        ? [attempt(draft, "moved the cutoff 30min earlier", moveCue(draft, "caffeine_cutoff", -30))]
        : spec.dayIndex === 1
          ? [
              // Planner over-claims on a hold day: −90 declared, nothing moved.
              attempt(draft, "claimed −90 without moving a cue", { ...KEEP_ALL(draft), shiftMin: -90 }),
              attempt(draft, "kept the draft", KEEP_ALL(draft)),
            ]
          : caffe
            ? [
                attempt(
                  draft,
                  "let the cutoff slip to 5h before bed",
                  moveCue(draft, "caffeine_cutoff", (bedtime - 300 - caffe.startMin + MIN_PER_DAY) % MIN_PER_DAY),
                ),
                attempt(draft, "kept the draft", KEEP_ALL(draft)),
              ]
            : [attempt(draft, "kept the draft", KEEP_ALL(draft))];

    const winner = attempts.at(-1)!;
    if (passes(winner.verdict)) locked.push(winner.candidate);
    beats.push({ label: spec.label, draft, attempts });
  }
  return beats;
}

// --- the lane ---------------------------------------------------------------

type Phase = "queued" | "ghost" | "candidate" | "judged";

interface ContestStep {
  beat: number;
  phase: Phase;
  attempt: number;
}

/** Flat play script: ghost → each attempt submitted then judged. */
function scriptFor(beats: ContestBeat[]): ContestStep[] {
  const steps: ContestStep[] = [];
  beats.forEach((b, beat) => {
    steps.push({ beat, phase: "ghost", attempt: -1 });
    b.attempts.forEach((_, attempt) => {
      steps.push({ beat, phase: "candidate", attempt });
      steps.push({ beat, phase: "judged", attempt });
    });
  });
  return steps;
}

/** State a beat should render at a given script position. */
function beatState(steps: ContestStep[], pos: number, beat: number) {
  let phase: Phase = "queued";
  let attempt = -1;
  for (let i = 0; i <= pos && i < steps.length; i++) {
    if (steps[i].beat === beat) {
      phase = steps[i].phase;
      attempt = steps[i].attempt;
    }
  }
  return { phase, attempt };
}

function evline(beat: ContestBeat, attempt: ContestAttempt | null, phase: Phase): string {
  if (!beat.draft) return "solver found no placement";
  const placed = `solver placed ${beat.draft.interventions.length} cues`;
  if (phase === "ghost" || !attempt) return `${placed} · waiting on the planner`;
  const drift = describeDrift(draftDrift(beat.draft, attempt.candidate));
  const moved = `Otto ${attempt.move} (${drift === "kept the solver's draft" ? drift : `drift: ${drift}`})`;
  if (phase !== "judged") return `${placed} · ${moved} · gate reading`;
  const v = attempt.verdict;
  const verdict = v.feasible && v.score >= 0.7
    ? `gate PASS ${v.score.toFixed(2)}`
    : `gate FAIL · ${v.violations.map((x) => x.code).join(", ") || "below standard"}`;
  return `${placed} · ${moved} · ${verdict}`;
}

function BeatRow({ beat, phase, attemptIdx, reduce }: { beat: ContestBeat; phase: Phase; attemptIdx: number; reduce: boolean }) {
  const attempt = attemptIdx >= 0 ? beat.attempts[attemptIdx] : null;
  const candidate = attempt?.candidate ?? null;
  const draft = beat.draft;
  const judged = phase === "judged" && attempt;
  const failed = judged && !passes(attempt.verdict);
  const passed = judged && passes(attempt.verdict);

  const cuePairs = useMemo(() => {
    if (!draft || !candidate) return [];
    return candidate.interventions.map((iv) => {
      const before = firstOfKind(draft, iv.kind);
      return {
        kind: iv.kind,
        from: before?.startMin ?? null,
        to: iv.startMin,
        added: !before,
      };
    });
  }, [draft, candidate]);

  return (
    <div>
      <div className="grid grid-cols-[64px_1fr_150px] items-center gap-3">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-paper">{beat.label}</span>
          <span className="text-[10px] text-dim">
            {phase === "queued" ? "queued" : phase === "ghost" ? "solver placed" : phase === "candidate" ? "Otto submits" : failed ? "gate: fail" : "gate: pass"}
          </span>
        </div>

        <motion.div
          key={`${beat.label}-${attemptIdx}`}
          initial={false}
          animate={failed && !reduce ? { x: [0, -10, 10, -6, 6, 0] } : { x: 0 }}
          transition={failed ? { duration: 0.45 } : { duration: 0.2 }}
          className={`relative h-10 overflow-hidden rounded-md border ${
            passed
              ? "border-pass/40 bg-ink-3"
              : failed
                ? "border-fail/47 bg-fail/8"
                : phase === "ghost"
                  ? "border-dashed border-dim/50 bg-ink-2"
                  : "border-line bg-ink-2"
          }`}
        >
          {HOURS.slice(1, -1).map((h) => (
            <span key={h} className="absolute top-0 bottom-0 w-px bg-line" style={{ left: `${(h / 24) * 100}%` }} />
          ))}

          {/* solver ghost — dashed, never claimed as the plan */}
          {phase !== "queued" && draft && (
            <>
              {sleepSegments(draft).map((seg, i) => (
                <motion.span
                  key={`g${i}`}
                  className="absolute top-2 bottom-2 rounded-sm"
                  style={{
                    background: "color-mix(in srgb, var(--color-sleep) 22%, transparent)",
                    border: "1px dashed var(--color-sleep)",
                  }}
                  initial={{ opacity: 0, left: `${seg.left}%`, width: `${seg.width}%` }}
                  animate={{ opacity: 0.8, left: `${seg.left}%`, width: `${seg.width}%` }}
                  transition={{ duration: reduce ? 0 : 0.4 }}
                />
              ))}
              {draft.interventions.map((iv) => (
                <motion.span
                  key={`gd-${iv.kind}`}
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-dashed"
                  style={{ borderColor: INTERVENTION_ICONS[iv.kind].tint }}
                  title={`solver: ${iv.kind.replace(/_/g, " ")} ${fmtMin(iv.startMin)}`}
                  initial={{ opacity: 0, left: `${pct(iv.startMin)}%` }}
                  animate={{ opacity: candidate ? 0.45 : 0.9, left: `${pct(iv.startMin)}%` }}
                  transition={{ duration: reduce ? 0 : 0.4 }}
                />
              ))}
            </>
          )}

          {/* the submission — solid, slides from the ghost it replaced */}
          {candidate && phase !== "ghost" && phase !== "queued" && (
            <>
              {sleepSegments(candidate).map((seg, i) => {
                const ghostSeg = draft ? sleepSegments(draft)[Math.min(i, sleepSegments(draft).length - 1)] : seg;
                return (
                  <motion.span
                    key={`c${i}-${attemptIdx}`}
                    className="absolute top-2 bottom-2 rounded-sm"
                    style={{
                      background: failed
                        ? "color-mix(in srgb, var(--color-fail) 33%, transparent)"
                        : "color-mix(in srgb, var(--color-sleep) 67%, transparent)",
                      border: `1px solid ${failed ? "var(--color-fail)" : "var(--color-sleep)"}`,
                    }}
                    initial={{ left: `${ghostSeg.left}%`, width: `${ghostSeg.width}%`, opacity: 0.5 }}
                    animate={{ left: `${seg.left}%`, width: `${seg.width}%`, opacity: 1 }}
                    transition={passed ? springLock : { duration: reduce ? 0 : 0.5 }}
                  />
                );
              })}
              {cuePairs.map((c) => (
                <motion.span
                  key={`cd-${c.kind}-${attemptIdx}`}
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45"
                  style={{
                    background: INTERVENTION_ICONS[c.kind as keyof typeof INTERVENTION_ICONS]?.tint ?? "var(--color-mist)",
                    boxShadow: `0 0 6px ${INTERVENTION_ICONS[c.kind as keyof typeof INTERVENTION_ICONS]?.tint ?? "var(--color-mist)"}99`,
                  }}
                  title={`${c.kind.replace(/_/g, " ")} ${fmtMin(c.to)}${c.from !== null && c.from !== c.to ? ` (was ${fmtMin(c.from)})` : c.added ? " (added)" : ""}`}
                  initial={{ left: `${pct(c.from ?? c.to)}%`, opacity: 0 }}
                  animate={{ left: `${pct(c.to)}%`, opacity: 1 }}
                  transition={{ duration: reduce ? 0 : 0.5, delay: reduce ? 0 : 0.1 }}
                />
              ))}
            </>
          )}
        </motion.div>

        <div className="flex flex-col items-end">
          {passed && (
            <>
              <motion.span
                key={`stamp-pass-${beat.label}-${attemptIdx}`}
                initial={reduce ? false : { scale: 1.6, rotate: -8, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 16 }}
                className="inline-block text-xs font-bold text-pass"
              >
                PASS {attempt!.verdict.score.toFixed(2)}
              </motion.span>
              <span className="text-[10px] text-dim">locked · sun advances</span>
            </>
          )}
          {failed && (
            <>
              <motion.span
                key={`stamp-fail-${beat.label}-${attemptIdx}`}
                initial={reduce ? false : { scale: 1.6, rotate: 6, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 16 }}
                className="inline-block text-xs font-bold text-fail"
              >
                {attempt!.verdict.violations[0]?.code ?? "FAIL"}
              </motion.span>
              <span className="text-[10px] text-dim">attempt {attemptIdx + 1} rejected</span>
            </>
          )}
          {!judged && draft && <span className="text-[10px] text-dim">draft −{Math.abs(draft.shiftMin)}m</span>}
        </div>
      </div>

      <p className="evline mt-1 font-mono2 text-[11px] text-mist">
        {evline(beat, attempt, phase)}
        {failed && attempt!.verdict.violations[0] ? ` — ${attempt!.verdict.violations[0].message}` : ""}
      </p>
    </div>
  );
}

export function ContestBench() {
  const reduce = useReducedMotion();
  const beats = useMemo(() => buildBeats(), []);
  const steps = useMemo(() => scriptFor(beats), [beats]);
  const [pos, setPos] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const done = pos >= steps.length - 1;
  // Days the gate has locked so far: the trip's progress, counted as it plays.
  const lockedSoFar = steps
    .slice(0, pos + 1)
    .filter((s) => s.phase === "judged" && passes(beats[s.beat].attempts[s.attempt].verdict)).length;
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => {
      setPos((p) => {
        if (p >= steps.length - 1) {
          setPlaying(false);
          return p;
        }
        return p + 1;
      });
    }, 900);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [playing, steps.length]);

  return (
    <div className="flex h-full flex-col gap-4 p-4 font-mono2 text-xs text-paper">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-mist">
          the contested day · solver + gate live, the planner&apos;s move scripted
          <span className="ml-2 text-pass">{lockedSoFar}/{beats.length} days locked</span>
        </span>
        <div className="flex gap-2">
          <button
            className="rounded-md border border-line bg-ink-2 px-2.5 py-1 text-paper hover:border-mist"
            onClick={() => {
              if (done || pos >= 0) { setPos(-1); setPlaying(false); setTimeout(() => setPlaying(true), 50); }
              else setPlaying((p) => !p);
            }}
          >
            {playing ? "pause" : pos < 0 ? "play" : "replay"}
          </button>
          <button
            className="rounded-md border border-line bg-ink-2 px-2.5 py-1 text-paper hover:border-mist disabled:opacity-40"
            disabled={done}
            onClick={() => setPos((p) => Math.min(p + 1, steps.length - 1))}
          >
            step
          </button>
        </div>
      </div>

      {/* hour axis */}
      <div className="grid grid-cols-[64px_1fr_150px] gap-3">
        <span />
        <div className="relative h-4">
          {HOURS.map((h) => (
            <span key={h} className="absolute -translate-x-1/2 text-[10px] text-mist" style={{ left: `${(h / 24) * 100}%` }}>
              {String(h % 24).padStart(2, "0")}
            </span>
          ))}
        </div>
        <span className="text-right text-[10px] text-dim">gate</span>
      </div>

      {beats.map((b, i) => {
        const s = beatState(steps, pos, i);
        return <BeatRow key={b.label} beat={b} phase={s.phase} attemptIdx={s.attempt} reduce={!!reduce} />;
      })}

      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-dim">
        <span>dashed = solver&apos;s draft</span>
        <span>solid = the planner&apos;s submission</span>
        <span>a cue that slides is a cue the planner moved on purpose</span>
      </div>
    </div>
  );
}
