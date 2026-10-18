"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtMin } from "@/domain/circadian";
import { arrivalHeadline, arrivalRead, tripDebrief } from "@/domain/arrival";
import { dayPlace } from "@/domain/today";
import type { CheckIn, Trip } from "@/domain/types";
import { arrivalRows, destClockMin } from "@/domain/arrival-rows";
import { scoreBand } from "@/domain/score";
import { friendlyDayLabel } from "@/lib/day-label";

// The payoff. "Land at 100%" is promised in the nav on every screen, and until
// now nothing ever cashed it — the journey ended at the plan and the only
// post-trip surface was a self-report behind a menu item.
//
// This is the first morning in the destination, scored against what the gate
// promised. The residual the hero has been counting down all trip is the thing
// being settled here, so the same vocabulary carries over: banked, owed, and the
// honest case where nothing was promised at all.
//
// Reachable two ways, deliberately: automatically from Today once the traveller
// is past touchdown, and by URL from the menu for anyone who wants to look.

// The trip being scored. Mirrors the home surface: an explicit `?date=` wins
// (which is what makes this page inspectable — you can score any trip), and
// otherwise the default trip is three days out. `?arrived=1` pretends the last
// day has passed, for looking at the payoff before it happens rather than
// waiting a week for it.
function defaultDepartureDate(now: Date): string {
  const d = new Date(now.getTime() + 3 * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ArrivalPage() {
  const [state, setState] = useState<{
    trip: Trip | null;
    planRaw: string | null;
    checkIns: CheckIn[];
    now: Date;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // URL params win; otherwise the saved trip (the one this page exists to
    // score); otherwise the demo route.
    const sp = new URLSearchParams(window.location.search);
    let lastTrip: Trip | null = null;
    try {
      lastTrip = JSON.parse(localStorage.getItem("meridian:lastTrip") || "null");
    } catch {
      /* corrupt storage is an absent trip, not a crash */
    }
    const origin = sp.get("origin") ?? lastTrip?.origin?.code ?? "LHR";
    const dest = sp.get("dest") ?? lastTrip?.destination?.code ?? "HND";
    const depDay = lastTrip?.days?.find((d) => d.dayIndex === lastTrip.departureDayIndex);
    const qDate = sp.get("date");
    const date =
      qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)
        ? qDate
        : depDay?.date ?? defaultDepartureDate(new Date());
    fetch(`/api/trip?origin=${origin}&dest=${dest}&date=${date}`)
      .then((r) => r.json())
      .then((d2: { trip: Trip }) => {
        const t = setTimeout(() => {
          if (cancelled) return;
          let planRaw: string | null = null;
          let checkIns: CheckIn[] = [];
          try {
            planRaw = localStorage.getItem("meridian:lastPlan");
            checkIns = JSON.parse(localStorage.getItem("meridian:checkins") || "[]");
          } catch {
            /* corrupt storage is an absent plan, not a crash */
          }
          // `?arrived=1` shifts the clock forward past the trip so the payoff
          // can be looked at without waiting a week for it. Purely a viewing
          // aid — nothing else reads it.
          const pretend = new URLSearchParams(window.location.search).get("arrived") === "1";
          setState({
            trip: d2.trip,
            planRaw,
            checkIns,
            now: pretend ? new Date(Date.now() + 12 * 86400000) : new Date(),
          });
        }, 0);
        return () => clearTimeout(t);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const read = useMemo(
    () => (state?.trip ? arrivalRead(state.trip, state.planRaw, state.checkIns, state.now) : null),
    [state],
  );

  // Bet 4 — the debrief's prior runs. Hooks live above the early returns:
  // without keys this stays empty and the carried-in line stays null.
  const [priorRuns, setPriorRuns] = useState<
    { trip?: { origin?: { code?: string }; destination?: { code?: string } } | null }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/persistence/runs")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.enabled && Array.isArray(d.runs)) setPriorRuns(d.runs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Bet 4 — the debrief: score, what worked, what the crew learned, and the
  // next trip. Null-safe on missing state (read null → debrief null) so it
  // can sit above both early returns; the section only renders post-arrival.
  const debrief = useMemo(() => {
    if (!state?.trip || !read) return null;
    return tripDebrief(
      read,
      state.trip.destination.name,
      state.checkIns,
      { origin: state.trip.origin.code, destination: state.trip.destination.code },
      priorRuns,
    );
  }, [state, read, priorRuns]);

  if (!state || !read || !state.trip) {
    return (
      <main className="arr">
        <div className="arr-in">
          <p className="arr-loading">Looking for your trip…</p>
        </div>
      </main>
    );
  }

  const trip = state.trip;
  const dest = trip.destination;
  const arrivalDayIndex = trip.departureDayIndex + 1;
  const arrivedDay = trip.days.find((d) => d.dayIndex === arrivalDayIndex);
  const rows = arrivalRows(read, trip, state.checkIns);
  const destClock = destClockMin(trip, state.now);

  if (!read.arrived) {
    return (
      <main className="arr">
        <div className="arr-in">
          <span className="arr-kicker">Not yet</span>
          <h1>You&apos;re still on {dayPlace(trip, trip.departureDayIndex).city} time.</h1>
          <p className="arr-lede">
            You land in {dest.name} on{" "}
            {arrivedDay ? friendlyDayLabel(arrivedDay, trip.departureDayIndex) : "the flight day"}.
            Come back the morning after you land to see how well your body clock adjusted.
          </p>
          <Link className="arr-btn" href="/">
            Back to my plan
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="arr">
      <div className="arr-in">
        <span className="arr-kicker">
          {dest.name} · {fmtMin(destClock)} · day {read.daysSinceArrival + 1} in {dest.name}
        </span>
        <h1>{arrivalHeadline(read, dest.name)}</h1>

        {/* Two sections — what was promised at the gate, and what actually
            happened. Splitting them with a label makes the page read in two
            passes (promise → account), so the traveller sees their own marks
            in context rather than mixed into the gate's numbers. */}
        <span className="arr-section-label">What the plan promised</span>
        <div className="arr-grid">
          {rows.slice(0, 3).map((r) => (
            <div className="arr-cell" key={r.label}>
              <em>{r.value}</em>
              <span>{r.label}</span>
              {r.note ? <small>{r.note}</small> : null}
            </div>
          ))}
        </div>

        <span className="arr-section-label">What you did</span>
        <div className="arr-grid">
          {rows.slice(3).map((r) => (
            <div className="arr-cell account" key={r.label}>
              <em>{r.value}</em>
              <span>{r.label}</span>
              {r.note ? <small>{r.note}</small> : null}
            </div>
          ))}
        </div>

        {/* The self-report is the other half of the landing, and it's the only
            place the traveller's own account enters the loop. Reached from
            here because arriving is the moment it becomes meaningful. */}
        <p className="arr-lede">
          {read.followRate === null
            ? "No marks recorded this trip. How much of the plan did you actually follow?"
            : `You marked ${read.followed} done, ${read.partial} partly, ${read.missed} missed. How did it actually feel?`}
        </p>
        <div className="arr-actions">
          <Link className="arr-btn" href="/outcome">
            Tell us how you felt
          </Link>
          <Link className="arr-btn ghost" href="/review">
            See the plan
          </Link>
        </div>

        {/* Bet 4 — the debrief worth revisiting. Score at the gate, the one
            adherence signal the marks support, and the carried-in proof when
            a prior different-route trip exists. Null sections render nothing;
            the "plan your next trip" line closes the loop back to Today. */}
        {(debrief && (debrief.lesson || debrief.carriedFrom || debrief.gateScore !== null)) && (
          <>
            <span className="arr-section-label">What we learned</span>
            <div className="arr-grid">
              {debrief!.gateScore !== null && (
                <div className="arr-cell" key="gate-score">
                  <em>
                    {scoreBand(debrief!.gateScore) === "pass"
                      ? "✓ Passed checks"
                      : scoreBand(debrief!.gateScore) === "warn"
                        ? "Below our standard"
                        : "Didn't pass"}
                  </em>
                  <span>plan check</span>
                </div>
              )}
              {debrief!.lesson && (
                <div className="arr-cell" key="lesson">
                  <em>{debrief!.lesson.label}</em>
                  <span>{debrief!.lesson.detail}</span>
                </div>
              )}
              {debrief!.carriedFrom && (
                <div className="arr-cell" key="carried">
                  <em>{debrief!.carriedFrom}</em>
                  <span>an earlier trip helped shape this plan</span>
                </div>
              )}
            </div>
            <p className="arr-lede">
              <Link className="arr-btn ghost" href="/">
                Plan your next trip →
              </Link>
            </p>
          </>
        )}

        <p className="arr-foot">
          Timing guidance, not medical advice.{" "}
          {read.daysRemaining > 0
            ? `${read.daysRemaining} day${read.daysRemaining === 1 ? "" : "s"} of the plan left.`
            : "That's the end of the plan."}
        </p>
      </div>
    </main>
  );
}