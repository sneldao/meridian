"use client";

import { useMemo, useRef, useState } from "react";
import { getFlightRecommendations } from "@/domain/nudges";
import { displayBiometrics } from "@/domain/preview";
import type {
  CalendarEvent,
  Trip,
  WearableBaseline,
} from "@/domain/types";
import type { BaselineKind } from "@/domain/types";
import type { WakeBand } from "@/domain/fixtures";
import type { MeetingReadiness } from "@/domain/readiness";
import { RoutePicker } from "@/components/RoutePicker";
import { MorningCheckin } from "@/components/MorningCheckin";

interface TripSetupScreenProps {
  trip: Trip | null;
  origin: string;
  dest: string;
  departureDate: string;
  onChangeRoute: (next: { origin: string; dest: string; date: string }) => void;
  /** The chosen window, or null to mean "this route's recommended one". */
  selectedFlightId: string | null;
  onSelectFlightId: (id: string) => void;
  baseline?: WearableBaseline;
  /** "fixture" = the demo Garmin numbers, not measured. Drives the Demo tag. */
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
  baselineKind,
  wakeBand,
  onWakeBand,
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

  // Honest counts: no invented fallbacks. An absent measurement reads "—",
  // never a plausible-looking number (task 3.2 — "No invented values anywhere").
  // Item 12 extends it: fixture HRV / resting HR are measurements, so on
  // preview they read "—" too — via the contract, not an inline kind check.
  const bio = displayBiometrics({ baselineKind, wakeBand, baseline });
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
        <h2>Best departure windows</h2>
        <div className="sub">Pick a real flight inside the best window — these are windows, not bookable flights</div>
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
                ? `Building (${lockedCount}/${totalDays})…`
                : "Personalise"}
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
          <h3>Wearable &amp; work calendar</h3>
          {isDemo && (
            <p className="demo-tag">
              Demo profile — these numbers are sample data, not your measurements.
            </p>
          )}
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
            </div>
          )}
          <p className="src-line" style={{ fontSize: "11px", color: "#7a6a5c", margin: "0 0 6px" }}>
            Wearable: {baselineSource === "garmin" ? "connected" : "sample profile"} · Calendar:{" "}
            {calendarSource === "google" ? "connected" : "sample — connect yours"}
          </p>
          <div className="m3">
            <div>
              Usual Sleep
              <b>{bio.sleep ?? "—"}</b>
            </div>
            <div>
              HRV
              <b>{bio.hrv ?? "—"}</b>
            </div>
            <div>
              Resting HR
              <b>{bio.restingHr ?? "—"}</b>
            </div>
          </div>
          {/* Item 12: the unconnected slot. No fixture numbers above (they read
              "—" via the contract); this is the honest alternative — a real
              export or the one wake question. Garmin Health API is
              partner-gated, so CSV export is the demo path by design. */}
          {baselineSource !== "garmin" && (
            <div className="f" style={{ marginTop: 8 }}>
              <label>Connect your wearable</label>
              <p style={{ fontSize: "11px", color: "#7a6a5c", margin: "0 0 6px" }}>
                Connect Garmin (CSV export for now) or answer 1 question — your
                wake answer above personalises the plan instantly.
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
                {uploadState === "sending" ? "Reading export…" : "Upload Garmin CSV"}
              </button>
              {uploadState === "error" && (
                <p role="alert" style={{ fontSize: "11px", color: "#b04523", margin: "6px 0 0" }}>
                  {uploadError ?? "upload failed"} — needs a header row plus at
                  least two nights with date, bedtime, wake and sleep duration.
                </p>
              )}
            </div>
          )}
          <div className="m3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div>
              {movableCount} movable
              <b>Work Calendar</b>
            </div>
            <div>
              {readinessLabel}
              <b>meetings ready</b>
            </div>
          </div>
        </div>
      </div>
      <p style={{ margin: "16px 0 0", fontSize: "11px", color: "var(--color-mist)" }}>
        Timing guidance, not medical advice.
      </p>
    </>
  );
}
