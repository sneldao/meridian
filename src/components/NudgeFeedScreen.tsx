"use client";

import { useEffect, useMemo, useState } from "react";
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
  EvalResult,
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
  drafts: Map<string, { plan: DayPlan; attempt?: number }>;
  /** Per-day scorer verdicts — the "why" expander's evidence row. */
  verdicts: Map<string, EvalResult[]>;
  /** Days rejected at least once before locking. */
  rejected: Set<string>;
  /** Latest graph-memory hop path the crew consulted — evidence row. */
  memoryPath?: string;
  /** Guided depth: open every "why" drawer without tapping. */
  expandAllWhy?: boolean;
  baseline?: WearableBaseline;
  calendarEvents: CalendarEvent[];
  moves: CalendarMove[];
  citations: Citation[];
  ics?: string;
  selectedFlightId: string;
  onOpenTripSetup: () => void;
  onStartCrewSync: () => void;
}

const CANONICAL_ORDER: NudgeCategory[] = [
  "sunlight",
  "run",
  "nutrition",
  "calendar",
  "sleep",
  "flight",
];

export function NudgeFeedScreen({
  trip,
  phase,
  selectedDayLabel,
  onSelectDay,
  locked,
  drafts,
  verdicts,
  rejected,
  memoryPath,
  expandAllWhy,
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
  const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);

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
    const raw = buildDailyNudgesForDay({
      trip,
      dayIndex: activeDaySpec.dayIndex,
      plan,
      baseline,
      calendarEvents,
      moves,
      citations,
      verdicts: verdicts.get(activeDaySpec.label),
      dayRejected: rejected.has(activeDaySpec.label) || (verdicts.get(activeDaySpec.label) ?? []).some((v) => !v.feasible),
      memoryPath,
    });
    return [...raw].sort(
      (a, b) =>
        CANONICAL_ORDER.indexOf(a.category) - CANONICAL_ORDER.indexOf(b.category),
    );
  }, [trip, activeDaySpec, locked, drafts, baseline, calendarEvents, moves, citations, verdicts, rejected, memoryPath]);

  // Guided ribbon — the day's crew beats, distilled to one line. Only real
  // events, never reconstructed.
  const dayBeat = useMemo(() => {
    if (!activeDaySpec) return null;
    const vs = verdicts.get(activeDaySpec.label) ?? [];
    if (!vs.length && !memoryPath) return null;
    const parts: string[] = [];
    const nAttempts = Math.max(vs.length, drafts.get(activeDaySpec.label)?.attempt ?? 0);
    if (nAttempts) parts.push(`drafted ${nAttempts}×`);
    const fails = vs.filter((v) => !v.feasible).length;
    if (fails) parts.push(`scorer rejected ${fails}×`);
    const latest = vs.at(-1);
    if (locked.has(activeDaySpec.label) && latest)
      parts.push(`locked at ${latest.score.toFixed(2)}`);
    if (memoryPath) parts.push("trip memory consulted");
    return parts.length ? `Crew: ${parts.join(" · ")}` : null;
  }, [activeDaySpec, verdicts, drafts, locked, memoryPath]);

  const filteredNudges = useMemo(() => {
    if (categoryFilter === "all") return allDayNudges;
    return allDayNudges.filter((n) => n.category === categoryFilter);
  }, [allDayNudges, categoryFilter]);

  const heroNudge: TravelerNudge | undefined =
    allDayNudges.find((n) => !completedIds.has(n.id)) ?? allDayNudges[0];

  const completedTodayCount = allDayNudges.filter((n) =>
    completedIds.has(n.id),
  ).length;
  const totalTodayCount = Math.max(1, allDayNudges.length);
  const progressPct = Math.max(
    6,
    Math.round((completedTodayCount / totalTodayCount) * 100),
  );

  const shiftHours = trip ? Math.abs(trip.requiredShiftMin / 60) : 8;
  const shiftDir = trip?.direction === "east" ? "East" : "West";

  const downloadIcs = () => {
    const content =
      ics ||
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Meridian//Circadian Shift//EN",
        "END:VCALENDAR",
      ].join("\r\n");
    const blob = new Blob([content], { type: "text/calendar" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "meridian-shift-plan.ics";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      {/* Split-Horizon Hero Card */}
      <div className="hero rise" style={{ animationDelay: ".2s" }}>
        <div className="hl">
          <img
            className="bg"
            src="https://media.base44.com/images/public/6ad11b6b2adaa10aea07a19e/26e2d4a80_generated_99b9bdd8.jpg"
            alt="Sunlit architectural shadow study"
          />
          <div className="sc" />
          <div>
            <div className="route">Route</div>
            <div className="city">
              {trip
                ? `${trip.origin.name} (${trip.origin.code}) → ${trip.destination.name} (${trip.destination.code})`
                : "London (LHR) → Tokyo (HND)"}
            </div>
            <div className="stats">
              <div className="stat">
                <em>
                  {shiftHours}h {shiftDir}
                </em>
              </div>
              <div className="stat">
                <em>{chosenFlight ? `${chosenFlight.landingReadinessPct}%` : "92%"}</em>
                arrival readiness
              </div>
            </div>
          </div>

          <svg className="arc" viewBox="0 0 320 110" aria-hidden="true">
            <path
              d="M10 95 Q160 -25 310 80"
              fill="none"
              stroke="#f3c9a8"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="10" cy="95" r="6" fill="#F5EFE6" />
            <circle cx="310" cy="80" r="6" fill="#D96B43" />
          </svg>

          <div className="flt">
            <b>Target flight</b>
            <br />
            {chosenFlight
              ? `Departs ${chosenFlight.departsLocal} · Arrives ${chosenFlight.arrivesDest}`
              : "Departs 11:20 · Arrives 07:50 (+1)"}
            <div className="acts">
              <button type="button" className="btn" onClick={downloadIcs}>
                Add .ics
              </button>
              <button type="button" className="btn" onClick={onOpenTripSetup}>
                Flight &amp; Setup
              </button>
            </div>
          </div>
        </div>

        <div className="hr">
          <div className="row">
            <div className="badge">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#fff"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <circle cx="12" cy="12" r="4" fill="#fff" />
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
              </svg>
            </div>
            <div>
              <div className="mini">Next Nudge · {currentLabel}</div>
            </div>
          </div>

          <span className="tw" style={{ alignSelf: "flex-start" }}>
            {heroNudge ? heroNudge.timeWindow : "07:00 – 07:35"}
          </span>

          <h2>
            {heroNudge
              ? heroNudge.title
              : "Get Direct Morning Sunlight on Your Face"}
          </h2>

          <p className="s">
            {heroNudge
              ? heroNudge.actionSummary
              : "Step outside within 20 min of waking (07:00). Get 30 min of natural sky light on your eyes."}
          </p>

          <div className="drawer">
            <b>Why this matters for landing at 100%</b>
            <p>
              {heroNudge
                ? heroNudge.whyItHelps
                : "Morning light anchors your body clock for the shift ahead."}
            </p>
          </div>

          <div className="meter">
            <div className="t">
              {completedTodayCount} of {allDayNudges.length || 5} done today
            </div>
            <div className="bar">
              <i style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          <div className="cta">
            <button
              type="button"
              className="p1"
              onClick={() => heroNudge && toggleComplete(heroNudge.id)}
            >
              {heroNudge && completedIds.has(heroNudge.id)
                ? "Completed — Undo"
                : "Mark Nudge Done"}
            </button>
            <button
              type="button"
              className="p2"
              onClick={onStartCrewSync}
              disabled={phase === "running"}
            >
              {phase === "running"
                ? `Verifying (${locked.size}/${days.length || 5})…`
                : "Run Live Crew Verification"}
            </button>
          </div>
        </div>
      </div>

      {/* Day Selector Pills */}
      <div
        className="row days rise"
        style={{ animationDelay: ".3s" }}
        role="group"
        aria-label="Select trip day"
      >
        {(days.length > 0
          ? days
          : [
              { dayIndex: 0, label: "D-2", date: "2026-10-16" },
              { dayIndex: 1, label: "D-1", date: "2026-10-17" },
              { dayIndex: 2, label: "D0", date: "2026-10-18" },
              { dayIndex: 3, label: "D+1", date: "2026-10-19" },
              { dayIndex: 4, label: "D+2", date: "2026-10-20" },
            ]
        ).map((d) => {
          const isFlight =
            trip ? d.dayIndex === trip.departureDayIndex : d.label === "D0";
          const isSelected = d.label === currentLabel;
          return (
            <button
              key={d.dayIndex}
              type="button"
              onClick={() => onSelectDay(d.label)}
              aria-pressed={isSelected}
              className={`day ${isSelected ? "on" : ""}`}
            >
              {isFlight ? "✈️ Fly" : d.label}
            </button>
          );
        })}
      </div>

      {/* Guided ribbon — the day's crew beats in one line */}
      {dayBeat && (
        <div
          className="rise"
          style={{
            marginTop: "8px",
            fontSize: "11px",
            fontWeight: 600,
            color: "#7a6a5c",
            letterSpacing: "0.02em",
          }}
        >
          {dayBeat}
        </div>
      )}

      {/* Category Filter Chips */}
      <div className="row chips rise" style={{ animationDelay: ".35s" }}>
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
            className={`chip ${categoryFilter === pill.id ? "on" : ""}`}
          >
            {pill.label}
          </button>
        ))}
      </div>

      {/* Experience View Switcher Row */}
      <div className="row" style={{ marginTop: "14px" }}>
        <button
          type="button"
          onClick={() => setViewMode("focus")}
          className="mini"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: viewMode === "focus" ? "#D96B43" : "#7a6a5c",
          }}
        >
          Today&apos;s Focus Feed{defaultViewMode === "focus" ? " ★" : ""}
        </button>
        <button
          type="button"
          onClick={() => setViewMode("cards")}
          className="mini"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: viewMode === "cards" ? "#D96B43" : "#7a6a5c",
          }}
        >
          · Day-by-Day Cards{defaultViewMode === "cards" ? " ★" : ""}
        </button>
        <button
          type="button"
          onClick={() => handleSetDefaultView(viewMode)}
          className="btn view"
        >
          {defaultViewMode === viewMode
            ? "Default view ★"
            : "Set as default view"}
        </button>
      </div>

      {/* Day-by-Day Card Deck Stepper Header when viewMode === "cards" */}
      {viewMode === "cards" && days.length > 0 && (
        <div
          className="card rise"
          style={{
            marginTop: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
          }}
        >
          <button
            type="button"
            className="btn"
            disabled={activeDayIndex <= 0}
            onClick={() => {
              const prev = days[activeDayIndex - 1];
              if (prev) onSelectDay(prev.label);
            }}
          >
            ← Prev Day
          </button>
          <div style={{ textAlign: "center" }}>
            <div className="mini">
              Day {activeDayIndex + 1} of {days.length} · {currentLabel}
            </div>
            <strong style={{ fontSize: "15px" }}>
              {Math.min(
                100,
                Math.round(((activeDayIndex + 1) / Math.max(1, days.length)) * 100),
              )}
              % body-clock shift aligned
            </strong>
          </div>
          <button
            type="button"
            className="btn"
            disabled={activeDayIndex >= days.length - 1}
            onClick={() => {
              const next = days[activeDayIndex + 1];
              if (next) onSelectDay(next.label);
            }}
          >
            Next Day →
          </button>
        </div>
      )}

      {/* Two-Column Sunlit Horizon Bento Deck */}
      <div className="deck rise" style={{ animationDelay: ".4s" }}>
        {filteredNudges.map((nudge) => {
          const isDone = completedIds.has(nudge.id);
          const isMoveAccepted = acceptedMoves.has(nudge.id);
          const isSleep = nudge.category === "sleep" && categoryFilter === "all";
          const isGreen =
            nudge.category === "run" || nudge.category === "sleep";
          const isDark = nudge.category === "nutrition";
          const isExpanded = expandAllWhy || expandedWhyId === nudge.id;

          let barWidth = "40%";
          if (nudge.category === "run") barWidth = "55%";
          else if (nudge.category === "nutrition") barWidth = "70%";
          else if (nudge.category === "calendar") barWidth = "30%";
          else if (nudge.category === "sleep") barWidth = "85%";

          const categoryLabel =
            nudge.category === "sunlight"
              ? "Sunlight on Face"
              : nudge.category === "run"
                ? "Run & Movement"
                : nudge.category === "nutrition"
                  ? "Eat, Hydrate & Caffeine"
                  : nudge.category === "calendar"
                    ? "Calendar Move"
                    : "Sleep & Wind-Down";

          const displayTitle =
            nudge.category === "calendar" && nudge.calendarMove
              ? `Move "${nudge.calendarMove.eventTitle}" ${nudge.calendarMove.fromTime} → ${nudge.calendarMove.toTime}`
              : nudge.category === "sleep" && nudge.title.includes("·")
                ? nudge.title.split("·")[1].trim()
                : nudge.category === "nutrition"
                  ? "Hard Caffeine Cutoff & Meal Timing"
                  : nudge.category === "run" && nudge.title.includes("(Zone 2)")
                    ? "Easy Outdoor Morning Run Zone 2"
                    : nudge.title;

          const meterLabel =
            nudge.category === "nutrition"
              ? nudge.timeWindow.split(" · ")[0]
              : nudge.timeWindow;

          const conciseCopy =
            nudge.category === "nutrition"
              ? nudge.timeWindow.split(" · ")[1] ?? nudge.durationLabel
              : nudge.category === "sleep" && nudge.title.includes("·")
                ? nudge.title.split("·")[0].trim()
                : nudge.durationLabel;

          return (
            <div
              key={nudge.id}
              className={`tile ${isSleep ? "sleep-span" : ""}`}
              style={
                isSleep
                  ? {
                      gridColumn: "span 2",
                      flexDirection: "row",
                      opacity: isDone ? 0.72 : 1,
                    }
                  : { opacity: isDone ? 0.72 : 1 }
              }
            >
              {nudge.category === "sunlight" && <div className="ph0" />}
              {nudge.category === "run" && (
                <img
                  className="ph"
                  src="https://media.base44.com/images/public/6ad11b6b2adaa10aea07a19e/4c15ad0bd_generated_216402a0.jpg"
                  alt="Runner"
                />
              )}
              {nudge.category === "nutrition" && (
                <img
                  className="ph"
                  src="https://media.base44.com/images/public/6ad11b6b2adaa10aea07a19e/f72dab12f_generated_cd22342b.jpg"
                  alt="Espresso"
                />
              )}
              {nudge.category === "calendar" && (
                <div
                  className="ph0"
                  style={{
                    background: "linear-gradient(135deg,#e8c9a5,#a8431e)",
                  }}
                />
              )}
              {nudge.category === "sleep" && (
                <img
                  className="ph"
                  style={
                    isSleep
                      ? { width: "280px", height: "auto", flex: "none" }
                      : undefined
                  }
                  src="https://media.base44.com/images/public/6ad11b6b2adaa10aea07a19e/a8e64f944_generated_4b979429.jpg"
                  alt="Evening linen"
                />
              )}

              <div className="tb">
                <div className={`cat ${isGreen ? "g" : ""}`}>
                  {categoryLabel}
                </div>
                <h3>{displayTitle}</h3>
                <div className="meter">
                  <div className="t">{meterLabel}</div>
                  <div
                    className={`bar ${isGreen ? "g" : ""} ${isDark ? "d" : ""}`}
                  >
                    <i
                      style={
                        nudge.category === "sunlight"
                          ? { width: barWidth, marginLeft: 0 }
                          : { width: barWidth }
                      }
                    />
                  </div>
                </div>
                {nudge.category !== "calendar" && <p>{conciseCopy}</p>}

                {isExpanded && (
                  <div className="drawer" style={{ marginTop: "4px" }}>
                    <b>Why this helps</b>
                    <p>{nudge.actionSummary}</p>
                    <p>{nudge.whyItHelps}</p>
                    {nudge.evidence ? (
                      <p style={{ marginTop: "6px", fontSize: "11px", color: "#7a6a5c" }}>
                        <b>From the crew:</b>{" "}
                        {nudge.evidence.draftRejected
                          ? "scorer rejected an earlier draft, then "
                          : ""}
                        scored {nudge.evidence.evalVerdict?.score.toFixed(2)} by the
                        circadian gate
                        {nudge.evidence.evalVerdict?.violations.length
                          ? ` — flagged: ${nudge.evidence.evalVerdict.violations.join("; ")}`
                          : " — no violations"}
                        {nudge.citation ? ` · backed by ${nudge.citation.title}` : ""}
                        {nudge.evidence.memoryPath
                          ? ` · memory: ${nudge.evidence.memoryPath}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                )}

                <div className="tk">
                  {nudge.category === "calendar" ? (
                    <button
                      type="button"
                      className="p1"
                      onClick={() => toggleAcceptMove(nudge.id)}
                    >
                      {isMoveAccepted
                        ? "✓ Moved on Calendar"
                        : "Move on Calendar"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedWhyId(isExpanded ? null : nudge.id)
                      }
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        fontSize: "11px",
                        fontWeight: 700,
                        color: "#7a6a5c",
                        cursor: "pointer",
                      }}
                    >
                      {isExpanded ? "Hide details" : "Why & details"}
                    </button>
                  )}

                  <label className="chk" aria-label={`Mark ${nudge.title} done`}>
                    <input
                      type="checkbox"
                      checked={isDone}
                      onChange={() => toggleComplete(nudge.id)}
                    />
                  </label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
