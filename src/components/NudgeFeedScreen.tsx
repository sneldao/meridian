"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CalendarPlus,
  Check,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Footprints,
  Moon,
  Plane,
  SlidersHorizontal,
  Sparkles,
  Star,
  Sun,
} from "lucide-react";
import {
  buildDailyNudgesForDay,
  getFlightRecommendations,
  type NudgeCategory,
  type TravelerNudge,
} from "@/domain/nudges";
import type {
  CalendarEvent,
  CalendarMove,
  Citation,
  DayPlan,
  Trip,
  WearableBaseline,
} from "@/domain/types";

export type GuideViewMode = "focus" | "cards";

interface NudgeFeedScreenProps {
  trip: Trip | null;
  phase: "idle" | "running" | "done";
  selectedDayLabel: string;
  onSelectDay: (label: string) => void;
  locked: Map<string, DayPlan>;
  drafts: Map<string, { plan: DayPlan }>;
  baseline?: WearableBaseline;
  calendarEvents: CalendarEvent[];
  moves: CalendarMove[];
  citations: Citation[];
  ics?: string;
  selectedFlightId: string;
  onOpenTripSetup: () => void;
  onStartCrewSync: () => void;
}

const CATEGORY_META: Record<
  NudgeCategory,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
    borderAccent: string;
    Icon: typeof Sun;
  }
