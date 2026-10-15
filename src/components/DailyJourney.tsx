"use client";

import { useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Globe2,
  Maximize2,
  Minimize2,
  Moon,
  Sparkles,
  Sun,
} from "lucide-react";
import { fmtMin } from "@/domain/circadian";
import { INTERVENTION_ICONS } from "@/lib/intervention-icons";
import type {
  AgentId,
  CalendarEvent,
  CalendarMove,
  Citation,
  DayPlan,
  InterventionKind,
  Trip,
} from "@/domain/types";
import type { MeetingReadiness } from "@/domain/readiness";
import type { ShiftDraft } from "@/state/run";
import type { EvalResult } from "@/domain/types";
import { WorldLens } from "@/components/lenses/WorldLens";
import { ShiftBoard } from "@/components/lenses/ShiftBoard";
import { CalendarLens } from "@/components/lenses/CalendarLens";

interface DailyJourneyProps {
  trip: Trip | null;
  phase: "idle" | "running" | "done";
  selectedDayLabel: string;
  onSelectDay: (label: string) => void;
  locked: Map<string, DayPlan>;
  drafts: Map<string, ShiftDraft>;
  verdicts: Map<string, EvalResult[]>;
  rejected: Set<string>;
  activeLabel?: string;
  activeAgent?: AgentId;
  sunProgress: number;
  ghostGap: number;
  citations: Citation[];
  calendarEvents: CalendarEvent[];
  moves: CalendarMove[];
  readiness: MeetingReadiness[];
  ics?: string;
  onStart: () => void;
}

type ViewTab = "daily" | "swimlane" | "calendar" | "map";

const INTERVENTION_LABELS: Record<InterventionKind, { title: string; category: string }> = {
  light_exposure: { title: "Seek Bright Light", category: "Light & Circadian" },
  avoid_light: { title: "Avoid Blue & Bright Light", category: "Light & Circadian" },
  sleep_window: { title: "Target Sleep Window", category: "Sleep & Recovery" },
  caffeine_cutoff: { title: "Caffeine Cutoff", category: "Energy & Nutrition" },
  melatonin: { title: "Melatonin Protocol", category: "Supplement Timing" },
  exercise: { title: "Timed Movement", category: "Physical Activity" },
  meal_timing: { title: "Meal Timing Anchor", category: "Energy & Nutrition" },
  nap: { title: "Strategic Recovery Nap", category: "Sleep & Recovery" },
};

