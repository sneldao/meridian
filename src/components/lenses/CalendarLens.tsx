"use client";

import { motion, useReducedMotion } from "framer-motion";
import { fmtMin } from "@/domain/circadian";
import { springCalendar } from "@/lib/motion";
import type { MeetingReadiness } from "@/domain/readiness";
import type { CalendarEvent, DaySpec } from "@/domain/types";

// Your real week, before and after. Ghost blocks are where events were; solid
// blocks are where Rex put them. Movable blocks slide between the two slots;
// fixed commitments stay anchored. Destination meetings carry a readiness
// badge, and the page ends with the calendar file.
//
// Type: 12 px throughout (design-vision.md §8). A 30-minute event is only
// ~13 px tall on a 6:00–22:00 grid, so the in-block label carries the floor
// with leading-none and no vertical padding; the full text lives in the row's
// hover title and in the readiness row underneath.

const VIEW_START = 6 * 60;
const VIEW_END = 22 * 60;
const SPAN = VIEW_END - VIEW_START;

const top = (min: number) => `${((min - VIEW_START) / SPAN) * 100}%`;
const height = (start: number, end: number) => `${((end - start) / SPAN) * 100}%`;

export interface CalendarLensProps {
  days: DaySpec[];
  events: CalendarEvent[];
  readiness: MeetingReadiness[];
  /** Calendar file for the handoff. Omit to hide the download. */
  ics?: string;
}

export function CalendarLens({ days, events, readiness, ics }: CalendarLensProps) {
  const reduce = useReducedMotion();
  const col = 100 / Math.max(1, days.length);
  const badgeFor = new Map(readiness.map((r) => [r.eventId, r]));

  const download = () => {
    if (!ics) return;
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "meridian-plan.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full w-full flex-col gap-3 p-4 font-mono2 text-xs text-paper">
      <div className="flex items-center justify-between">
        <span className="text-xs text-mist">your week · before and after</span>
        {ics && (
          <button
            onClick={download}
            className="rounded-lg border border-paper/40 bg-paper/5 px-3 py-1 text-xs font-bold text-paper hover:bg-paper/10"
          >
            download .ics
          </button>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        {/* day headers — same left offset as the hour gutter below (ml-8) */}
        <div className="absolute top-0 right-0 left-8 flex h-5">
          {days.map((d) => (
            <span
              key={d.dayIndex}
              className="text-center text-xs font-bold text-mist"
              style={{ width: `${col}%` }}
            >
              {d.label}
            </span>
          ))}
        </div>

        <div className="absolute inset-x-0 top-5 bottom-0 ml-8">
          {/* hour gutter */}
          {[6, 9, 12, 15, 18, 21].map((h) => (
            <span
              key={h}
              className="absolute -left-7 -translate-y-1/2 text-xs text-dim"
              style={{ top: top(h * 60) }}
            >
              {String(h).padStart(2, "0")}
            </span>
          ))}

          {/* day columns */}
          {days.map((d) => (
            <div
              key={d.dayIndex}
              className="absolute top-0 bottom-0 border-l border-line"
              style={{ left: `${(d.dayIndex / days.length) * 100}%`, width: `${col}%` }}
            />
          ))}

          {events.map((e) => {
            const badge = badgeFor.get(e.id);
            const moved = e.movedTo;
            const origLeft = `${(e.dayIndex / days.length) * 100}%`;
            const newDay = moved?.dayIndex ?? e.dayIndex;
            const newLeft = `${(newDay / days.length) * 100}%`;
            const widthPct = `${col - 1}%`;
            const style = { width: widthPct, height: height(e.startMin, e.endMin) };
            const tone = e.movable ? "var(--color-sun-home)" : "var(--color-mist)";

            return (
              <div key={e.id}>
                {moved && (
                  <div
                    className="absolute rounded-md border border-dashed border-dim opacity-40"
                    style={{ ...style, left: origLeft, top: top(e.startMin) }}
                  />
                )}
                <motion.div
                  className="absolute overflow-hidden rounded-md border px-1.5 py-0 text-xs leading-none"
                  style={{
                    ...style,
                    borderColor: `color-mix(in srgb, ${tone} 53%, transparent)`,
                    background: `color-mix(in srgb, ${tone} 13%, transparent)`,
                  }}
                  title={`${e.title} ${fmtMin(e.startMin)}–${fmtMin(e.endMin)}${badge ? ` · ${badge.text}` : ""}`}
                  initial={false}
                  animate={{
                    left: moved ? newLeft : origLeft,
                    top: top(moved?.startMin ?? e.startMin),
                  }}
                  transition={reduce ? { duration: 0 } : springCalendar}
                >
                  <div className="font-bold" style={{ color: tone }}>
                    {e.title}
                  </div>
                  <div className="text-mist">
                    {fmtMin(moved?.startMin ?? e.startMin)}–{fmtMin(moved?.endMin ?? e.endMin)}
                  </div>
                  {badge && (
                    <div
                      className={`mt-0.5 inline-block rounded px-1 text-xs font-bold ${
                        badge.status === "risk"
                          ? "bg-fail/10 text-fail"
                          : "bg-pass/10 text-pass"
                      }`}
                      title={badge.text}
                    >
                      {badge.status === "risk" ? "AT RISK" : "READY"}
                    </div>
                  )}
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>

      {/* readiness — the ROI row: body-clock time before → after the plan */}
      {readiness.length > 0 && (
        <ul className="space-y-1 border-t border-line pt-2 text-xs">
          {readiness.map((r) => {
            const risk = r.status === "risk";
            const improved = r.bodyWithoutPlanMin !== r.bodyMin;
            return (
              <li key={r.eventId} className="flex items-center gap-2" title={r.text}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${risk ? "bg-fail" : "bg-pass"}`} />
                <span className="min-w-0 flex-1 truncate text-mist">
                  {r.title} <span className="text-dim">· body clock</span>
                </span>
                <span className={`shrink-0 font-mono2 font-bold ${risk ? "text-fail" : "text-pass"}`}>
                  {improved ? `${fmtMin(r.bodyWithoutPlanMin)} → ${fmtMin(r.bodyMin)}` : fmtMin(r.bodyMin)}
                </span>
                <span
                  className={`shrink-0 rounded px-1 text-xs font-bold ${
                    risk ? "bg-fail/10 text-fail" : "bg-pass/10 text-pass"
                  }`}
                >
                  {risk ? "AT RISK" : "READY"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
