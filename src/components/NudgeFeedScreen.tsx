"use client";

import { useEffect, useMemo, useState } from "react";
import { coverageOf, fmtMin } from "@/domain/circadian";
import { buildDailyNudgesForDay, stepImpactMin, type NudgeCategory } from "@/domain/nudges";
import { previewPlan } from "@/domain/solver";
import {
  dayPlace,
  nowMinOnDay,
  pickNextStep,
  shiftLockedPct,
  todayDayIndex,
} from "@/domain/today";
import { ADHERENCE_PROFILE } from "@/domain/fixtures";
import { HeroDawnPanel } from "@/components/HeroDawnPanel";
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
  /** The traveller's compliance floor + adherence profile. Optional because
   *  `TripData.adherence` is itself optional at the caller (`page.tsx:43`), so
   *  the feed falls back to the fixture profile during the `/api/trip` window. */
  adherence?: AdherenceProfile;
  /** "fixture" = the sample traveller's numbers. Shown on Today, not only in
   *  the setup sheet, so a first-time visitor knows the plan is sample data. */
  baselineSource?: "fixture" | "garmin";
  onStartCrewSync: () => void;
  /** D+1..D+4 daily touch: report how the selected day went — feeds replan. */
  onCheckIn?: (status: string) => void;
}

/** Consumer-facing day names — domain labels ("D-3", "D+1") stay internal
 *  keys; users see dates when we have them, or plain words otherwise. The
 *  flight day keeps its ✈ but shows its date, so nothing on screen is a
 *  relative offset the traveller has to decode. */
