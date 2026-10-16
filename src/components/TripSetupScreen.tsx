"use client";

import { useMemo, useState } from "react";
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
  readiness,
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
}: TripSetupScreenProps) {
  const [visualExplorer, setVisualExplorer] = useState<
    "none" | "globe" | "swimlane" | "calendar"
  >("none");
  const [editingRoute, setEditingRoute] = useState(false);

  const flightOptions = useMemo(
    () => (trip ? getFlightRecommendations(trip) : []),
    [trip],
  );
  const activeFlightId =
    selectedFlightId ||
    flightOptions.find((f) => f.recommended)?.id ||
    flightOptions[0]?.id ||
    "";

  const movableCount = calendar.filter((e) => e.movable).length || 3;
  const readyCount = readiness.filter((r) => r.status === "ready").length;
  const readinessLabel =
    readiness.length > 0 ? `${readyCount}/${readiness.length}` : "2/2";

  return (
    <>
      {/* 2. Best Flight Time Advisor Bottom-Sheet Drawer */}
      <div className="sheet rise" style={{ animationDelay: ".5s" }}>
        <div className="hand" />
        <h2>2. Ideal Departure Windows</h2>
        <div className="sub">Circadian guidance — pick a real flight inside the best window; these are windows, not bookable flights</div>
        <div className="fl">
          {flightOptions.map((opt, idx) => {
            const isSelected = activeFlightId
              ? opt.id === activeFlightId
              : idx === 0;
            return (
              <div
                key={opt.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectFlightId(opt.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectFlightId(opt.id);
                  }
                }}
                className={`fo ${isSelected ? "best" : ""}`}
              >
                <small>{opt.badge}</small>
                <b>
                  {opt.departsLocal} → {opt.arrivesDest}
                </b>
                <span>{opt.bestFor}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two-Column Setup Cards: Route & Timezone Shift + Garmin Wearable & Work Calendar */}
      <div className="two rise" style={{ animationDelay: ".55s" }}>
        <div className="card">
          <h3>1. Route &amp; Timezone Shift</h3>
          {editingRoute ? (
            <div style={{ marginBottom: "12px" }}>
              <RoutePicker
                origin={origin}
                dest={dest}
                date={departureDate}
                onChange={(next) => {
                  onChangeRoute(next);
                  setEditingRoute(false);
                }}
                disabled={phase === "running"}
              />
            </div>
          ) : (
            <>
              <div className="f" onClick={() => setEditingRoute(true)}>
                <label>Origin</label>
                <div style={{ cursor: "pointer" }} title="Click to change origin airport">
                  {origin}
                </div>
              </div>
              <div className="f" onClick={() => setEditingRoute(true)}>
                <label>Destination</label>
                <div style={{ cursor: "pointer" }} title="Click to change destination airport">
                  {dest}
                </div>
              </div>
              <div className="f">
                <label htmlFor="departure-date-input">Departure</label>
                <input
                  id="departure-date-input"
                  type="date"
                  value={departureDate}
                  disabled={phase === "running"}
                  onChange={(e) =>
                    e.target.value &&
                    onChangeRoute({ origin, dest, date: e.target.value })
                  }
                />
              </div>
            </>
          )}

          <div className="ex">
            <button
              type="button"
              className="p1"
              onClick={onStart}
              disabled={phase === "running"}
            >
              {phase === "running"
                ? `Building (${lockedCount}/${totalDays})…`
                : "Personalize & View Nudges"}
            </button>
            {phase === "running" ? (
              <button type="button" className="p2" onClick={onCancel}>
                Stop
              </button>
            ) : phase === "done" ? (
              <MorningCheckin
                phase={phase}
                lockedCount={lockedCount}
                totalDays={totalDays}
                sessionStartedAt={sessionStartedAt}
                onCheckIn={onCheckIn}
              />
            ) : (
              <button type="button" className="p2" onClick={onStart}>
                Morning Check-in
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <h3>3. Garmin Wearable &amp; Work Calendar</h3>
          <div className="m3">
            <div>
              Usual Sleep
              <b>
                {baseline
                  ? `${fmtMin(baseline.avgBedtimeMin)}–${fmtMin(baseline.avgWakeMin)}`
                  : "23:30–06:45"}
              </b>
            </div>
            <div>
              HRV
              <b>{baseline ? `${baseline.hrvMs} ms` : "62 ms"}</b>
            </div>
            <div>
              Resting HR
              <b>{baseline ? `${baseline.restingHr} bpm` : "52 bpm"}</b>
            </div>
          </div>
          <div className="m3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              {movableCount} flexible
              <b>Work Calendar</b>
            </div>
            <div>
              {readinessLabel}
              <b>biologically ready</b>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Optional Deep-Dive Visuals */}
      <div
        className="card rise"
        style={{ marginTop: "16px", animationDelay: ".6s" }}
      >
        <h3>4. Optional Deep-Dive Visuals</h3>
        <div className="ex">
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
              className={`chip ${visualExplorer === tab.id ? "on" : ""}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {visualExplorer === "globe" && (
          <div className="mt-4 h-[340px] overflow-hidden rounded-2xl border border-[#e3d5c3] bg-[#07090f]">
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
          <div className="mt-4 min-h-[360px] overflow-hidden rounded-2xl border border-[#e3d5c3] bg-[#07090f] p-2 text-[#e8eaf2]">
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
          <div className="mt-4 h-[420px] overflow-hidden rounded-2xl border border-[#e3d5c3] bg-[#07090f] p-2 text-[#e8eaf2]">
            <CalendarLens
              days={trip.days}
              events={calendar}
              readiness={readiness}
              ics={ics}
            />
          </div>
        )}
      </div>
    </>
  );
}
