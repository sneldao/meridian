"use client";

import { useState } from "react";
import {
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  HeartPulse,
  MoonStar,
  Plane,
  Sparkles,
  Sun,
  Watch,
} from "lucide-react";
import { fmtMin } from "@/domain/circadian";
import type { CalendarEvent, Trip, WearableBaseline } from "@/domain/types";
import type { MeetingReadiness } from "@/domain/readiness";
import { RoutePicker } from "@/components/RoutePicker";
import { MorningCheckin } from "@/components/MorningCheckin";

interface TripPassportProps {
  trip: Trip | null;
  origin: string;
  dest: string;
  departureDate: string;
  onChangeRoute: (next: { origin: string; dest: string; date: string }) => void;
  baseline?: WearableBaseline;
  calendar: CalendarEvent[];
  calendarSource?: "google" | "fixture";
  readiness: MeetingReadiness[];
  hook: { body: string; dest: string } | null;
  phase: "idle" | "running" | "done";
  lockedCount: number;
  totalDays: number;
  sessionStartedAt?: number;
  onStart: () => void;
  onCancel: () => void;
  onCheckIn: (extra: { checkins: string; startDay: number }) => void;
}

const HUMAN_CHRONOTYPE: Record<WearableBaseline["chronotype"], string> = {
  early: "Early bird",
  neutral: "Intermediate rhythm",
  late: "Night owl",
};

