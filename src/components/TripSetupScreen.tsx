"use client";

import { useMemo, useRef, useState } from "react";
import { getFlightRecommendations } from "@/domain/nudges";
import { displayBiometrics, wakeAck } from "@/domain/preview";
import { calendarSummary } from "@/domain/hero";
import type {
  CalendarEvent,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import type { BaselineKind } from "@/domain/types";
import type { WakeBand } from "@/domain/fixtures";
import type { MeetingReadiness } from "@/domain/readiness";
import { RoutePicker } from "@/components/RoutePicker";

interface TripSetupScreenProps {
  /** "page" is the no-trip fallback screen (route editor + start); "sheet"
   *  is the settings overlay on Home — no route editor, no run controls. */
  variant?: "sheet" | "page";
  trip: Trip | null;
  origin: string;
  dest: string;
  departureDate: string;
  onChangeRoute: (next: { origin: string; dest: string; date: string }) => void;
  /** The chosen window, or null to mean "this route's recommended one". */
  selectedFlightId: string | null;
  onSelectFlightId: (id: string) => void;
  baseline?: WearableBaseline;
  /** "fixture" = the demo Garmin numbers, not measured. */
  baselineSource?: "fixture" | "garmin";
  /** Provenance of the baseline — the preview gate (item 11/12). Optional so
   *  older callers keep compiling; absent means "nothing fetched yet", which
   *  previews by contract. */
  baselineKind?: BaselineKind;
  /** Self-reported natural wake — the one personalisation question. */
  wakeBand?: WakeBand | null;
  onWakeBand?: (band: WakeBand | null) => void;
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
  onBackToGuide: () => void;
}

export function TripSetupScreen({
  variant = "page",
  trip,
  origin,
  dest,
  departureDate,
  onChangeRoute,
  selectedFlightId,
  onSelectFlightId,
  baseline,
  baselineSource,
  baselineKind,
  wakeBand,
  onWakeBand,
  calendar,
  calendarSource,
  readiness,
  phase,
  lockedCount,
  totalDays,
  onStart,
  onCancel,
  onBackToGuide,
}: TripSetupScreenProps) {
  const [editingRoute, setEditingRoute] = useState(false);
  // Garmin CSV upload (item 12): the POST has existed since 92299c3 with zero
  // callers. File → text → /api/wearable → reload so /api/trip answers garmin.
  const [uploadState, setUploadState] = useState<"idle" | "sending" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onPickFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadState("sending");
    setUploadError(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/wearable", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: text,
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error ?? `upload failed (${res.status})`);
      }
      // The new baseline is per-tenant server-side; the page re-reads it.
      window.location.reload();
    } catch (e) {
      setUploadState("error");
      setUploadError(e instanceof Error ? e.message : "upload failed");
    }
  };

  const flightOptions = useMemo(
    () => (trip ? getFlightRecommendations(trip) : []),
    [trip],
  );
  const activeFlightId =
    selectedFlightId ||
    flightOptions.find((f) => f.recommended)?.id ||
    flightOptions[0]?.id ||
    "";

  // Honest counts: no invented fallbacks. The biometric grid only renders when
  // all three measurements exist — a row of "—" is noise, not a fact.
  const bio = displayBiometrics({ baselineKind, wakeBand, baseline });
  const hasAllBio = bio.sleep !== null && bio.hrv !== null && bio.restingHr !== null;
  // Same helper the Today rail uses, so the two surfaces cannot drift into
  // telling the traveller two different things about the same calendar.
  const cal = calendarSummary(calendar, readiness);

  return (
    <>
      {variant === "sheet" && <h2 className="sheet-title">Trip settings</h2>}

      {variant === "page" && (
        <div className="card">
          <h3>Route &amp; timezone shift</h3>
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
                ? `Building your plan… (${lockedCount} of ${totalDays} days)`
                : "Make my plan"}
            </button>
            {phase === "running" && (
              <button type="button" className="p2" onClick={onCancel}>
                Stop
              </button>
            )}
          </div>
        </div>
      )}

      {/* Best time to fly — real buttons, not divs pretending. */}
      <div className="sheet rise" style={{ animationDelay: ".5s" }}>
        <div className="hand" />
        <h2>Best time to fly</h2>
        <div className="sub">
          Pick the time of day you&apos;d like to fly — we&apos;ll plan around it.
        </div>
        <div className="fl">
          {flightOptions.map((opt, idx) => {
            const isSelected = activeFlightId
              ? opt.id === activeFlightId
              : idx === 0;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelectFlightId(opt.id)}
                className={`fo ${isSelected ? "best" : ""}`}
              >
                <small>{opt.badge}</small>
                <b>
                  {opt.departsLocal} → {opt.arrivesDest}
                </b>
                <span>{opt.bestFor}</span>
              </button>
            );
          })}
        </div>
        <p className="src-line" style={{ fontSize: "11px", color: "#7a6a5c", margin: "8px 0 0" }}>
          These are times of day, not specific flights.
        </p>
      </div>

      <div className="two rise" style={{ animationDelay: ".55s" }}>
        <div className="card">
          <h3>Your sleep</h3>
          {onWakeBand && (
            <div className="f" role="group" aria-label="Your natural wake time">
              <label>On a day with nothing early planned, when do you naturally wake?</label>
              <div className="chips" style={{ display: "flex", gap: 6 }}>
                {([
                  ["before6", "Before 6"],
                  ["6to8", "6–8"],
                  ["after8", "After 8"],
                ] as const).map(([band, label]) => (
                  <button
                    key={band}
                    type="button"
                    className={`chip ${wakeBand === band ? "on" : ""}`}
                    aria-pressed={wakeBand === band}
                    disabled={phase === "running"}
                    onClick={() => onWakeBand(wakeBand === band ? null : band)}
                  >
                    {label}
                  </button>
                ))}
                {wakeBand && (
                  <button type="button" className="chip" onClick={() => onWakeBand(null)}>
                    Clear
                  </button>
                )}
              </div>
              {/* The answer re-plans the preview instantly; name it so the
                  traveller learns it mattered. Null (garmin, cleared) renders
                  nothing — same contract as the hero line. */}
              {(() => {
                const ack = wakeAck(baselineKind, wakeBand);
                return ack ? (
                  <p className="src-line" style={{ fontSize: "11px", color: "#4a7a5c", margin: "6px 0 0" }}>
                    {ack}
                  </p>
                ) : null;
              })()}
            </div>
          )}
          <p className="src-line" style={{ fontSize: "11px", color: "#7a6a5c", margin: "0 0 6px" }}>
            {baselineSource === "garmin" ? "Using your Garmin data" : "Using example sleep data"}
          </p>
          {hasAllBio && (
            <div className="m3">
              <div>
                Usual sleep
                <b>{bio.sleep}</b>
              </div>
              <div>
                Heart rate variability
                <b>{bio.hrv}</b>
              </div>
              <div>
                Resting heart rate
                <b>{bio.restingHr}</b>
              </div>
            </div>
          )}
          {/* Item 12: the unconnected slot. A real export or the one wake
              question. Garmin Health API is partner-gated, so CSV export is
              the demo path by design. */}
          {baselineSource !== "garmin" && (
            <div className="f" style={{ marginTop: 8 }}>
              <label>Connect your wearable</label>
              <p style={{ fontSize: "11px", color: "#7a6a5c", margin: "0 0 6px" }}>
                Have a Garmin? Upload your sleep export for a more accurate plan.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                hidden
                aria-label="Upload Garmin sleep export (CSV)"
                onChange={(e) => void onPickFile(e.target.files?.[0])}
              />
              <button
                type="button"
                className="chip"
                disabled={phase === "running" || uploadState === "sending"}
                onClick={() => fileRef.current?.click()}
              >
                {uploadState === "sending" ? "Reading export…" : "Upload Garmin file"}
              </button>
              {uploadState === "error" && (
                <p role="alert" style={{ fontSize: "11px", color: "#b04523", margin: "6px 0 0" }}>
                  {uploadError ?? "Upload failed"} — the file needs a header row
                  and at least two nights of sleep.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Your calendar</h3>
          <p className="src-line" style={{ fontSize: "11px", color: "#7a6a5c", margin: "0 0 6px" }}>
            {calendarSource === "google"
              ? "Connected to Google Calendar"
              : "Using an example calendar"}
          </p>
          <div className="m3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              Events we can move
              <b>{cal.movable}</b>
            </div>
            <div>
              {cal.total === 0 ? "Meetings after you land" : "Meetings after you land at a good body time"}
              <b>{cal.total === 0 ? "None" : `${cal.ready} of ${cal.total}`}</b>
            </div>
          </div>
        </div>
      </div>

      {variant === "sheet" && (
        <div className="ex" style={{ marginTop: "12px" }}>
          <button type="button" className="p1" onClick={onBackToGuide}>
            Done
          </button>
        </div>
      )}

      <p style={{ margin: "16px 0 0", fontSize: "11px", color: "var(--color-mist)" }}>
        Timing guidance, not medical advice.
      </p>
    </>
  );
}