function friendlyDayLabel(
  d: { label: string; dayIndex: number; date: string },
  departureDayIndex?: number,
): string {
  const dep = departureDayIndex ?? 3;
  let dateLabel = "";
  if (d.date) {
    const dt = new Date(`${d.date}T12:00:00`);
    if (!Number.isNaN(dt.getTime()))
      dateLabel = dt.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
  }
  if (d.dayIndex === dep) return dateLabel ? `✈ ${dateLabel}` : "✈ Flight day";
  if (dateLabel) return dateLabel;
  return d.dayIndex < dep ? `Prep day ${d.dayIndex + 1}` : `Recovery day ${d.dayIndex - dep}`;
}

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
  adherence,
  baselineSource,
  onStartCrewSync,
  onCheckIn,
}: NudgeFeedScreenProps) {
  const effectiveAdherence = adherence ?? ADHERENCE_PROFILE;
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [expandedWhyId, setExpandedWhyId] = useState<string | null>(null);
  const [showMissed, setShowMissed] = useState(false);

  // Trip-scoped persistence — ids are day-label-keyed, so a different trip
  // must not inherit another trip's "done" state.
  const completedKey = trip
    ? `${trip.origin.code}-${trip.destination.code}-${trip.days[0]?.date ?? ""}`
    : "none";

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = localStorage.getItem(`meridian:completedNudges:${completedKey}`);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) setCompletedIds(new Set(parsed));
        }
      } catch {
        /* ignore */
      }
    }, 0);
    return () => clearTimeout(t);
  }, [completedKey]);

  const toggleComplete = (id: string) => {
    setCompletedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(`meridian:completedNudges:${completedKey}`, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
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

  // The city a step's time belongs to: origin-local through the flight day,
  // destination-local after it.
  const cityFor = (dayIndex: number) =>
    trip ? dayPlace(trip, dayIndex).city : "";

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

  // Days after the flight are always null in the preview — they're planned
  // after landing. What the pre-flight days banked shows as the residual.
  const isPostFlightDay =
    !!trip && !!activeDaySpec && activeDaySpec.dayIndex > trip.departureDayIndex;
  const landedResidualMin = useMemo(() => {
    let last: number | null = null;
    preview?.forEach((s) => {
      if (s?.result.coverage) last = s.result.coverage.residualMin;
    });
    return last;
  }, [preview]);
  const landedResidualHours =
    landedResidualMin !== null ? Math.round(landedResidualMin / 60) : null;

  // What the body still owes the destination — the gap the hero draws. Before a
  // run it is the preview chain's residual at landing; once the crew locks days
  // it is measured from the real plan, so the ghost curve closes as you go.
  const lockedDays = useMemo(() => [...locked.values()], [locked]);
  const dawnOwedMin = useMemo(() => {
    if (!trip) return 0;
    if (lockedDays.length) return coverageOf(trip, lockedDays).residualMin;
    return landedResidualMin ?? Math.abs(trip.requiredShiftMin);
  }, [trip, lockedDays, landedResidualMin]);

  // One view: the day as a rail, in the order you live it.
  const steps = useMemo(() => {
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
    return [...raw].sort((a, b) => a.startMin - b.startMin);
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
    if (locked.has(activeDaySpec.label) && latest) parts.push("locked");
    if (memoryPath) parts.push("your trip memory was used");
    return parts.length ? `Crew: ${parts.join(" · ")}` : null;
  }, [activeDaySpec, verdicts, drafts, locked, memoryPath]);

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
    steps,
    completedIds,
    nowMin,
  );
  // Only a light step has a beam for the panel to place on the curve.
  const heroBeam =
    heroNudge?.category === "sunlight"
      ? {
          dayIndex: heroNudge.dayIndex,
          startMin: heroNudge.startMin,
          endMin: heroNudge.endMin,
        }
      : null;
  const completedCount = steps.filter((n) => completedIds.has(n.id)).length;
  const totalSteps = steps.length;
  const progressPct = totalSteps
    ? Math.round((completedCount / totalSteps) * 100)
    : 0;
  // The plan behind the day's steps, for the impact copy below.
  const activePlan = activeDaySpec
    ? (locked.get(activeDaySpec.label) ??
      drafts.get(activeDaySpec.label)?.plan ??
      preview?.get(activeDaySpec.label)?.plan)
    : undefined;
  // Impact in arrival units. A hold day (or a step with no shift behind it)
  // says what it does instead of "0 min".
  const impactCopy = (category: NudgeCategory, verb: "done" | "missed") => {
    const n = activePlan ? stepImpactMin(activePlan, category) : 0;
    if (n <= 0) return "keeps the rhythm steady";
    return verb === "done" ? `dawn moved ~${n} min closer` : `skip costs ~${n} min`;
  };
  const doneWhere = isToday ? " today" : "";
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

  return (
    <>
      {/* Split-Horizon Hero Card — the left panel is the trip's real dawn line:
          body clock against destination, with the next light window on it. */}
      <div className="hero rise" style={{ animationDelay: ".2s" }}>
        {trip && (
          <HeroDawnPanel
            trip={trip}
            owedMin={dawnOwedMin}
            beam={heroBeam}
            readinessPct={readinessPct}
          />
        )}

        {baselineSource === "fixture" && (
          <p className="demo-tag">
            Sample traveller — these numbers are not your measurements.
          </p>
        )}

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

          {totalSteps === 0 ? (
            isPostFlightDay ? (
              <>
                <h2>Planned with you after you land</h2>
                <p className="s">
                  The days before your flight bank what they can
                  {landedResidualHours !== null &&
                    ` — you land about ${landedResidualHours}h short of ${trip?.destination.name ?? "your destination"} time`}{" "}
                  and the crew finishes the plan once you&apos;re down.
                </p>
              </>
            ) : (
              <>
                <h2>Not placed yet — personalise</h2>
                <p className="s">
                  We couldn&apos;t honestly place this day against your calendar
                  and baseline, so there are no invented times here — run the
                  crew and it will draft this day with you.
                </p>
              </>
            )
          ) : heroNudge ? (
            <>
              <span className="tw" style={{ alignSelf: "flex-start", fontSize: "15px", fontWeight: 800 }}>
                {countdown ?? ""}
                {countdown ? " · " : ""}
                {fmtMin(heroNudge.startMin)} {cityFor(heroNudge.dayIndex)}
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
                aria-pressed={completedIds.has(heroNudge.id)}
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
                {completedIds.has(heroNudge.id) ? "Done ✓" : "Done"}
              </button>
              {completedIds.has(heroNudge.id) && (
                <p style={{ margin: 0, fontSize: "12px", color: "#7a6a5c" }}>
                  Done — {impactCopy(heroNudge.category, "done")}.
                </p>
              )}
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
                            {fmtMin(m.startMin)} {cityFor(m.dayIndex)} · {m.title}
                            <span style={{ display: "block", fontSize: "11px" }}>
                              {impactCopy(m.category, "missed")}
                            </span>
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
              <h2>All done{doneWhere} ✓</h2>
              <p className="s">
                Every step is marked done — the rest of the shift happens
                tonight, on the plan you kept.
              </p>
            </>
          )}

          {totalSteps > 0 && (
            <div className="meter">
              <div className="t">
                {completedCount} of {totalSteps} done{doneWhere}
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
          {phase === "idle" && totalSteps > 0 && (
            <p style={{ marginTop: "8px", fontSize: "11px", color: "#7a6a5c" }}>
              These are the times the crew would lock — personalise and every
              step is fitted to your calendar and how you have actually been
              sleeping.
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
            const isSelected = d.label === currentLabel;
            return (
              <button
                key={d.dayIndex}
                type="button"
                onClick={() => onSelectDay(d.label)}
                aria-pressed={isSelected}
                className={`day ${isSelected ? "on" : ""}`}
              >
                {friendlyDayLabel(d, trip?.departureDayIndex)}
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

      {/* The rail — one line per step, in the order the day happens */}
      <section className="tl rise" style={{ animationDelay: ".4s" }} aria-label={`${currentDayName} — steps`}>
        {steps.map((step) => {
          const isDone = completedIds.has(step.id);
          const isOpen = !!expandAllWhy || expandedWhyId === step.id;
          const city = cityFor(step.dayIndex);
          return (
            <div key={step.id} className={`tl-row${isDone ? " done" : ""}`}>
              <div className="tl-time">
                <b>{fmtMin(step.startMin)}</b>
                <span>{city}</span>
              </div>
              <div className="tl-body">
                <h3 className="tl-title">{step.title}</h3>
                <div className="tl-acts">
                  <button
                    type="button"
                    className="tl-done"
                    onClick={() => toggleComplete(step.id)}
                    aria-pressed={isDone}
                  >
                    {isDone ? "Done ✓" : "Done"}
                  </button>
                  {!expandAllWhy && (
                    <button
                      type="button"
                      className="tl-why"
                      onClick={() =>
                        setExpandedWhyId(isOpen ? null : step.id)
                      }
                      aria-expanded={isOpen}
                    >
                      {isOpen ? "Hide details" : "Why & details"}
                    </button>
                  )}
                </div>
                {isDone && (
                  <p style={{ margin: "4px 0 0", fontSize: "12px", color: "#7a6a5c" }}>
                    Done — {impactCopy(step.category, "done")}.
                  </p>
                )}
                {isOpen && (
                  <div className="drawer tl-drawer">
                    <b>
                      {step.timeWindow} · {city}
                    </b>
                    <p>{step.actionSummary}</p>
                    <p>{step.whyItHelps}</p>
                    {step.evidence ? (
                      <div className="evrow">
                        <span className="evchip" style={{ background: "transparent", border: "none", padding: "3px 0" }}>
                          checked by Iris · planned by Otto
                        </span>
                        {step.evidence.evalVerdict && (
                          <span className={`evchip ${step.evidence.evalVerdict.violations.length ? "warn" : "pass"}`}>
                            check {step.evidence.evalVerdict.score.toFixed(2)}
                          </span>
                        )}
                        {step.evidence.draftRejected && (
                          <span className="evchip warn">revised once</span>
                        )}
                        {step.citation && (
                          <span className="evchip cite" title={step.citation.title}>
                            ◈ {step.citation.title.length > 48
                              ? `${step.citation.title.slice(0, 46)}…`
                              : step.citation.title}
                          </span>
                        )}
                        {step.evidence.memoryPath && (
                          <span className="evchip mem" title={step.evidence.memoryPath}>
                            ↝ trip memory
                          </span>
                        )}
                        {step.evidence.evalVerdict?.violations.length ? (
                          <span style={{ width: "100%", fontSize: "10px", color: "#b04523" }}>
                            {step.evidence.evalVerdict.violations.join("; ")}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {steps.length === 0 && (
          <p className="tl-empty">
            {isPostFlightDay
              ? "Planned with you after you land."
              : "Not placed yet — personalise."}
          </p>
        )}
      </section>
    </>
  );
}
