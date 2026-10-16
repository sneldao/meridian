"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildDailyNudgesForDay,
  getFlightRecommendations,
  type NudgeCategory,
} from "@/domain/nudges";
import { previewPlan } from "@/domain/solver";
import {
  nowMinOnDay,
  pickNextStep,
  shiftLockedPct,
  todayDayIndex,
} from "@/domain/today";
import { ADHERENCE_PROFILE } from "@/domain/fixtures";
import type {
  AdherenceProfile,
  CalendarEvent,
  CalendarMove,
  Citation,
  DayPlan,
  EvalResult,
  Trip,
  WearableBaseline,
} from "@/domain/types";

export type GuideViewMode = "focus" | "cards" | "timeline";

export interface NudgeFeedScreenProps {
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
  /** The traveller's compliance floor + adherence profile. Optional until
   *  lane 3 (task 3.1) wires it through from /api/trip; until then the
   *  preview falls back to the fixture profile rather than no floor. */
  adherence?: AdherenceProfile;
  onOpenTripSetup: () => void;
  onStartCrewSync: () => void;
  /** D+1..D+4 daily touch: report how the selected day went — feeds replan. */
  onCheckIn?: (status: string) => void;
}

/** Consumer-facing day names — domain labels ("D-3", "D+1") stay internal
 *  keys; users see dates when we have them, or plain words otherwise. */
