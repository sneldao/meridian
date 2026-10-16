"use client";

import { useMemo, useState } from "react";
import { fmtMin } from "@/domain/circadian";
import { getFlightRecommendations } from "@/domain/nudges";
import type {
  CalendarEvent,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import type { MeetingReadiness } from "@/domain/readiness";
import { RoutePicker } from "@/components/RoutePicker";
import { MorningCheckin } from "@/components/MorningCheckin";

interface TripSetupScreenProps {
  trip: Trip | null;
  origin: string;
  dest: string;
  departureDate: string;
  onChangeRoute: (next: { origin: string; dest: string; date: string }) => void;
  selectedFlightId: string;
  onSelectFlightId: (id: string) => void;
  baseline?: WearableBaseline;
  /** "fixture" = the demo Garmin numbers, not measured. Drives the Demo tag. */
  baselineSource?: "fixture" | "garmin";
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
  baselineSource,
  calendar,
  calendarSource,
  readiness,
  phase,
  lockedCount,
  totalDays,
  sessionStartedAt,
  onStart,
  onCancel,
  onCheckIn,
}: TripSetupScreenProps) {
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

  // Honest counts: no invented fallbacks. An absent measurement reads "—",
  // never a plausible-looking number (task 3.2 — "No invented values anywhere").
  const movableCount = calendar.filter((e) => e.movable).length;
  const readyCount = readiness.filter((r) => r.status === "ready").length;
  const readinessLabel =
    readiness.length > 0 ? `${readyCount}/${readiness.length}` : "—";

  // Anything sourced from the demo fixture is labelled as such, so a number the
  // app made up is never presented as something the traveller measured.
  const isDemo = baselineSource === "fixture" || calendarSource === "fixture";

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
            ) : null}
          </div>
        </div>

        <div className="card">
          <h3>3. Garmin Wearable &amp; Work Calendar</h3>
          {isDemo && (
            <p className="demo-tag">
              Demo profile — these numbers are sample data, not your measurements.
            </p>
          )}
          <div className="m3">
            <div>
              Usual Sleep
              <b>
                {baseline
                  ? `${fmtMin(baseline.avgBedtimeMin)}–${fmtMin(baseline.avgWakeMin)}`
                  : "—"}
              </b>
            </div>
            <div>
              HRV
              <b>{baseline ? `${baseline.hrvMs} ms` : "—"}</b>
            </div>
            <div>
              Resting HR
              <b>{baseline ? `${baseline.restingHr} bpm` : "—"}</b>
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
    </>
  );
}
