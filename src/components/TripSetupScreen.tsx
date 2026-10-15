"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Calendar,
  Check,
  Clock,
  Globe2,
  HeartPulse,
  MoonStar,
  Plane,
  Sparkles,
  Watch,
} from "lucide-react";
import { fmtMin } from "@/domain/circadian";
import { getFlightRecommendations } from "@/domain/nudges";
import type {
  AgentId,
  CalendarEvent,
  Citation,
  DayPlan,
  EvalResult,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import type { MeetingReadiness } from "@/domain/readiness";
import type { ShiftDraft } from "@/state/run";
import { RoutePicker } from "@/components/RoutePicker";
import { MorningCheckin } from "@/components/MorningCheckin";
import { WorldLens } from "@/components/lenses/WorldLens";
import { ShiftBoard } from "@/components/lenses/ShiftBoard";
import { CalendarLens } from "@/components/lenses/CalendarLens";

interface TripSetupScreenProps {
  trip: Trip | null;
  origin: string;
  dest: string;
  departureDate: string;
  onChangeRoute: (next: { origin: string; dest: string; date: string }) => void;
  selectedFlightId: string;
  onSelectFlightId: (id: string) => void;
  baseline?: WearableBaseline;
  calendar: CalendarEvent[];
  calendarSource?: "google" | "fixture";
  readiness: MeetingReadiness[];
  hook: { body: string; dest: string } | null;
  phase: "idle" | "running" | "done";
  lockedCount: number;
  totalDays: number;
  sessionStartedAt?: number;
  locked: Map<string, DayPlan>;
  drafts: Map<string, ShiftDraft>;
  verdicts: Map<string, EvalResult[]>;
  activeLabel?: string;
  activeAgent?: AgentId;
  sunProgress: number;
  ghostGap: number;
  citations: Citation[];
  ics?: string;
  onStart: () => void;
  onCancel: () => void;
  onCheckIn: (extra: { checkins: string; startDay: number }) => void;
  onBackToGuide: () => void;
}

const HUMAN_CHRONOTYPE: Record<WearableBaseline["chronotype"], string> = {
  early: "Early bird",
  neutral: "Intermediate rhythm",
  late: "Night owl",
};

export function TripSetupScreen({
  trip,
  origin,
  dest,
  departureDate,
  onChangeRoute,
  selectedFlightId,
  onSelectFlightId,
  baseline,
  calendar,
  calendarSource,
  readiness,
  hook,
  phase,
  lockedCount,
  totalDays,
  sessionStartedAt,
  locked,
  drafts,
  verdicts,
  activeLabel,
  activeAgent,
  sunProgress,
  ghostGap,
  citations,
  ics,
  onStart,
  onCancel,
  onCheckIn,
  onBackToGuide,
}: TripSetupScreenProps) {
  const [visualExplorer, setVisualExplorer] = useState<
    "none" | "globe" | "swimlane" | "calendar"
  >("none");

  const flightOptions = useMemo(
    () => (trip ? getFlightRecommendations(trip) : []),
    [trip],
  );
  const activeFlightId =
    selectedFlightId ||
    flightOptions.find((f) => f.recommended)?.id ||
    flightOptions[0]?.id ||
    "";

  const shiftHours = trip ? Math.abs(trip.requiredShiftMin / 60) : 0;
  const shiftDir = trip?.direction === "east" ? "Eastward" : "Westward";
  const movableCount = calendar.filter((e) => e.movable).length;
  const readyCount = readiness.filter((r) => r.status === "ready").length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* Top Bar: Back to Daily Nudges */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-voice text-2xl text-paper sm:text-3xl">
            Trip &amp; Flight Setup
          </h1>
          <p className="mt-0.5 text-xs text-mist">
            Choose your route, pick the best flight window for zero jet lag, and manage your wearable &amp; calendar sync.
          </p>
        </div>

        <button
          type="button"
          onClick={onBackToGuide}
          className="inline-flex items-center gap-2 rounded-xl bg-paper px-4 py-2.5 text-xs font-bold text-ink shadow-sm transition-colors hover:bg-white"
        >
          <ArrowLeft size={14} />
          Back to Daily Nudges
        </button>
      </div>

      {/* SECTION 1: Route & Departure Card */}
      <section className="rounded-3xl border border-line bg-ink-2 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sun-dest/15 px-3 py-1 text-xs font-bold text-sun-dest">
            <Plane size={13} />
            1. Route &amp; Timezone Shift
          </span>
          {trip && (
            <span className="font-mono2 text-xs text-mist">
              {shiftHours}h {shiftDir} shift ·{" "}
              {hook ? `Body ${hook.body} vs Dest ${hook.dest}` : ""}
            </span>
          )}
        </div>

        <div className="mt-4">
          <RoutePicker
            origin={origin}
            dest={dest}
            date={departureDate}
            onChange={onChangeRoute}
            disabled={phase === "running"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="text-xs text-mist">
            {phase === "done"
              ? `All ${totalDays} days verified against your wearable & calendar.`
              : "Want the AI crew to re-verify your schedule and reschedule meetings?"}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onStart();
                onBackToGuide();
              }}
              disabled={phase === "running"}
              className="inline-flex items-center gap-2 rounded-xl bg-paper px-4 py-2.5 text-xs font-bold text-ink transition-colors hover:bg-white disabled:opacity-50"
            >
              <Sparkles size={14} />
              {phase === "running"
                ? `Building (${lockedCount}/${totalDays})…`
                : "Personalize & View Nudges"}
            </button>

            {phase === "running" && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-fail/40 bg-fail/10 px-3 py-2.5 text-xs font-bold text-fail"
              >
                Stop
              </button>
            )}

            <MorningCheckin
              phase={phase}
              lockedCount={lockedCount}
              totalDays={totalDays}
              sessionStartedAt={sessionStartedAt}
              onCheckIn={onCheckIn}
            />
          </div>
        </div>
      </section>

      {/* SECTION 2: Best Flight Time Advisor ("What time is the flight I should get?") */}
      {flightOptions.length > 0 && (
        <section className="rounded-3xl border border-line bg-ink-2 p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pass/15 px-3 py-1 text-xs font-bold text-pass">
                <Clock size={13} />
                2. Best Flight Time Advisor
              </span>
              <h2 className="mt-2 font-voice text-xl text-paper">
                Which flight should you book to feel 100% on arrival?
              </h2>
              <p className="mt-0.5 text-xs text-mist">
                If you have a choice of flights for {trip?.origin.code} → {trip?.destination.code}, picking the right arrival window cuts jet lag in half before you even start.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {flightOptions.map((opt) => {
              const isSelected = opt.id === activeFlightId;
              return (
                <div
                  key={opt.id}
                  onClick={() => onSelectFlightId(opt.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectFlightId(opt.id);
                    }
                  }}
                  className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                    isSelected
                      ? "border-paper bg-ink-3 shadow-md ring-1 ring-paper/30"
                      : "border-line bg-ink-3/50 hover:border-mist/50"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-2xs font-bold ${
                          opt.recommended
                            ? "bg-pass/20 text-pass"
                            : opt.badge === "Good Alternative"
                              ? "bg-sun-dest/20 text-sun-dest"
                              : "bg-fail/15 text-fail"
                        }`}
                      >
                        {opt.badge}
                      </span>
                      <span className="text-xs font-bold text-paper">
                        {opt.flightNumberExample}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono2 text-xs font-bold text-pass">
                        {opt.landingReadinessPct}% day-1 readiness
                      </span>
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                          isSelected
                            ? "border-paper bg-paper text-ink"
                            : "border-line text-transparent"
                        }`}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-4 rounded-xl bg-ink-2 px-3 py-2 font-mono2 text-xs">
                    <div>
                      <span className="text-mist">Departs: </span>
                      <span className="font-bold text-paper">{opt.departsLocal}</span>
                    </div>
                    <div>
                      <span className="text-mist">Arrives: </span>
                      <span className="font-bold text-paper">{opt.arrivesDest}</span>
                    </div>
                    <div className="text-sun-dest">{opt.cabinSleepWindow}</div>
                  </div>

                  <p className="mt-2.5 text-xs font-semibold text-paper">
                    {opt.headline}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-mist">
                    {opt.whyChoose}
                  </p>
                  <div className="mt-2 text-2xs text-sun-dest">
                    <span className="font-bold">Landing nudge: </span>
                    {opt.firstNudgeOnLanding}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* SECTION 3: Connected Wearable Baseline & Work Calendar */}
      <section className="grid gap-4 sm:grid-cols-2">
        {/* Wearable Card */}
        <div className="rounded-3xl border border-line bg-ink-2 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sleep/15 text-sleep">
                <Watch size={17} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-paper">
                  {baseline?.source ?? "Garmin Wearable"}
                </h3>
                <p className="text-2xs text-mist">
                  {baseline ? HUMAN_CHRONOTYPE[baseline.chronotype] : "Synced baseline"}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-pass/15 px-2.5 py-0.5 text-2xs font-bold text-pass">
              Connected
            </span>
          </div>

          {baseline && (
            <div className="mt-4 grid grid-cols-3 gap-2 font-mono2 text-xs">
              <div className="rounded-xl bg-ink-3 p-2.5">
                <div className="flex items-center gap-1 text-2xs text-mist">
                  <MoonStar size={11} className="text-sleep" />
                  Usual Sleep
                </div>
                <div className="mt-1 font-bold text-paper">
                  {fmtMin(baseline.avgBedtimeMin)}–{fmtMin(baseline.avgWakeMin)}
                </div>
              </div>
              <div className="rounded-xl bg-ink-3 p-2.5">
                <div className="flex items-center gap-1 text-2xs text-mist">
                  <Activity size={11} className="text-pass" />
                  HRV
                </div>
                <div className="mt-1 font-bold text-paper">{baseline.hrvMs} ms</div>
              </div>
              <div className="rounded-xl bg-ink-3 p-2.5">
                <div className="flex items-center gap-1 text-2xs text-mist">
                  <HeartPulse size={11} className="text-sun-dest" />
                  Resting HR
                </div>
                <div className="mt-1 font-bold text-paper">{baseline.restingHr} bpm</div>
              </div>
            </div>
          )}
        </div>

        {/* Work Calendar Card */}
        <div className="rounded-3xl border border-line bg-ink-2 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sun-home/15 text-sun-home">
                <Calendar size={17} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-paper">Work Calendar</h3>
                <p className="text-2xs text-mist">
                  {calendarSource === "google" ? "Google Calendar Live" : "Synced Week"}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-sun-dest/15 px-2.5 py-0.5 text-2xs font-bold text-sun-dest">
              {movableCount} flexible
            </span>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-mist">
            Fixed meetings stay locked. Flexible blocks (1:1s, workouts, deep work) are suggested as calendar nudges when they clash with sunlight or sleep windows.
          </p>

          {readiness.length > 0 && (
            <div className="mt-3 flex items-center justify-between rounded-xl bg-ink-3 px-3 py-2 font-mono2 text-xs">
              <span className="text-mist">Key meeting readiness</span>
              <span className="font-bold text-pass">
                {readyCount}/{readiness.length} biologically ready
              </span>
            </div>
          )}
        </div>
      </section>

      {/* SECTION 4: Optional Visual Explorers (tucked away here so they never crowd Daily Nudges) */}
      <section className="rounded-3xl border border-line bg-ink-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-paper">
              Optional Deep-Dive Visuals
            </h3>
            <p className="text-xs text-mist">
              Want to inspect the global daylight curve, 24h swimlane, or full week grid? Open one below.
            </p>
          </div>

          <div className="inline-flex flex-wrap gap-1.5">
            {(
              [
                { id: "none", label: "Hidden" },
                { id: "globe", label: "Globe & Daylight" },
                { id: "swimlane", label: "24h Swimlane" },
                { id: "calendar", label: "Week Calendar" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setVisualExplorer(tab.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                  visualExplorer === tab.id
                    ? "bg-paper text-ink"
                    : "bg-ink-3 text-mist hover:text-paper"
                }`}
              >
                {tab.id === "globe" && <Globe2 size={12} className="mr-1 inline" />}
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {visualExplorer === "globe" && (
          <div className="mt-4 h-[340px] overflow-hidden rounded-2xl border border-line bg-ink">
            <WorldLens
              trip={trip}
              progress={sunProgress}
              lockedLabels={new Set(locked.keys())}
              activeLabel={activeLabel}
              citationCount={citations.length}
              running={phase === "running"}
              ghostGap={ghostGap}
            />
          </div>
        )}

        {visualExplorer === "swimlane" && trip && (
          <div className="mt-4 min-h-[360px] overflow-hidden rounded-2xl border border-line bg-ink p-2">
            <ShiftBoard
              days={trip.days}
              drafts={drafts}
              verdicts={verdicts}
              locked={locked}
              activeLabel={activeLabel}
              activeAgent={activeAgent}
            />
          </div>
        )}

        {visualExplorer === "calendar" && trip && (
          <div className="mt-4 h-[420px] overflow-hidden rounded-2xl border border-line bg-ink p-2">
            <CalendarLens
              days={trip.days}
              events={calendar}
              readiness={readiness}
              ics={ics}
            />
          </div>
        )}
      </section>
    </div>
  );
}