function friendlyDayLabel(d: { label: string; dayIndex: number; date: string }, departureDayIndex?: number): string {
  const dep = departureDayIndex ?? 3;
  if (d.dayIndex === dep) return "✈ Flight day";
  if (d.date) {
    const dt = new Date(`${d.date}T12:00:00`);
    if (!Number.isNaN(dt.getTime()))
      return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }
  return d.dayIndex < dep ? `Prep day ${d.dayIndex + 1}` : `Recovery day ${d.dayIndex - dep}`;
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
  adherence,
  onOpenTripSetup,
  onStartCrewSync,
  onCheckIn,
}: NudgeFeedScreenProps) {
  const effectiveAdherence = adherence ?? ADHERENCE_PROFILE;
  const [viewMode, setViewMode] = useState<GuideViewMode>("focus");
  const [defaultViewMode, setDefaultViewMode] = useState<GuideViewMode>("focus");
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [acceptedMoves, setAcceptedMoves] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState<NudgeCategory | "all">("all");
  const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);
  const [showMissed, setShowMissed] = useState(false);

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
  const currentDayName = activeDaySpec
    ? friendlyDayLabel(activeDaySpec, trip?.departureDayIndex)
    : "Prep day";

  const flightOptions = useMemo(
    () => (trip ? getFlightRecommendations(trip) : []),
    [trip],
  );
  const chosenFlight =
    flightOptions.find((f) => f.id === selectedFlightId) ??
    flightOptions.find((f) => f.recommended) ??
    flightOptions[0];

  // Solver-backed preview (PR 0 contract): what the crew would lock today,
  // without running the crew. Post-landing days and solver-infeasible days
  // are honestly null — the feed renders "not placed yet — personalise".
  const preview = useMemo(
    () =>
      trip
        ? previewPlan({
            trip,
            calendar: calendarEvents,
            adherence: effectiveAdherence,
            baseline,
          })
        : null,
    [trip, calendarEvents, effectiveAdherence, baseline],
  );

  const allDayNudges = useMemo(() => {
    if (!trip || !activeDaySpec) return [];
    const plan =
      locked.get(activeDaySpec.label) ??
      drafts.get(activeDaySpec.label)?.plan ??
      preview?.get(activeDaySpec.label)?.plan;
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
      adherence: effectiveAdherence,
    });
    return [...raw].sort(
      (a, b) =>
        CANONICAL_ORDER.indexOf(a.category) - CANONICAL_ORDER.indexOf(b.category),
    );
  }, [trip, activeDaySpec, locked, drafts, preview, baseline, calendarEvents, moves, citations, verdicts, rejected, memoryPath, effectiveAdherence]);

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
    if (fails) parts.push(`revised ${fails}×`);
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

  // "Your next step" — the first incomplete step by TIME, never by category
  // order. Windows whose end has passed collapse into "Missed". A day that
  // isn't today (at its own place — see dayPlace) has nothing missed.
  const isToday =
    !!trip &&
    !!activeDaySpec &&
    todayDayIndex(trip, new Date()) === activeDaySpec.dayIndex;
  const nowMin =
    trip && activeDaySpec && isToday
      ? nowMinOnDay(trip, activeDaySpec.dayIndex, new Date())
      : null;
  const { next: heroNudge, missed: missedNudges } = pickNextStep(
    allDayNudges,
    completedIds,
    nowMin,
  );
  const completedTodayCount = allDayNudges.filter((n) =>
    completedIds.has(n.id),
  ).length;
  const totalTodayCount = allDayNudges.length;
  const progressPct = totalTodayCount
    ? Math.round((completedTodayCount / totalTodayCount) * 100)
    : 0;
  const countdown = (() => {
    if (!heroNudge || nowMin === null) return null;
    const until = heroNudge.startMin - nowMin;
    if (until > 0) {
      const h = Math.floor(until / 60);
      const m = until % 60;
      return h > 0 ? `in ${h}h ${m}m` : `in ${m}m`;
    }
    const end =
      heroNudge.endMin < heroNudge.startMin
        ? heroNudge.endMin + 1440
        : heroNudge.endMin;
    return nowMin < end ? "now" : null;
  })();

  // Honest readiness: the share of the required shift the locked days cover
  // (sign-safe — eastbound shifts are negative). Before anything is locked,
  // the hero shows just the done count.
  const readinessPct = trip ? shiftLockedPct(trip, [...locked.values()]) : 0;

  const shiftHours = trip ? Math.abs(trip.requiredShiftMin / 60) : null;
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
    <>
      {/* Split-Horizon Hero Card */}
      <div className="hero rise" style={{ animationDelay: ".2s" }}>
        <div className="hl">
          <div className="bg term" aria-hidden="true">
            <svg viewBox="0 0 320 470" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              <circle className="tstar" cx="38" cy="42" r="1.1" />
              <circle className="tstar" cx="92" cy="24" r="0.8" />
              <circle className="tstar" cx="160" cy="52" r="1" />
              <circle className="tstar" cx="230" cy="30" r="0.9" />
              <circle className="tstar" cx="284" cy="66" r="1.2" />
              <circle className="tstar" cx="64" cy="96" r="0.8" />
              <circle className="tstar" cx="196" cy="88" r="0.7" />
              {/* the terminator — the body's day/night line crossing the frame */}
              <path className="tline" d="M-20 300 Q80 258 160 286 T340 250" />
              <circle className="tsun" cx="272" cy="268" r="5.5" />
              <circle className="thome" cx="52" cy="296" r="3.5" opacity="0.8" />
            </svg>
          </div>
          <div className="sc" />
          <div>
            <div className="route">Route</div>
            <div className="city">
              {trip
                ? `${trip.origin.name} (${trip.origin.code}) → ${trip.destination.name} (${trip.destination.code})`
                : "No trip set — personalise to plan one"}
            </div>
            <div className="stats">
              {shiftHours !== null && (
                <div className="stat">
                  <em>
                    {shiftHours}h {shiftDir}
                  </em>
                </div>
              )}
              <div className="stat">
                {readinessPct > 0 ? (
                  <>
                    <em>{readinessPct}%</em>of shift locked
                  </>
                ) : (
                  <>
                    <em>
                      {completedTodayCount}/{totalTodayCount}
                    </em>
                    done today
                  </>
                )}
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
            <b>Ideal flight window</b>
            <br />
            {chosenFlight
              ? `Departs ${chosenFlight.departsLocal} · Arrives ${chosenFlight.arrivesDest}`
              : "No flight window yet — personalise to see options"}
            <div className="acts">
              {ics && (
                <button type="button" className="btn" onClick={downloadIcs}>
                  Add .ics
                </button>
              )}
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
              <div className="mini">Your next step · {currentDayName}</div>
            </div>
          </div>

          {totalTodayCount === 0 ? (
            <>
              <h2>Not placed yet — personalise</h2>
              <p className="s">
                We couldn&apos;t honestly place this day against your calendar
                and baseline, so there are no invented times here — run the
                crew and it will draft this day with you.
              </p>
            </>
          ) : heroNudge ? (
            <>
              <span className="tw" style={{ alignSelf: "flex-start", fontSize: "15px", fontWeight: 800 }}>
                {countdown ?? ""}
                {countdown ? " · " : ""}
                {heroNudge.timeWindow}
              </span>
              <h2>{heroNudge.title}</h2>
              <p className="s">{heroNudge.actionSummary}</p>
              <div className="drawer">
                <b>Why this helps</b>
                <p>{heroNudge.whyItHelps}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleComplete(heroNudge.id)}
                style={{
                  alignSelf: "flex-start",
                  background: "linear-gradient(90deg, #D96B43, #e99a6f)",
                  color: "#fff8ef",
                  border: "none",
                  borderRadius: "999px",
                  padding: "10px 22px",
                  fontSize: "13px",
                  fontWeight: 800,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  marginTop: "2px",
                }}
              >
                Done
              </button>
              {missedNudges.length > 0 && (
                <div style={{ width: "100%" }}>
                  <button
                    type="button"
                    onClick={() => setShowMissed((v) => !v)}
                    aria-expanded={showMissed}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: "#7a6a5c",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    Missed ({missedNudges.length}) {showMissed ? "▲" : "▼"}
                  </button>
                  {showMissed && (
                    <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
                      {missedNudges.map((m) => (
                        <li
                          key={m.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            gap: "10px",
                            padding: "6px 0",
                            borderTop: "1px solid #eee3d6",
                            fontSize: "12px",
                            color: "#7a6a5c",
                          }}
                        >
                          <span>
                            {m.timeWindow.split("–")[0].trim()} · {m.title}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleComplete(m.id)}
                            style={{
                              background: "transparent",
                              border: "1px solid #e3d5c3",
                              borderRadius: 999,
                              padding: "3px 10px",
                              fontSize: "11px",
                              fontWeight: 700,
                              color: "#5b4d41",
                              cursor: "pointer",
                            }}
                          >
                            Done
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <h2>All done today ✓</h2>
              <p className="s">
                Every step is marked done — the rest of the shift happens
                tonight, on the plan you kept.
              </p>
            </>
          )}

          {totalTodayCount > 0 && (
            <div className="meter">
              <div className="t">
                {completedTodayCount} of {totalTodayCount} done today
              </div>
              <div className="bar">
                <i style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}

          <div className="cta">
            <button
              type="button"
              className="p2"
              onClick={onStartCrewSync}
              disabled={phase === "running"}
            >
              {phase === "running"
                ? `Checking your plan (${locked.size}/${days.length})…`
                : "Personalise with the crew"}
            </button>
          </div>
          {phase === "idle" && totalTodayCount > 0 && (
            <p style={{ marginTop: "8px", fontSize: "11px", color: "#7a6a5c" }}>
              This is the solver&apos;s preview — the same placement the crew
              would lock. Personalise and every step is tailored to your
              calendar and baseline.
            </p>
          )}
        </div>
      </div>

      {/* Day Selector Pills — real trip days only, never invented fixture dates */}
      {days.length > 0 && (
        <div
          className="row days rise"
          style={{ animationDelay: ".3s" }}
          role="group"
          aria-label="Select trip day"
        >
          {days.map((d) => {
            const isFlight = d.dayIndex === trip?.departureDayIndex;
            const isSelected = d.label === currentLabel;
            return (
              <button
                key={d.dayIndex}
                type="button"
                onClick={() => onSelectDay(d.label)}
                aria-pressed={isSelected}
                className={`day ${isSelected ? "on" : ""}`}
              >
                {isFlight ? "✈️ Fly" : friendlyDayLabel(d, trip?.departureDayIndex)}
              </button>
            );
          })}
        </div>
      )}

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

      {/* Daily check-in — the thumb-sized touch that keeps the plan honest */}
      {phase === "done" && onCheckIn && (
        <div
          className="card rise"
          style={{
            marginTop: "12px",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#5b4d41" }}>
            How did {currentDayName} go?
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            {(["done", "partial", "skipped"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onCheckIn(s)}
                style={{
                  border: "1px solid #e3d5c3",
                  background: s === "done" ? "#D96B43" : "#fff8ef",
                  color: s === "done" ? "#fff8ef" : "#5b4d41",
                  borderRadius: 999,
                  padding: "8px 14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {s === "done" ? "Did it ✓" : s === "partial" ? "Partly" : "Skipped"}
              </button>
            ))}
          </span>
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
          onClick={() => setViewMode("timeline")}
          className="mini"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: viewMode === "timeline" ? "#D96B43" : "#7a6a5c",
          }}
        >
          · Timeline{defaultViewMode === "timeline" ? " ★" : ""}
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
            <strong style={{ fontSize: "15px" }}>{currentDayName}</strong>
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

      {/* Timeline — one line per move, the day as a rail not a grid */}
      {viewMode === "timeline" && (
        <div className="card rise" style={{ animationDelay: ".4s", marginTop: "14px", padding: "18px 20px" }}>
          {filteredNudges.map((nudge, i) => {
            const isDone = completedIds.has(nudge.id);
            return (
              <button
                key={nudge.id}
                type="button"
                onClick={() => toggleComplete(nudge.id)}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "12px",
                  width: "100%",
                  padding: "10px 0",
                  border: "none",
                  borderTop: i === 0 ? "none" : "1px solid #eee3d6",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  color: isDone ? "#b7ab9d" : "#5b4d41",
                }}
              >
                <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 800, fontSize: "13px", minWidth: "72px", color: isDone ? "#b7ab9d" : "#D96B43" }}>
                  {nudge.timeWindow.split("–")[0].trim()}
                </span>
                <span style={{ flex: 1, fontSize: "13px", fontWeight: 600, textDecoration: isDone ? "line-through" : "none" }}>
                  {nudge.title}
                </span>
                <span style={{ fontSize: "11px", color: "#7a6a5c" }}>
                  {isDone ? "done ✓" : nudge.durationLabel}
                </span>
              </button>
            );
          })}
          {filteredNudges.length === 0 && (
            <p style={{ fontSize: "12px", color: "#7a6a5c" }}>
              Not placed yet — personalise.
            </p>
          )}
        </div>
      )}

      {/* Two-Column Sunlit Horizon Bento Deck */}
      {viewMode !== "timeline" && (
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
                      <div className="evrow">
                        <span className="evchip" style={{ background: "transparent", border: "none", padding: "3px 0" }}>
                          checked by Iris · planned by Otto
                        </span>
                        {nudge.evidence.evalVerdict && (
                          <span className={`evchip ${nudge.evidence.evalVerdict.violations.length ? "warn" : "pass"}`}>
                            check {nudge.evidence.evalVerdict.score.toFixed(2)}
                          </span>
                        )}
                        {nudge.evidence.draftRejected && (
                          <span className="evchip warn">revised once</span>
                        )}
                        {nudge.citation && (
                          <span className="evchip cite" title={nudge.citation.title}>
                            ◈ {nudge.citation.title.length > 48
                              ? `${nudge.citation.title.slice(0, 46)}…`
                              : nudge.citation.title}
                          </span>
                        )}
                        {nudge.evidence.memoryPath && (
                          <span className="evchip mem" title={nudge.evidence.memoryPath}>
                            ↝ trip memory
                          </span>
                        )}
                        {nudge.evidence.evalVerdict?.violations.length ? (
                          <span style={{ width: "100%", fontSize: "10px", color: "#b04523" }}>
                            {nudge.evidence.evalVerdict.violations.join("; ")}
                          </span>
                        ) : null}
                      </div>
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
      )}
    </>
  );
}
