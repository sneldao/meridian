"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CREW } from "@/agents/crew";
import { fmtMin, passes } from "@/domain/circadian";
import type { AgentId, DayPlan, DaySpec, EvalResult } from "@/domain/types";
import { INTERVENTION_ICONS } from "@/lib/intervention-icons";
import { springLock } from "@/lib/motion";

// The hero lens. Reads the run state the event stream builds (see the
// hackathon plan, section 6) and draws each day as a row on a 24-hour clock.
// Drafts are see-through, Iris's scan sweeps across a verdict in progress,
// a FAIL bounces back with its rule code, a PASS snaps solid, and the
// staircase on the right is the cumulative shift that has locked so far.

export interface ShiftDraft {
  plan: DayPlan;
  attempt: number;
}

export interface ShiftBoardProps {
  days: DaySpec[];
  /** Latest candidate per day label. */
  drafts: Map<string, ShiftDraft>;
  /** Every verdict per day label, in attempt order. */
  verdicts: Map<string, EvalResult[]>;
  /** Plans that passed the gate, per day label. */
  locked: Map<string, DayPlan>;
  /** Day currently being planned or judged. */
  activeLabel?: string;
  /** Agent currently speaking or working. */
  activeAgent?: AgentId;
  /** Static artifact mode (used by /review): the run is finished, so the
   * legend drops the draft / scan keys and the board reads as a swimlane. */
  readOnly?: boolean;
  /** Plain row name in readOnly mode (e.g. "Thu 22 Oct" instead of "D-2"). */
  rowLabel?: (spec: DaySpec) => string;
}

type RowState = "queued" | "draft" | "scanning" | "rejected" | "locked";

const MIN_PER_DAY = 1440;
const HOURS = [0, 6, 12, 18, 24];