export function TripPassport({
  trip,
  origin,
  dest,
  departureDate,
  onChangeRoute,
  baseline,
  calendar,
  calendarSource,
  readiness,
  hook,
  phase,
  lockedCount,
  totalDays,
  sessionStartedAt,
  onStart,
  onCancel,
  onCheckIn,
}: TripPassportProps) {
  const [expandedTool, setExpandedTool] = useState<"wearable" | "calendar" | null>(null);

  const shiftHours = trip ? Math.abs(trip.requiredShiftMin / 60) : 0;
  const shiftDir = trip?.direction === "east" ? "Eastward" : "Westward";
  const movableCount = calendar.filter((e) => e.movable).length;
  const readyCount = readiness.filter((r) => r.status === "ready").length;

  return (
    <aside aria-label="Trip and connected tools" className="flex flex-col gap-4">
      {/* Biological Boarding Pass Card */}
      <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-ink-3 via-ink-2 to-ink-2 p-5 shadow-xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-20 h-48 w-48 rounded-full bg-sun-dest/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-20 -left-20 h-48 w-48 rounded-full bg-sun-home/10 blur-3xl"
        />

        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sun-dest/25 bg-sun-dest/10 px-2.5 py-0.5 text-xs font-semibold text-sun-dest">
            <Plane size={12} />
            Circadian Flight Pass
          </span>
          {trip && (
            <span className="font-mono2 text-xs text-mist">
              {shiftHours}h {shiftDir} shift
            </span>
          )}
        </div>

        {/* Route summary */}
        {trip && (
          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl border border-line/80 bg-ink/60 p-3.5">
            <div>
              <div className="text-xs text-mist">{trip.origin.name}</div>
              <div className="font-mono2 text-2xl font-bold tracking-tight text-paper">
                {trip.origin.code}
              </div>
              {hook && (
                <div className="mt-1 inline-flex items-center gap-1 font-mono2 text-xs text-sun-home">
                  <Clock size={11} />
                  Body {hook.body}
                </div>
              )}
            </div>

            <div className="flex flex-col items-center gap-1 px-2">
              <div className="flex items-center gap-1 text-sun-dest">
                <span className="h-px w-6 bg-sun-dest/40" />
                <Plane size={14} className="text-sun-dest" />
                <span className="h-px w-6 bg-sun-dest/40" />
              </div>
              <span className="rounded-full bg-ink-3 px-2 py-0.5 font-mono2 text-2xs text-mist">
                {trip.direction === "east" ? `+${shiftHours}h` : `-${shiftHours}h`}
              </span>
            </div>

            <div className="text-right">
              <div className="text-xs text-mist">{trip.destination.name}</div>
              <div className="font-mono2 text-2xl font-bold tracking-tight text-paper">
                {trip.destination.code}
              </div>
              {hook && (
                <div className="mt-1 inline-flex items-center justify-end gap-1 font-mono2 text-xs text-sun-dest">
                  <Sun size={11} />
                  Local {hook.dest}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Emotional hook */}
        <div className="mt-4">
          {hook ? (
            <p className="font-voice text-lg leading-snug text-paper">
              It&apos;s <span className="text-sun-home">{hook.body}</span> in your body,{" "}
              <span className="text-sun-dest">{hook.dest}</span> in{" "}
              {trip?.destination.name ?? "your destination"}.
            </p>
          ) : (
            <p className="font-voice text-lg leading-snug text-paper">
              Align your sleep, light, and work week before you land.
            </p>
          )}
          <p className="mt-1 text-xs leading-relaxed text-mist">
            Meridian shifts your biological clock up to 90 minutes a day using timed light, sleep windows, and smart calendar rescheduling.
          </p>
        </div>

        {/* Route Picker */}
        <div className="mt-4">
          <div className="mb-1.5 text-2xs font-semibold tracking-wider text-mist uppercase">
            Flight Route &amp; Departure
          </div>
          <RoutePicker
            origin={origin}
            dest={dest}
            date={departureDate}
            onChange={onChangeRoute}
            disabled={phase === "running"}
          />
        </div>

        {/* Primary Action Bar */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onStart}
            disabled={phase === "running"}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-paper px-4 py-3 text-sm font-bold text-ink shadow-md transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles size={15} />
            {phase === "running"
              ? `Building your plan (${lockedCount}/${totalDays} days)…`
              : phase === "done"
                ? "Rebuild my plan"
                : "Personalize my trip plan"}
          </button>

          {phase === "running" && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-fail/40 bg-fail/10 px-3.5 py-3 text-xs font-bold text-fail transition-colors hover:bg-fail/20"
            >
              Stop
            </button>
          )}
        </div>

        {phase !== "idle" && (
          <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-3">
            <span className="text-xs text-mist">
              {phase === "done"
                ? "Plan ready — slept differently than planned?"
                : "Adapting to your baseline…"}
            </span>
            <MorningCheckin
              phase={phase}
              lockedCount={lockedCount}
              totalDays={totalDays}
              sessionStartedAt={sessionStartedAt}
              onCheckIn={onCheckIn}
            />
          </div>
        )}
      </div>

      {/* Connected Personal Tools Section */}
      <div className="rounded-2xl border border-line bg-ink-2 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xs font-bold tracking-wider text-paper uppercase">
              Connected Health &amp; Time Tools
            </h2>
            <p className="mt-0.5 text-xs text-mist">
              Your plan is shaped around your real sleep baseline and calendar.
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-pass/10 px-2 py-0.5 text-2xs font-semibold text-pass">
            <CheckCircle2 size={11} />2 active
          </span>
        </div>

        <div className="mt-3 space-y-2.5">
          {/* Tool 1: Wearable Baseline */}
          <div className="rounded-xl border border-line bg-ink-3/70 p-3 transition-colors hover:border-mist/40">
            <button
              type="button"
              onClick={() =>
                setExpandedTool((v) => (v === "wearable" ? null : "wearable"))
              }
              aria-expanded={expandedTool === "wearable"}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sleep/15 text-sleep">
                  <Watch size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-paper">
                      {baseline?.source ? `${baseline.source} Wearable` : "Sleep Wearable"}
                    </span>
                    <span className="rounded-full bg-pass/15 px-1.5 py-0.5 text-2xs font-semibold text-pass">
                      Synced
                    </span>
                  </div>
                  {baseline ? (
                    <div className="mt-0.5 font-mono2 text-xs text-mist">
                      {HUMAN_CHRONOTYPE[baseline.chronotype]} · Sleep{" "}
                      <span className="text-paper">
                        {fmtMin(baseline.avgBedtimeMin)}–{fmtMin(baseline.avgWakeMin)}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-mist">Reading sleep baseline…</div>
                  )}
                </div>
              </div>
              <span className="text-xs text-mist">
                {expandedTool === "wearable" ? "Hide" : "Details"}
              </span>
            </button>

            {expandedTool === "wearable" && baseline && (
              <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 font-mono2 text-xs">
                <div className="rounded-lg bg-ink-2 p-2">
                  <div className="flex items-center gap-1 text-2xs text-mist">
                    <MoonStar size={11} className="text-sleep" />
                    Avg Sleep
                  </div>
                  <div className="mt-0.5 font-bold text-paper">
                    {Math.floor(baseline.avgSleepMin / 60)}h {baseline.avgSleepMin % 60}m
                  </div>
                </div>
                <div className="rounded-lg bg-ink-2 p-2">
                  <div className="flex items-center gap-1 text-2xs text-mist">
                    <Activity size={11} className="text-pass" />
                    HRV ({baseline.hrvTrend})
                  </div>
                  <div className="mt-0.5 font-bold text-paper">{baseline.hrvMs} ms</div>
                </div>
                <div className="rounded-lg bg-ink-2 p-2">
                  <div className="flex items-center gap-1 text-2xs text-mist">
                    <HeartPulse size={11} className="text-sun-dest" />
                    Resting HR
                  </div>
                  <div className="mt-0.5 font-bold text-paper">{baseline.restingHr} bpm</div>
                </div>
              </div>
            )}
          </div>

          {/* Tool 2: Calendar & Productivity */}
          <div className="rounded-xl border border-line bg-ink-3/70 p-3 transition-colors hover:border-mist/40">
            <button
              type="button"
              onClick={() =>
                setExpandedTool((v) => (v === "calendar" ? null : "calendar"))
              }
              aria-expanded={expandedTool === "calendar"}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sun-home/15 text-sun-home">
                  <Calendar size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-paper">Work Calendar</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-2xs font-semibold ${
                        calendarSource === "google"
                          ? "bg-pass/15 text-pass"
                          : "bg-sun-dest/15 text-sun-dest"
                      }`}
                    >
                      {calendarSource === "google" ? "Google Live" : "Sample Week"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-mist">
                    <span className="font-mono2 text-paper">{calendar.length}</span> events ·{" "}
                    <span className="font-mono2 text-paper">{movableCount}</span> flexible blocks
                  </div>
                </div>
              </div>
              <span className="text-xs text-mist">
                {expandedTool === "calendar" ? "Hide" : "Details"}
              </span>
            </button>

            {expandedTool === "calendar" && (
              <div className="mt-3 space-y-2 border-t border-line pt-3 text-xs text-mist">
                <p className="leading-relaxed">
                  Fixed meetings stay locked in place. Flexible blocks (workouts, deep work, 1:1s) are automatically shifted out of your sleep and light windows.
                </p>
                {readiness.length > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-ink-2 px-2.5 py-2 font-mono2">
                    <span>Destination meeting readiness</span>
                    <span className="font-bold text-pass">
                      {readyCount}/{readiness.length} ready
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