> = {
  sunlight: {
    label: "Sunlight on Face",
    badgeBg: "bg-sun-dest/15",
    badgeText: "text-sun-dest",
    borderAccent: "border-l-sun-dest",
    Icon: Sun,
  },
  run: {
    label: "Run & Movement",
    badgeBg: "bg-pass/15",
    badgeText: "text-pass",
    borderAccent: "border-l-pass",
    Icon: Footprints,
  },
  nutrition: {
    label: "Eat, Hydrate & Caffeine",
    badgeBg: "bg-[#d2a26b]/15",
    badgeText: "text-[#d2a26b]",
    borderAccent: "border-l-[#d2a26b]",
    Icon: Coffee,
  },
  calendar: {
    label: "Calendar Move",
    badgeBg: "bg-sun-home/15",
    badgeText: "text-sun-home",
    borderAccent: "border-l-sun-home",
    Icon: Calendar,
  },
  sleep: {
    label: "Sleep & Wind-Down",
    badgeBg: "bg-sleep/15",
    badgeText: "text-sleep",
    borderAccent: "border-l-sleep",
    Icon: Moon,
  },
  flight: {
    label: "Flight Timing",
    badgeBg: "bg-sun-dest/15",
    badgeText: "text-sun-dest",
    borderAccent: "border-l-sun-dest",
    Icon: Plane,
  },
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

export function NudgeFeedScreen({
  trip,
  phase,
  selectedDayLabel,
  onSelectDay,
  locked,
  drafts,
  baseline,
  calendarEvents,
  moves,
  citations,
  ics,
  selectedFlightId,
  onOpenTripSetup,
  onStartCrewSync,
}: NudgeFeedScreenProps) {
  const [viewMode, setViewMode] = useState<GuideViewMode>("focus");
  const [defaultViewMode, setDefaultViewMode] = useState<GuideViewMode>("focus");
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [acceptedMoves, setAcceptedMoves] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<NudgeCategory | "all">("all");

  // Load saved default view preference from localStorage after mount
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem("meridian:defaultGuideView");
        if (saved === "focus" || saved === "cards") {
          setViewMode(saved);
          setDefaultViewMode(saved);
        }
        const savedDone = localStorage.getItem("meridian:completedNudges");
        if (savedDone) {
          const parsed = JSON.parse(savedDone);
          if (Array.isArray(parsed)) setCompletedIds(new Set(parsed));
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const handleSetDefaultView = (mode: GuideViewMode) => {
    setDefaultViewMode(mode);
    setViewMode(mode);
    try {
      localStorage.setItem("meridian:defaultGuideView", mode);
    } catch {
      /* ignore */
    }
  };

  const toggleComplete = (id: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("meridian:completedNudges", JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const toggleAcceptMove = (id: string) => {
    setAcceptedMoves((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const days = trip?.days ?? [];
  const activeDayIndex = Math.max(
    0,
    days.findIndex((d) => d.label === selectedDayLabel),
  );
  const activeDaySpec = days[activeDayIndex] ?? days[0];
  const currentLabel = activeDaySpec?.label ?? "D-2";

  const flightOptions = useMemo(
    () => (trip ? getFlightRecommendations(trip) : []),
    [trip],
  );
  const chosenFlight =
    flightOptions.find((f) => f.id === selectedFlightId) ??
    flightOptions.find((f) => f.recommended) ??
    flightOptions[0];

  const allDayNudges = useMemo(() => {
    if (!trip || !activeDaySpec) return [];
    const plan =
      locked.get(activeDaySpec.label) ?? drafts.get(activeDaySpec.label)?.plan;
    return buildDailyNudgesForDay({
      trip,
      dayIndex: activeDaySpec.dayIndex,
      plan,
      baseline,
      calendarEvents,
      moves,
      citations,
    });
  }, [trip, activeDaySpec, locked, drafts, baseline, calendarEvents, moves, citations]);

  const filteredNudges = useMemo(() => {
    if (categoryFilter === "all") return allDayNudges;
    return allDayNudges.filter((n) => n.category === categoryFilter);
  }, [allDayNudges, categoryFilter]);

  // Hero "Right Now / Up Next" nudge is the first uncompleted nudge for the selected day
  const heroNudge: TravelerNudge | undefined =
    allDayNudges.find((n) => !completedIds.has(n.id)) ?? allDayNudges[0];

  const completedTodayCount = allDayNudges.filter((n) =>
    completedIds.has(n.id),
  ).length;

  const shiftHours = trip ? Math.abs(trip.requiredShiftMin / 60) : 8;
  const shiftDir = trip?.direction === "east" ? "East" : "West";

  const downloadIcs = () => {
    if (!ics) return;
    const blob = new Blob([ics], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meridian-shift-plan.ics";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      {/* Compact, Calm Trip Context Pill + Quick Switch to Trip Setup */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-ink-2/90 px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sun-dest/15 text-sun-dest">
            <Plane size={17} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-paper">
                {trip
                  ? `${trip.origin.name} (${trip.origin.code}) → ${trip.destination.name} (${trip.destination.code})`
                  : "London → Tokyo"}
              </span>
              <span className="rounded-full bg-ink-3 px-2 py-0.5 font-mono2 text-2xs text-sun-dest">
                {shiftHours}h {shiftDir}
              </span>
              {chosenFlight && (
                <span className="hidden rounded-full border border-pass/30 bg-pass/10 px-2 py-0.5 text-2xs font-semibold text-pass sm:inline-block">
                  {chosenFlight.landingReadinessPct}% arrival readiness
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-mist">
              {chosenFlight
                ? `Target flight: Departs ${chosenFlight.departsLocal} · Arrives ${chosenFlight.arrivesDest}`
                : "Bite-sized daily nudges so you land feeling 100%."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {ics && (
            <button
              type="button"
              onClick={downloadIcs}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-ink-3 px-3 py-1.5 text-xs font-medium text-paper transition-colors hover:border-mist"
              title="Export nudges & adjusted meetings to your calendar"
            >
              <CalendarPlus size={13} className="text-sun-home" />
              <span className="hidden sm:inline">Add .ics</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenTripSetup}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-ink-3 px-3 py-1.5 text-xs font-medium text-mist transition-colors hover:border-mist hover:text-paper"
          >
            <SlidersHorizontal size={13} />
            <span>Flight &amp; Setup</span>
          </button>
        </div>
      </div>

      {/* Dynamic View Switcher with Customizable Default Preference */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Daily guide experience mode"
          className="inline-flex items-center rounded-xl border border-line bg-ink-2 p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "focus"}
            onClick={() => setViewMode("focus")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "focus"
                ? "bg-paper text-ink shadow-sm"
                : "text-mist hover:text-paper"
            }`}
          >
            <Sparkles size={13} />
            Today&apos;s Focus Feed
            {defaultViewMode === "focus" && (
              <span
                className={`text-2xs ${viewMode === "focus" ? "text-ink/70" : "text-sun-dest"}`}
                title="Your default view"
              >
                ★
              </span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "cards"}
            onClick={() => setViewMode("cards")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
              viewMode === "cards"
                ? "bg-paper text-ink shadow-sm"
                : "text-mist hover:text-paper"
            }`}
          >
            <Calendar size={13} />
            Day-by-Day Cards
            {defaultViewMode === "cards" && (
              <span
                className={`text-2xs ${viewMode === "cards" ? "text-ink/70" : "text-sun-dest"}`}
                title="Your default view"
              >
                ★
              </span>
            )}
          </button>
        </div>

        {/* Pin current mode as default */}
        <div className="flex items-center gap-2">
          {defaultViewMode !== viewMode ? (
            <button
              type="button"
              onClick={() => handleSetDefaultView(viewMode)}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-ink-2 px-2.5 py-1 text-2xs font-medium text-mist transition-colors hover:border-sun-dest/50 hover:text-paper"
            >
              <Star size={11} className="text-sun-dest" />
              Set as default view
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-2xs text-mist">
              <Star size={11} className="fill-sun-dest text-sun-dest" />
              Default view
            </span>
          )}
        </div>
      </div>

      {/* Compact Day Pill Selector */}
      {days.length > 0 && (
        <div
          aria-label="Select trip day"
          className="grid grid-cols-5 gap-1.5 rounded-2xl border border-line bg-ink-2 p-1.5"
        >
          {days.map((d) => {
            const isSelected = d.label === currentLabel;
            const isFlight = d.dayIndex === trip?.departureDayIndex;
            const isLocked = locked.has(d.label);

            return (
              <button
                key={d.dayIndex}
                type="button"
                onClick={() => onSelectDay(d.label)}
                aria-pressed={isSelected}
                className={`flex flex-col items-center justify-center rounded-xl px-2 py-2 text-center transition-all ${
                  isSelected
                    ? "bg-paper text-ink shadow-sm"
                    : "text-mist hover:bg-ink-3 hover:text-paper"
                }`}
              >
                <div className="flex items-center gap-1 text-xs font-bold">
                  <span>{isFlight ? "✈️ Fly" : d.label}</span>
                  {isLocked && !isSelected && (
                    <span className="h-1.5 w-1.5 rounded-full bg-pass" />
                  )}
                </div>
                <div
                  className={`mt-0.5 text-2xs ${
                    isSelected ? "text-ink/75 font-medium" : "text-dim"
                  }`}
                >
                  {formatDateReadable(d.date).split(",")[0]}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* MODE 1: TODAY'S FOCUS FEED ("Right Now" Hero Nudge + Clean Stream) */}
      {viewMode === "focus" && (
        <div className="flex flex-col gap-5">
          {/* HERO "RIGHT NOW / NEXT NUDGE" CARD */}
          {heroNudge && (
            <section
              aria-label="Your next circadian nudge"
              className="relative overflow-hidden rounded-3xl border border-sun-dest/35 bg-gradient-to-br from-ink-3 via-ink-2 to-ink-2 p-6 shadow-xl"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-sun-dest/10 blur-3xl"
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-sun-dest/15 px-3 py-1 text-xs font-bold text-sun-dest">
                    <Sparkles size={12} />
                    Next Nudge · {currentLabel}
                  </span>
                  <span className="rounded-full bg-ink-3 px-2.5 py-1 font-mono2 text-xs font-semibold text-paper">
                    {heroNudge.timeWindow}
                  </span>
                </div>

                <span className="font-mono2 text-xs text-mist">
                  {completedTodayCount} of {allDayNudges.length} done today
                </span>
              </div>

              <h1 className="mt-4 font-voice text-2xl leading-snug text-paper sm:text-3xl">
                {heroNudge.title}
              </h1>

              <p className="mt-2.5 text-sm leading-relaxed text-paper/90">
                {heroNudge.actionSummary}
              </p>

              <div className="mt-4 rounded-2xl border border-line/80 bg-ink/50 px-4 py-3 text-xs leading-relaxed text-mist">
                <span className="font-semibold text-paper">Why this matters for landing at 100%: </span>
                {heroNudge.whyItHelps}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleComplete(heroNudge.id)}
                  className="inline-flex items-center gap-2 rounded-xl bg-paper px-5 py-2.5 text-xs font-bold text-ink shadow-md transition-all hover:bg-white"
                >
                  <Check size={14} />
                  {completedIds.has(heroNudge.id)
                    ? "Completed — Undo"
                    : "Mark Nudge Done"}
                </button>

                <div className="flex items-center gap-2">
                  {phase !== "running" ? (
                    <button
                      type="button"
                      onClick={onStartCrewSync}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-ink-3 px-3.5 py-2 text-xs font-semibold text-mist transition-colors hover:border-mist hover:text-paper"
                    >
                      <Sparkles size={13} className="text-sun-dest" />
                      {locked.size > 0 ? "Re-verify with AI Crew" : "Run Live Crew Verification"}
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-2 rounded-xl border border-progress/40 bg-progress/10 px-3.5 py-2 text-xs font-semibold text-progress">
                      <span className="h-2 w-2 rounded-full bg-progress animate-pulse" />
                      Verifying schedule ({locked.size}/{days.length} days)…
                    </span>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Category Filter Pills (All / Sunlight / Run / Eat & Drink / Calendar / Sleep) */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: "All Nudges" },
                { id: "sunlight", label: "☀️ Sunlight" },
                { id: "run", label: "🏃 Run & Workout" },
                { id: "nutrition", label: "☕ Eat & Caffeine" },
                { id: "calendar", label: "📅 Calendar Moves" },
                { id: "sleep", label: "🌙 Sleep" },
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setCategoryFilter(pill.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  categoryFilter === pill.id
                    ? "border-paper bg-paper text-ink"
                    : "border-line bg-ink-2 text-mist hover:border-mist/50 hover:text-paper"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Clean Single-Column Stream of Today's Nudges */}
          <div className="flex flex-col gap-3">
            {filteredNudges.map((nudge) => {
              const meta = CATEGORY_META[nudge.category];
              const Icon = meta.Icon;
              const isDone = completedIds.has(nudge.id);
              const isMoveAccepted = acceptedMoves.has(nudge.id);

              return (
                <div
                  key={nudge.id}
                  className={`rounded-2xl border border-line border-l-4 ${meta.borderAccent} bg-ink-2 p-4 transition-all ${
                    isDone ? "opacity-60" : "hover:border-mist/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => toggleComplete(nudge.id)}
                        aria-label={`Mark ${nudge.title} as done`}
                        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          isDone
                            ? "border-pass bg-pass text-ink"
                            : "border-mist/50 bg-ink-3 text-transparent hover:border-paper"
                        }`}
                      >
                        <Check size={13} strokeWidth={3} />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold ${meta.badgeBg} ${meta.badgeText}`}
                          >
                            <Icon size={11} />
                            {meta.label}
                          </span>
                          <span className="font-mono2 text-xs font-bold text-paper">
                            {nudge.timeWindow}
                          </span>
                          <span className="text-2xs text-mist">
                            · {nudge.durationLabel}
                          </span>
                        </div>

                        <h3
                          className={`mt-1.5 text-sm font-bold ${
                            isDone ? "line-through text-mist" : "text-paper"
                          }`}
                        >
                          {nudge.title}
                        </h3>

                        <p className="mt-1 text-xs leading-relaxed text-paper/85">
                          {nudge.actionSummary}
                        </p>

                        {/* Interactive Calendar Move Action if this nudge is a calendar adjustment */}
                        {nudge.calendarMove && (
                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sun-home/25 bg-sun-home/10 px-3 py-2">
                            <div className="text-xs text-paper">
                              <span className="font-semibold">
                                {nudge.calendarMove.eventTitle}
                              </span>
                              :{" "}
                              <span className="font-mono2 text-mist">
                                {nudge.calendarMove.fromTime}
                              </span>{" "}
                              <ArrowRight
                                size={11}
                                className="inline text-sun-home"
                              />{" "}
                              <span className="font-mono2 font-bold text-paper">
                                {nudge.calendarMove.toTime}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleAcceptMove(nudge.id)}
                              className={`rounded-lg px-2.5 py-1 text-2xs font-bold transition-colors ${
                                isMoveAccepted
                                  ? "bg-pass/20 text-pass"
                                  : "bg-paper text-ink hover:bg-white"
                              }`}
                            >
                              {isMoveAccepted
                                ? "✓ Moved on Calendar"
                                : "Move on Calendar"}
                            </button>
                          </div>
                        )}

                        {nudge.citation && (
                          <div className="mt-2.5 flex items-center gap-1.5 text-2xs text-mist">
                            <BookOpen size={11} className="shrink-0 text-pass" />
                            <span className="truncate">
                              Why:{" "}
                              <a
                                href={
                                  nudge.citation.doi
                                    ? `https://doi.org/${nudge.citation.doi}`
                                    : nudge.citation.url
                                }
                                target="_blank"
                                rel="noreferrer"
                                className="underline decoration-line underline-offset-2 hover:text-paper"
                              >
                                {nudge.citation.title}
                              </a>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODE 2: DAY-BY-DAY SWIPEABLE / STEPPED CARD DECK */}
      {viewMode === "cards" && activeDaySpec && (
        <div className="rounded-3xl border border-line bg-ink-2 p-6 shadow-xl">
          {/* Card Deck Navigation Header */}
          <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
            <button
              type="button"
              disabled={activeDayIndex <= 0}
              onClick={() => {
                const prev = days[activeDayIndex - 1];
                if (prev) onSelectDay(prev.label);
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-line bg-ink-3 px-3 py-2 text-xs font-semibold text-paper transition-colors hover:border-mist disabled:opacity-35"
            >
              <ChevronLeft size={14} />
              Prev Day
            </button>

            <div className="text-center">
              <div className="text-2xs font-bold tracking-wider text-sun-dest uppercase">
                Day {activeDayIndex + 1} of {days.length} ·{" "}
                {formatDateReadable(activeDaySpec.date)}
              </div>
              <h2 className="mt-0.5 font-voice text-2xl text-paper">
                {activeDaySpec.dayIndex === trip?.departureDayIndex
                  ? `${activeDaySpec.label} · In-Flight Playbook`
                  : activeDaySpec.dayIndex > (trip?.departureDayIndex ?? 3)
                    ? `${activeDaySpec.label} · Landing at 100% in ${trip?.destination.name}`
                    : `${activeDaySpec.label} · Pre-Flight Shift`}
              </h2>
            </div>

            <button
              type="button"
              disabled={activeDayIndex >= days.length - 1}
              onClick={() => {
                const next = days[activeDayIndex + 1];
                if (next) onSelectDay(next.label);
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-line bg-ink-3 px-3 py-2 text-xs font-semibold text-paper transition-colors hover:border-mist disabled:opacity-35"
            >
              Next Day
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Cumulative Body-Clock Progress Bar */}
          <div className="mt-4 rounded-2xl border border-line bg-ink-3/60 p-3.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-paper">
                Body-Clock Alignment Progress
              </span>
              <span className="font-mono2 font-bold text-pass">
                {Math.min(100, Math.round(((activeDayIndex + 1) / Math.max(1, days.length)) * 100))}% shifted by end of {activeDaySpec.label}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink">
              <div
                className="h-full rounded-full bg-gradient-to-r from-sun-home via-sun-dest to-pass transition-all duration-300"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(((activeDayIndex + 1) / Math.max(1, days.length)) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>

          {/* Compact Checklist of Nudges on this Day Card */}
          <div className="mt-5 space-y-3">
            {allDayNudges.map((nudge) => {
              const meta = CATEGORY_META[nudge.category];
              const Icon = meta.Icon;
              const isDone = completedIds.has(nudge.id);

              return (
                <div
                  key={nudge.id}
                  onClick={() => toggleComplete(nudge.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggleComplete(nudge.id);
                    }
                  }}
                  className={`flex cursor-pointer items-start gap-3.5 rounded-2xl border p-4 transition-all ${
                    isDone
                      ? "border-pass/30 bg-pass/5 opacity-70"
                      : "border-line bg-ink-3/70 hover:border-mist/50"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${meta.badgeBg} ${meta.badgeText}`}
                  >
                    {isDone ? <Check size={16} /> : <Icon size={16} />}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-paper">
                        {nudge.title}
                      </span>
                      <span className="rounded-lg bg-ink-2 px-2.5 py-0.5 font-mono2 text-xs font-semibold text-sun-dest">
                        {nudge.timeWindow}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-mist">
                      {nudge.actionSummary}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