const pct = (min: number) => ((((min % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY) / MIN_PER_DAY) * 100;

/** Sleep bar as one or two segments (two when it wraps past midnight). */
function sleepSegments(plan: DayPlan): { left: number; width: number }[] {
  const start = pct(plan.targetBedtimeMin);
  const end = pct(plan.targetWakeMin);
  if (end > start) return [{ left: start, width: end - start }];
  return [
    { left: start, width: 100 - start },
    { left: 0, width: end },
  ];
}

function rowState(
  label: string,
  activeLabel: string | undefined,
  drafts: Map<string, ShiftDraft>,
  verdicts: Map<string, EvalResult[]>,
  locked: Map<string, DayPlan>,
): RowState {
  if (locked.has(label)) return "locked";
  const draft = drafts.get(label);
  if (!draft) return "queued";
  // A draft with no verdict yet — on its first attempt or a retry — is under
  // the scanner, not still wearing the previous rejection.
  if ((verdicts.get(label)?.length ?? 0) < draft.attempt) {
    return label === activeLabel ? "scanning" : "draft";
  }
  const last = verdicts.get(label)?.at(-1);
  return last && !passes(last) ? "rejected" : "draft";
}

const STATE_TEXT: Record<RowState, string> = {
  queued: "queued",
  draft: "draft",
  scanning: "iris scanning",
  rejected: "rejected",
  locked: "locked",
};

const STATE_COLOR: Record<RowState, string> = {
  queued: "var(--color-dim)",
  draft: "var(--color-mist)",
  scanning: "var(--color-progress)",
  rejected: "var(--color-fail)",
  locked: "var(--color-pass)",
};

export function ShiftBoard({ days, drafts, verdicts, locked, activeLabel, activeAgent, readOnly, rowLabel }: ShiftBoardProps) {
  const reduce = useReducedMotion();
  // Morning dissolve: a replan drops a day's plan and the row snaps to queued
  // instantly. Keep the vanished plan for a beat and let it fade out, so the
  // "work unhappening" reads as a dissolve instead of a jump cut.
  const [dissolving, setDissolving] = useState<ReadonlyMap<string, DayPlan>>(new Map());
  const prevShown = useRef(new Map<string, DayPlan>());
  useEffect(() => {
    const next = new Map<string, DayPlan>();
    const vanished: [string, DayPlan][] = [];
    for (const d of days) {
      const plan = locked.get(d.label) ?? drafts.get(d.label)?.plan;
      if (plan) next.set(d.label, plan);
      else {
        const prev = prevShown.current.get(d.label);
        if (prev) vanished.push([d.label, prev]);
      }
    }
    prevShown.current = next;
    if (!vanished.length) return;
    // Deferred a frame: the fade starts on the next paint, and the setState
    // stays out of the effect body.
    const raf = requestAnimationFrame(() =>
      setDissolving((m) => new Map([...m, ...vanished])),
    );
    return () => cancelAnimationFrame(raf);
  }, [days, drafts, locked]);

  // Staircase: running total of locked shift, row by row.
  let running = 0;
  const cumulative = new Map<string, number>();
  for (const d of days) {
    const plan = locked.get(d.label);
    if (plan) running += plan.shiftMin;
    cumulative.set(d.label, running);
  }

  const agent = activeAgent ? CREW[activeAgent] : undefined;

  return (
    <div className="flex h-full w-full flex-col gap-3 p-4 font-mono2 text-xs text-paper">
      <div className="flex items-center justify-between">
        <span className="text-xs text-mist">
          shift board · body clock, destination time
        </span>
        {agent && (
          <span className="flex items-center gap-2 text-xs" style={{ color: agent.color }}>
            <motion.span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: agent.color }}
              animate={reduce ? { opacity: 1 } : { opacity: [1, 0.25, 1] }}
              transition={reduce ? { duration: 0 } : { repeat: Infinity, duration: 1.1 }}
            />
            {agent.name} · {agent.callsign}
          </span>
        )}
      </div>

      {/* hour axis */}
      <div className="grid grid-cols-[96px_1fr_84px] gap-3">
        <span />
        <div className="relative h-4">
          {HOURS.map((h) => (
            <span
              key={h}
              className="absolute -translate-x-1/2 text-xs text-mist"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {String(h % 24).padStart(2, "0")}
            </span>
          ))}
        </div>
        <span className="text-right text-xs text-dim">{readOnly ? "Adjusted" : "staircase"}</span>
      </div>

      {days.map((d) => {
        const state = rowState(d.label, activeLabel, drafts, verdicts, locked);
        const draft = drafts.get(d.label);
        const plan = locked.get(d.label) ?? draft?.plan;
        const last = verdicts.get(d.label)?.at(-1);
        const attempt = draft?.attempt ?? 0;
        const shown = plan !== undefined;
        const ghost = state === "draft" || state === "scanning" || state === "rejected";
        const fading = shown ? undefined : dissolving.get(d.label);

        return (
          <div key={d.dayIndex} className="grid grid-cols-[96px_1fr_84px] items-center gap-3">
            <div className="flex flex-col">
              <span className="text-xs font-bold" style={{ color: STATE_COLOR[state] }}>
                {readOnly && rowLabel ? rowLabel(d) : d.label}
              </span>
              {!readOnly && (
                <span className="text-xs" style={{ color: STATE_COLOR[state] }}>
                  {STATE_TEXT[state]}
                </span>
              )}
            </div>

            {/* the 24h row. Re-keyed on attempt so a new verdict re-triggers the bounce. */}
            <motion.div
              key={`${d.label}-${attempt}-${state}`}
              initial={state === "locked" && !reduce ? { scale: 0.96, opacity: 0.6 } : false}
              animate={
                state === "rejected"
                  ? reduce
                    ? { opacity: 1, scale: 1 }
                    : { x: [0, -10, 10, -6, 6, 0], opacity: 1, scale: 1 }
                  : state === "locked"
                    ? { scale: 1, opacity: 1 }
                    : { opacity: 1, scale: 1, x: 0 }
              }
              transition={
                reduce
                  ? { duration: 0 }
                  : state === "locked"
                    ? springLock
                    : { duration: 0.45 }
              }
              className={`relative h-10 overflow-hidden rounded-md border ${
                state === "locked"
                  ? "border-pass/40 bg-ink-3"
                  : state === "rejected"
                    ? "border-fail/47 bg-fail/8"
                    : state === "scanning"
                      ? "border-progress/33 bg-progress/8"
                      : state === "draft"
                        ? "border-dashed border-dim/50 bg-ink-2"
                        : "border-line bg-ink-2"
              }`}
              title={state === "rejected" && last?.violations[0] ? last.violations[0].message : undefined}
            >
              {/* hour grid */}
              {HOURS.slice(1, -1).map((h) => (
                <span
                  key={h}
                  className="absolute top-0 bottom-0 w-px bg-line"
                  style={{ left: `${(h / 24) * 100}%` }}
                />
              ))}

              {/* sleep bar */}
              {shown &&
                plan &&
                sleepSegments(plan).map((seg, i) => (
                  <motion.span
                    key={i}
                    className="absolute top-2 bottom-2 rounded-sm"
                    style={{
                      left: `${seg.left}%`,
                      width: `${seg.width}%`,
                      background:
                        state === "rejected"
                          ? "color-mix(in srgb, var(--color-fail) 33%, transparent)"
                          : state === "locked"
                            ? "color-mix(in srgb, var(--color-sleep) 67%, transparent)"
                            : "color-mix(in srgb, var(--color-sleep) 33%, transparent)",
                      borderStyle: ghost ? "dashed" : "solid",
                      borderColor: state === "rejected" ? "var(--color-fail)" : "var(--color-sleep)",
                      borderWidth: 1,
                    }}
                    initial={false}
                    animate={{ opacity: ghost ? 0.7 : 1 }}
                  />
                ))}

              {/* intervention markers */}
              {shown &&
                plan &&
                plan.interventions.map((iv, j) => (
                  <span
                    key={j}
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45"
                    style={{
                      left: `${pct(iv.startMin)}%`,
                      background: INTERVENTION_ICONS[iv.kind].tint,
                      boxShadow: `0 0 6px ${INTERVENTION_ICONS[iv.kind].tint}99`,
                    }}
                    title={`${iv.kind.replace(/_/g, " ")} ${fmtMin(iv.startMin)}`}
                  />
                ))}

              {/* the morning dissolve — a plan the replan just dropped fades
                  out on the now-queued row. Keyed on the plan so a second
                  dissolve replays the fade. */}
              {fading && (
                <motion.div
                  key={`dissolve-${fading.targetBedtimeMin}-${fading.targetWakeMin}`}
                  className="pointer-events-none absolute inset-0"
                  initial={{ opacity: 1 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  onAnimationComplete={() =>
                    setDissolving((m) => {
                      const n = new Map(m);
                      n.delete(d.label);
                      return n;
                    })
                  }
                >
                  {sleepSegments(fading).map((seg, i) => (
                    <span
                      key={i}
                      className="absolute top-2 bottom-2 rounded-sm"
                      style={{
                        left: `${seg.left}%`,
                        width: `${seg.width}%`,
                        background: "color-mix(in srgb, var(--color-sleep) 45%, transparent)",
                        border: "1px dashed var(--color-sleep)",
                      }}
                    />
                  ))}
                  {fading.interventions.map((iv, j) => (
                    <span
                      key={j}
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45"
                      style={{
                        left: `${pct(iv.startMin)}%`,
                        background: INTERVENTION_ICONS[iv.kind].tint,
                      }}
                    />
                  ))}
                </motion.div>
              )}

              {/* Iris's scan line */}
              {state === "scanning" && (
                <motion.span
                  className="absolute top-0 bottom-0 w-0.5 bg-progress shadow-[0_0_8px_var(--color-progress)]"
                  initial={{ left: "0%" }}
                  animate={reduce ? { left: "50%" } : { left: "100%" }}
                  transition={reduce ? { duration: 0 } : { repeat: Infinity, duration: 1.2, ease: "linear" }}
                />
              )}
            </motion.div>

            {/* staircase + rule code */}
            <div className="flex flex-col items-end">
              {readOnly ? (
                plan ? (
                  <span className="text-xs font-bold text-pass">
                    {Math.abs(plan.shiftMin)} min
                  </span>
                ) : null
              ) : state === "locked" ? (
                <>
                  <span className="text-xs font-bold text-pass">
                    {cumulative.get(d.label)}m
                  </span>
                  <span className="text-xs text-dim">{plan?.shiftMin}m today</span>
                </>
              ) : state === "rejected" && last?.violations[0] ? (
                <span
                  className="max-w-[84px] truncate text-right text-xs font-bold text-fail"
                  title={last.violations[0].message}
                >
                  {last.violations[0].code}
                </span>
              ) : (
                <span className="text-xs text-dim">
                  {plan ? `${plan.shiftMin}m` : ""}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-xs text-dim">
        <span>bar = sleep</span>
        <span>◆ = ask</span>
        {!readOnly && <span>dashed = draft</span>}
        {!readOnly && <span>solid = locked</span>}
      </div>
    </div>
  );
}
