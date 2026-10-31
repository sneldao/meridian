"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { fmtMin } from "@/domain/circadian";
import { INTERVENTION_ICONS } from "@/lib/intervention-icons";
import type { DayPlan, DaySpec } from "@/domain/types";

interface Props {
  days: DaySpec[];
  locked: Map<string, DayPlan>;
  activeLabel?: string;
  rejectedLabels: Set<string>;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const PIN_CARD_W = 180;
const PIN_CARD_H = 88;
const PIN_GAP = 16;

/** The width the row needs to be whole. Shared by the morph's own stage and the
 *  viewport gate, so the two can't disagree about what "fits" means. */
export const pinRowWidth = (count: number) =>
  count * PIN_CARD_W + Math.max(0, count - 1) * PIN_GAP;

/** Resolved through useSyncExternalStore so the first paint and the hydration
 *  pass agree (server snapshot: the query does not match). */
function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** One locked day, as the traveller reads it. Shared by the pinned morph and
 *  the narrow-viewport column, so the two never drift apart. */
function DayCardBody({ label, plan }: { label: string; plan: DayPlan }) {
  return (
    <>
      <div className="text-xs font-bold text-pass">{label}</div>
      <div className="mt-1 font-mono2 text-xs text-paper">
        <div>bed {fmtMin(plan.targetBedtimeMin)}</div>
        <div>wake {fmtMin(plan.targetWakeMin)}</div>
      </div>
    </>
  );
}

function PinnedDayCard({
  label,
  plan,
  progress,
  index,
  count,
}: {
  label: string;
  plan: DayPlan;
  progress: MotionValue<number>;
  index: number;
  count: number;
}) {
  const rowW = pinRowWidth(count);
  const colH = count * PIN_CARD_H + (count - 1) * PIN_GAP;
  const colX = (rowW - PIN_CARD_W) / 2;
  const rowY = (colH - PIN_CARD_H) / 2;
  // Stacked column slot -> row slot.
  const x = useTransform(progress, [0, 1], [colX, index * (PIN_CARD_W + PIN_GAP)]);
  const y = useTransform(progress, [0, 1], [index * (PIN_CARD_H + PIN_GAP), rowY]);
  // Cards arrive in sequence rather than all at once.
  const start = index * 0.12;
  const opacity = useTransform(progress, [start, Math.min(start + 0.3, 1)], [0.35, 1]);
  return (
    <motion.div
      style={{ position: "absolute", left: 0, top: 0, x, y, opacity, width: PIN_CARD_W, height: PIN_CARD_H }}
      className="rounded-lg border border-pass/20 bg-ink-3 px-3 py-2"
    >
      <DayCardBody label={label} plan={plan} />
    </motion.div>
  );
}

/** Locked days as one row that morphs from a stacked column as the page scrolls
 *  through a pinned section. Reduced motion shows the row with no scroll link;
 *  a viewport too narrow to hold the whole row gets the stacked column instead. */
export function PinnedDayRow({ days, locked }: { days: DaySpec[]; locked: Map<string, DayPlan> }) {
  const rows = days.flatMap((d) => {
    const plan = locked.get(d.label);
    return plan ? [{ label: d.label, plan }] : [];
  });
  const count = rows.length;
  // The row is whole only when every card fits side by side. Below that the
  // alternative is clipped cards or unreadably scaled ones, so the morph waits
  // and the 250vh of scroll it spends is not taken from the page.
  const rowW = pinRowWidth(count);
  const tooNarrow = useMediaQuery(`(max-width: ${Math.max(0, rowW - 1)}px)`);
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const linear = useTransform(scrollYProgress, [0.1, 0.8], [0, 1]);
  const eased = useTransform(linear, easeInOutCubic);
  const settled = useMotionValue(1);
  if (count === 0) return null;

  if (tooNarrow) {
    return (
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.label} className="rounded-lg border border-pass/20 bg-ink-3 px-3 py-2">
            <DayCardBody label={r.label} plan={r.plan} />
          </div>
        ))}
      </div>
    );
  }

  const colH = count * PIN_CARD_H + (count - 1) * PIN_GAP;
  // Reduced motion: the final row, with the scroll link removed.
  const progress = reduced ? settled : eased;

  return (
    <div ref={ref} style={{ height: "250vh" }}>
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
        <div style={{ position: "relative", width: rowW, height: colH }}>
          {rows.map((r, i) => (
            <PinnedDayCard key={r.label} label={r.label} plan={r.plan} progress={progress} index={i} count={count} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function DayStrip({ days, locked, activeLabel, rejectedLabels }: Props) {
  // `layout` projects through WAAPI, which the global flatten rule in
  // globals.css cannot reach — gate it here. Position-only, because a stretched
  // grid cell's size is set by the row: scaling the box only distorts its text.
  const reduce = useReducedMotion();
  return (
    <div className="grid grid-cols-5 gap-2">
      {days.map((d) => {
        const plan = locked.get(d.label);
        const active = d.label === activeLabel;
        const rejected = rejectedLabels.has(d.label);
        return (
          <motion.div
            key={d.dayIndex}
            layout={reduce ? false : "position"}
            className={`rounded-lg border px-3 py-2 transition-colors ${
              plan
                ? "border-pass/20 bg-ink-3"
                : active
                  ? "border-progress/33 bg-ink-3"
                  : rejected
                    ? "border-fail/33 bg-ink-3"
                    : "border-line bg-ink-2"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <span className={`text-xs font-bold ${plan ? "text-pass" : active ? "text-progress" : "text-mist"}`}>
                {d.label}
              </span>
              {plan && (
                <span className="font-mono2 text-xs text-mist">{plan.shiftMin}m</span>
              )}
            </div>
            {plan ? (
              <div className="mt-1 font-mono2 text-xs text-paper">
                <div>bed {fmtMin(plan.targetBedtimeMin)}</div>
                <div>wake {fmtMin(plan.targetWakeMin)}</div>
                <div className="mt-1 flex gap-1">
                  {plan.interventions.map((iv, j) => {
                    const { icon: Icon, tint } = INTERVENTION_ICONS[iv.kind];
                    return <Icon key={j} size={11} color={tint} strokeWidth={2.2} />;
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-1 font-mono2 text-xs text-dim">
                {active ? "planning…" : rejected ? "replanning…" : "queued"}
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