function formatDateReadable(iso: string): string {
  if (!iso) return "";
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
    return dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

export function DailyJourney({
  trip,
  phase,
  selectedDayLabel,
  onSelectDay,
  locked,
  drafts,
  verdicts,
  rejected,
  activeLabel,
  activeAgent,
  sunProgress,
  ghostGap,
  citations,
  calendarEvents,
  moves,
  readiness,
  ics,
  onStart,
}: DailyJourneyProps) {
  const [viewTab, setViewTab] = useState<ViewTab>("daily");
  const [mapExpanded, setMapExpanded] = useState(false);

  const days = trip?.days ?? [];
  const activeDaySpec =
    days.find((d) => d.label === selectedDayLabel) ??
    (activeLabel ? days.find((d) => d.label === activeLabel) : undefined) ??
    days[0];

  const currentLabel = activeDaySpec?.label ?? "D-2";
  const currentPlan = locked.get(currentLabel) ?? drafts.get(currentLabel)?.plan;
  const isLocked = locked.has(currentLabel);
  const isPlanningThisDay = phase === "running" && activeLabel === currentLabel && !isLocked;

  const citationMap = new Map(citations.map((c) => [c.id, c]));

  // Events & moves for the currently selected day
  const dayIdx = activeDaySpec?.dayIndex ?? 0;
  const dayEvents = calendarEvents
    .filter((e) => (e.movedTo?.dayIndex ?? e.dayIndex) === dayIdx)
    .sort((a, b) => (a.movedTo?.startMin ?? a.startMin) - (b.movedTo?.startMin ?? b.startMin));

  const dayMoves = moves.filter(
    (m) => m.to.dayIndex === dayIdx || m.from.dayIndex === dayIdx,
  );
  const readinessById = new Map(readiness.map((r) => [r.eventId, r]));

  return (
    <div className="flex flex-col gap-4">
      {/* Atmospheric World Horizon Header */}
      <div
        className={`relative overflow-hidden rounded-2xl border border-line bg-ink-2 shadow-lg transition-all duration-300 ${
          viewTab === "map" || mapExpanded
            ? "h-[380px] sm:h-[440px]"
            : "h-[210px] sm:h-[240px]"
        }`}
      >
        <WorldLens
          trip={trip}
          progress={sunProgress}
          lockedLabels={new Set(locked.keys())}
          activeLabel={activeLabel}
          citationCount={citations.length}
          running={phase === "running"}
          ghostGap={ghostGap}
        />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-ink/90 via-ink/40 to-transparent p-3.5">
          <div>
            <div className="text-xs font-semibold text-paper">
              {trip
                ? `${trip.origin.name} (${trip.origin.code}) → ${trip.destination.name} (${trip.destination.code})`
                : "Global Circadian Horizon"}
            </div>
            <div className="text-2xs text-mist">
              {locked.size > 0
                ? `${Math.round(sunProgress * 100)}% of body-clock shift aligned across ${locked.size} of ${days.length} days`
                : "Dashed gold arc shows your body clock's dawn vs. real daylight"}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setMapExpanded((v) => !v)}
            className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-ink-2/85 px-3 py-1.5 text-xs font-medium text-paper backdrop-blur-md transition-colors hover:border-white/30"
          >
            {mapExpanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            {mapExpanded ? "Compact map" : "Expand globe"}
          </button>
        </div>
      </div>

      {/* Interactive 5-Day Circadian Ribbon */}
      {days.length > 0 && (
        <div aria-label="Trip days" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-paper">
                Your 5-Day Circadian &amp; Work Itinerary
              </h2>
              <p className="text-xs text-mist">
                Select any day to inspect your sleep window, timed health habits, and calendar adjustments.
              </p>
            </div>

            {/* View Switcher */}
            <div
              role="tablist"
              aria-label="Schedule view mode"
              className="inline-flex rounded-xl border border-line bg-ink-2 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={viewTab === "daily"}
                onClick={() => setViewTab("daily")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewTab === "daily"
                    ? "bg-paper text-ink"
                    : "text-mist hover:text-paper"
                }`}
              >
                Daily Guide
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewTab === "swimlane"}
                onClick={() => setViewTab("swimlane")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewTab === "swimlane"
                    ? "bg-paper text-ink"
                    : "text-mist hover:text-paper"
                }`}
              >
                24h Swimlane
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewTab === "calendar"}
                onClick={() => setViewTab("calendar")}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewTab === "calendar"
                    ? "bg-paper text-ink"
                    : "text-mist hover:text-paper"
                }`}
              >
                Week Calendar
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewTab === "map"}
                onClick={() => setViewTab("map")}
                className={`hidden items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors sm:inline-flex ${
                  viewTab === "map"
                    ? "bg-paper text-ink"
                    : "text-mist hover:text-paper"
                }`}
              >
                <Globe2 size={12} />
                World
              </button>
            </div>
          </div>

          {/* Horizontal swipeable day strip on mobile, 5-column grid on tablet/desktop */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {days.map((d) => {
              const plan = locked.get(d.label);
              const draft = drafts.get(d.label)?.plan;
              const shownPlan = plan ?? draft;
              const isSelected = d.label === currentLabel;
              const isActive = d.label === activeLabel && phase === "running";
              const isRejected = rejected.has(d.label);
              const isFlightDay = d.dayIndex === trip?.departureDayIndex;

              return (
                <button
                  key={d.dayIndex}
                  type="button"
                  onClick={() => {
                    onSelectDay(d.label);
                    if (viewTab === "map") setViewTab("daily");
                  }}
                  aria-pressed={isSelected}
                  className={`group flex flex-col justify-between rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? "border-paper bg-ink-3 shadow-md ring-1 ring-paper/30"
                      : plan
                        ? "border-pass/30 bg-ink-2 hover:border-pass/60 hover:bg-ink-3/70"
                        : isActive
                          ? "border-progress/50 bg-ink-3/80"
                          : isRejected
                            ? "border-fail/40 bg-ink-2"
                            : "border-line bg-ink-2/70 hover:border-mist/40"
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-1">
                    <span
                      className={`text-xs font-bold ${
                        isSelected
                          ? "text-paper"
                          : plan
                            ? "text-pass"
                            : isActive
                              ? "text-progress"
                              : "text-mist"
                      }`}
                    >
                      {isFlightDay ? `${d.label} · Fly` : d.label}
                    </span>
                    {plan ? (
                      <span className="rounded-full bg-pass/15 px-1.5 py-0.5 font-mono2 text-2xs font-semibold text-pass">
                        {plan.shiftMin > 0 ? `+${plan.shiftMin}m` : `${plan.shiftMin}m`}
                      </span>
                    ) : isActive ? (
                      <span className="h-2 w-2 rounded-full bg-progress animate-pulse" />
                    ) : null}
                  </div>

                  <div className="mt-0.5 text-2xs text-mist">
                    {formatDateReadable(d.date)}
                  </div>

                  {shownPlan ? (
                    <div className="mt-2.5 border-t border-line/60 pt-2 font-mono2 text-xs">
                      <div className="flex items-center justify-between text-paper">
                        <span className="text-mist">Sleep</span>
                        <span>
                          {fmtMin(shownPlan.targetBedtimeMin)}–{fmtMin(shownPlan.targetWakeMin)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {shownPlan.interventions.map((iv, j) => {
                          const { icon: Icon, tint } = INTERVENTION_ICONS[iv.kind];
                          return <Icon key={j} size={12} color={tint} strokeWidth={2.2} />;
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2.5 border-t border-line/40 pt-2 text-2xs text-dim">
                      {isActive
                        ? "Crafting schedule…"
                        : isRejected
                          ? "Adjusting window…"
                          : "Ready to plan"}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Content Area based on active viewTab */}
      {viewTab === "swimlane" && trip && (
        <div className="min-h-[380px] overflow-hidden rounded-2xl border border-line bg-ink-2 p-2">
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

      {viewTab === "calendar" && trip && (
        <div className="h-[460px] overflow-hidden rounded-2xl border border-line bg-ink-2 p-2">
          <CalendarLens
            days={trip.days}
            events={calendarEvents}
            readiness={readiness}
            ics={ics}
          />
        </div>
      )}

      {viewTab === "daily" && (
        <div className="rounded-2xl border border-line bg-ink-2 p-5">
          {/* Empty / Idle State when no plan has been generated yet */}
          {!currentPlan && phase === "idle" && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sun-dest/15 text-sun-dest">
                <Sun size={24} />
              </div>
              <h3 className="mt-3 font-voice text-xl text-paper">
                Ready to shape your {trip?.destination.name ?? "upcoming"} trip
              </h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-mist">
                We&apos;ll combine your wearable sleep baseline, peer-reviewed light &amp; melatonin timing, and your work calendar into a day-by-day biological itinerary.
              </p>

              {/* Preview of the selected day's meetings before planning */}
              {dayEvents.length > 0 && (
                <div className="mt-5 w-full max-w-lg rounded-xl border border-line bg-ink-3/60 p-3.5 text-left">
                  <div className="flex items-center justify-between text-xs font-semibold text-paper">
                    <span>
                      {currentLabel} ({formatDateReadable(activeDaySpec?.date ?? "")}) Calendar Preview
                    </span>
                    <span className="font-mono2 text-mist">{dayEvents.length} events</span>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {dayEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="flex items-center justify-between rounded-lg bg-ink-2 px-3 py-1.5 text-xs"
                      >
                        <span className="font-medium text-paper">{ev.title}</span>
                        <span className="font-mono2 text-mist">
                          {fmtMin(ev.startMin)}–{fmtMin(ev.endMin)}{" "}
                          <span className="ml-1 text-2xs text-dim">
                            ({ev.movable ? "flexible" : "fixed"})
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={onStart}
                className="mt-6 inline-flex items-center gap-2 rounded-xl bg-paper px-5 py-3 text-sm font-bold text-ink shadow-md transition-colors hover:bg-white"
              >
                <Sparkles size={15} />
                Personalize my trip plan
              </button>
            </div>
          )}

          {/* Building State for a Day not yet drafted */}
          {!currentPlan && phase === "running" && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-progress border-t-transparent" />
              <p className="mt-3 font-voice text-lg text-paper">
                Calculating {currentLabel} sleep, light &amp; calendar windows…
              </p>
              <p className="mt-1 text-xs text-mist">
                Checking circadian phase limits and clearing calendar conflicts.
              </p>
            </div>
          )}

          {/* Populated Daily Chapter (Sleep + Timed Health Habits + Calendar Moves) */}
          {currentPlan && (
            <div className="space-y-6">
              {/* Day Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="font-voice text-2xl text-paper">
                      {currentLabel} · {formatDateReadable(activeDaySpec?.date ?? "")}
                    </h3>
                    {isLocked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-pass/15 px-2.5 py-0.5 text-xs font-bold text-pass">
                        <CheckCircle2 size={12} />
                        Verified Plan
                      </span>
                    ) : isPlanningThisDay ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-progress/15 px-2.5 py-0.5 text-xs font-semibold text-progress">
                        <span className="h-1.5 w-1.5 rounded-full bg-progress animate-pulse" />
                        Verifying…
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-mist">
                    Body clock shifts{" "}
                    <span className="font-mono2 font-semibold text-paper">
                      {Math.abs(currentPlan.shiftMin)} minutes
                    </span>{" "}
                    {currentPlan.shiftMin < 0 ? "earlier (eastward)" : "later (westward)"} today.
                  </p>
                </div>

                {/* Sleep Target Pill */}
                <div className="flex items-center gap-3 rounded-xl border border-sleep/30 bg-sleep/10 px-4 py-2.5">
                  <Moon size={18} className="text-sleep" />
                  <div>
                    <div className="text-2xs font-semibold tracking-wider text-sleep uppercase">
                      Target Sleep Window
                    </div>
                    <div className="font-mono2 text-sm font-bold text-paper">
                      {fmtMin(currentPlan.targetBedtimeMin)} → {fmtMin(currentPlan.targetWakeMin)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Two-column inner layout on desktop: Timed Health & Sleep Habits | Work Calendar & Readiness */}
              <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
                {/* Column 1: Timed Circadian & Health Protocols */}
                <div className="min-w-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold tracking-wider text-mist uppercase">
                      Daily Health, Light &amp; Sleep Actions ({currentPlan.interventions.length})
                    </h4>
                  </div>

                  <div className="space-y-2.5">
                    {currentPlan.interventions
                      .slice()
                      .sort((a, b) => a.startMin - b.startMin)
                      .map((iv, idx) => {
                        const { icon: Icon, tint } = INTERVENTION_ICONS[iv.kind];
                        const meta = INTERVENTION_LABELS[iv.kind] ?? {
                          title: iv.kind.replace(/_/g, " "),
                          category: "Circadian Action",
                        };
                        const citation = iv.citationId ? citationMap.get(iv.citationId) : undefined;

                        return (
                          <div
                            key={idx}
                            className="rounded-xl border border-line bg-ink-3/70 p-3.5 transition-colors hover:border-mist/40"
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-ink-2"
                                style={{ color: tint }}
                              >
                                <Icon size={17} strokeWidth={2.2} />
                              </div>

                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-sm font-bold text-paper">
                                    {meta.title}
                                  </span>
                                  <span className="rounded-lg bg-ink-2 px-2.5 py-1 font-mono2 text-xs font-bold text-paper">
                                    {fmtMin(iv.startMin)}
                                    {iv.endMin ? ` – ${fmtMin(iv.endMin)}` : ""}
                                  </span>
                                </div>

                                <div className="mt-0.5 text-2xs font-medium text-mist">
                                  {meta.category}
                                </div>

                                <p className="mt-1.5 text-xs leading-relaxed text-paper/90">
                                  {iv.note}
                                </p>

                                {citation && (
                                  <div className="mt-2.5 flex items-center gap-1.5 border-t border-line/60 pt-2 text-2xs text-mist">
                                    <BookOpen size={11} className="shrink-0 text-pass" />
                                    <span className="truncate">
                                      Backed by:{" "}
                                      <a
                                        href={
                                          citation.doi
                                            ? `https://doi.org/${citation.doi}`
                                            : citation.url
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                        className="font-medium text-paper underline decoration-line underline-offset-2 hover:text-pass"
                                      >
                                        {citation.title}
                                      </a>
                                      {citation.year ? ` (${citation.year})` : ""}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Column 2: Work Calendar & Meeting Readiness for this day */}
                <div className="min-w-0 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold tracking-wider text-mist uppercase">
                      Schedule &amp; Meeting Readiness ({dayEvents.length})
                    </h4>
                    <button
                      type="button"
                      onClick={() => setViewTab("calendar")}
                      className="text-xs font-medium text-sun-home hover:underline"
                    >
                      Full week grid →
                    </button>
                  </div>

                  {/* Smart Reschedules callout if any happened on this day */}
                  {dayMoves.length > 0 && (
                    <div className="rounded-xl border border-sun-home/30 bg-sun-home/10 p-3">
                      <div className="text-xs font-bold text-sun-home">
                        Smart Calendar Adjustments
                      </div>
                      <ul className="mt-1.5 space-y-1.5">
                        {dayMoves.map((m, i) => (
                          <li key={i} className="text-xs text-paper">
                            <span className="font-semibold">{m.title}</span>:{" "}
                            <span className="font-mono2 text-mist">
                              {fmtMin(m.from.startMin)}
                            </span>{" "}
                            <ArrowRight size={11} className="inline text-sun-home" />{" "}
                            <span className="font-mono2 font-bold text-paper">
                              {fmtMin(m.to.startMin)}
                            </span>
                            <div className="text-2xs text-mist">{m.reason}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {dayEvents.length === 0 ? (
                    <div className="rounded-xl border border-line bg-ink-3/40 p-4 text-center text-xs text-mist">
                      No calendar events scheduled on {currentLabel}. Focus on rest and timed light.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dayEvents.map((ev) => {
                        const badge = readinessById.get(ev.id);
                        const start = ev.movedTo?.startMin ?? ev.startMin;
                        const end = ev.movedTo?.endMin ?? ev.endMin;
                        const wasMoved = Boolean(ev.movedTo);

                        return (
                          <div
                            key={ev.id}
                            className="rounded-xl border border-line bg-ink-3/50 p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <Calendar size={13} className="text-sun-home" />
                                  <span className="text-xs font-bold text-paper">
                                    {ev.title}
                                  </span>
                                </div>
                                <div className="mt-1 flex items-center gap-2 font-mono2 text-xs text-mist">
                                  <Clock size={11} />
                                  <span>
                                    {fmtMin(start)} – {fmtMin(end)}
                                  </span>
                                  {wasMoved && (
                                    <span className="rounded bg-sun-home/15 px-1.5 py-0.5 text-2xs text-sun-home">
                                      moved from {fmtMin(ev.startMin)}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {badge ? (
                                <span
                                  className={`shrink-0 rounded-full px-2 py-0.5 text-2xs font-bold ${
                                    badge.status === "risk"
                                      ? "bg-fail/15 text-fail"
                                      : "bg-pass/15 text-pass"
                                  }`}
                                >
                                  {badge.status === "risk" ? "AT RISK" : "BIOLOGICALLY READY"}
                                </span>
                              ) : (
                                <span className="rounded-full bg-ink-2 px-2 py-0.5 text-2xs text-mist">
                                  {ev.movable ? "Flexible" : "Fixed"}
                                </span>
                              )}
                            </div>

                            {badge && (
                              <div className="mt-2 border-t border-line/60 pt-2 text-2xs text-mist">
                                Feels like{" "}
                                <span className="font-mono2 font-semibold text-paper">
                                  {fmtMin(badge.bodyMin)}
                                </span>{" "}
                                in your body
                                {badge.bodyWithoutPlanMin !== badge.bodyMin && (
                                  <span>
                                    {" "}
                                    (instead of{" "}
                                    <span className="font-mono2 text-fail">
                                      {fmtMin(badge.bodyWithoutPlanMin)}
                                    </span>{" "}
                                    without plan)
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
