"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { fmtMin } from "@/domain/circadian";
import { arrivalHeadline, arrivalRead } from "@/domain/arrival";
import { dayPlace } from "@/domain/today";
import type { CheckIn, Trip } from "@/domain/types";
import { arrivalRows, destClockMin } from "@/domain/arrival-rows";

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
function tripDateFromSearch(now: Date): string {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search).get("date");
    if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  }
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
    const date = tripDateFromSearch(new Date());
    fetch(`/api/trip?origin=LHR&dest=HND&date=${date}`)
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
          <h1>Still {dayPlace(trip, trip.departureDayIndex).city} time.</h1>
          <p className="arr-lede">
            You land in {dest.name} on {arrivedDay?.date ?? "the flight day"}. This
            page scores the trip against what the crew promised at the gate — it
            opens the morning after.
          </p>
          <Link className="arr-btn" href="/">
            Back to today
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="arr">
      <div className="arr-in">
        <span className="arr-kicker">
          {dest.name} · {fmtMin(destClock)} · day {read.daysSinceArrival + 1} since landing
        </span>
        <h1>{arrivalHeadline(read, dest.name)}</h1>

        {/* Two sections — what was promised at the gate, and what actually
            happened. Splitting them with a label makes the page read in two
            passes (promise → account), so the traveller sees their own marks
            in context rather than mixed into the gate's numbers. */}
        <span className="arr-section-label">What the crew promised</span>
        <div className="arr-grid">
          {rows.slice(0, 3).map((r) => (
            <div className="arr-cell" key={r.label}>
              <em>{r.value}</em>
              <span>{r.label}</span>
              {r.note ? <small>{r.note}</small> : null}
            </div>
          ))}
        </div>

        <span className="arr-section-label">What actually happened</span>
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
            Tell the crew how it went
          </Link>
          <Link className="arr-btn ghost" href="/review">
            See the plan
          </Link>
        </div>

        <p className="arr-foot">
          Timing guidance, not medical advice.{" "}
          {read.daysRemaining > 0
            ? `${read.daysRemaining} day${read.daysRemaining === 1 ? "" : "s"} of the plan left to live.`
            : "That's the trip."}
        </p>
      </div>
    </main>
  );
}