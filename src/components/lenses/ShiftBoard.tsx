"use client";

import { motion } from "framer-motion";
import { CREW } from "@/agents/crew";
import { fmtMin, passes } from "@/domain/circadian";
import type { AgentId, DayPlan, DaySpec, EvalResult } from "@/domain/types";
import { INTERVENTION_ICONS } from "@/lib/intervention-icons";

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
  if (!drafts.has(label)) return "queued";
  const last = verdicts.get(label)?.at(-1);
  if (!last) return label === activeLabel ? "scanning" : "draft";
  return passes(last) ? "draft" : "rejected";
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

export function ShiftBoard({ days, drafts, verdicts, locked, activeLabel, activeAgent, readOnly }: ShiftBoardProps) {
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
    <div className="flex h-full w-full flex-col gap-3 p-4 font-mono2 text-[12px] text-paper">
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-mist">
          shift board · body clock, destination time
        </span>
        {agent && (
          <span className="flex items-center gap-2 text-[12px]" style={{ color: agent.color }}>
            <motion.span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: agent.color }}
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ repeat: Infinity, duration: 1.1 }}
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
              className="absolute -translate-x-1/2 text-[12px] text-mist"
              style={{ left: `${(h / 24) * 100}%` }}
            >
              {String(h % 24).padStart(2, "0")}
            </span>
          ))}
        </div>
        <span className="text-right text-[12px] text-dim">staircase</span>
      </div>

      {days.map((d) => {
        const state = rowState(d.label, activeLabel, drafts, verdicts, locked);
        const draft = drafts.get(d.label);
        const plan = locked.get(d.label) ?? draft?.plan;
        const last = verdicts.get(d.label)?.at(-1);
        const attempt = draft?.attempt ?? 0;
        const shown = plan !== undefined;
        const ghost = state === "draft" || state === "scanning" || state === "rejected";

        return (
          <div key={d.dayIndex} className="grid grid-cols-[96px_1fr_84px] items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[12px] font-bold" style={{ color: STATE_COLOR[state] }}>
                {d.label}
              </span>
              <span className="text-[12px]" style={{ color: STATE_COLOR[state] }}>
                {STATE_TEXT[state]}
              </span>
            </div>

            {/* the 24h row. Re-keyed on attempt so a new verdict re-triggers the bounce. */}
            <motion.div
              key={`${d.label}-${attempt}-${state}`}
              initial={state === "locked" ? { scale: 0.96, opacity: 0.6 } : false}
              animate={
                state === "rejected"
                  ? { x: [0, -10, 10, -6, 6, 0], opacity: 1, scale: 1 }
                  : state === "locked"
                    ? { scale: 1, opacity: 1 }
                    : { opacity: 1, scale: 1, x: 0 }
              }
              transition={state === "locked" ? { type: "spring", stiffness: 380, damping: 18 } : { duration: 0.45 }}
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

              {/* Iris's scan line */}
              {state === "scanning" && (
                <motion.span
                  className="absolute top-0 bottom-0 w-0.5 bg-progress shadow-[0_0_8px_var(--color-progress)]"
                  initial={{ left: "0%" }}
                  animate={{ left: "100%" }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: "linear" }}
                />
              )}
            </motion.div>

            {/* staircase + rule code */}
            <div className="flex flex-col items-end">
              {state === "locked" ? (
                <>
                  <span className="text-[12px] font-bold text-pass">
                    {cumulative.get(d.label)}m
                  </span>
                  <span className="text-[12px] text-dim">{plan?.shiftMin}m today</span>
                </>
              ) : state === "rejected" && last?.violations[0] ? (
                <span
                  className="max-w-[84px] truncate text-right text-[12px] font-bold text-fail"
                  title={last.violations[0].message}
                >
                  {last.violations[0].code}
                </span>
              ) : (
                <span className="text-[12px] text-dim">
                  {plan ? `${plan.shiftMin}m` : ""}
                </span>
              )}
            </div>
          </div>
        );
      })}

      <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-dim">
        <span>bar = sleep</span>
        <span>◆ = ask</span>
        {!readOnly && <span>dashed = draft</span>}
        {!readOnly && <span>solid = locked</span>}
      </div>
    </div>
  );
}
