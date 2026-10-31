import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TodayStage } from "@/components/TodayStage";
import { buildTrip } from "@/domain/fixtures";
import type { TravelerNudge } from "@/domain/nudges";
import { utcOffsetMinOn } from "@/domain/timezones";
import type { ActionMark } from "@/lib/trip-actions";

/* Round 20: Today's first paint is a stage, not a card column. These tests
 * lock what the stage is allowed to say: the route, the two clocks, and one
 * next step derived by the same pickNextStep the feed trusts. */

/** Departure dated so "today" lands on the trip's departure day at the
 *  origin — deterministic across timezones and DST. */
function tripSpanningToday() {
  const utc = new Date();
  const off = utcOffsetMinOn("Europe/London", utc.toISOString().slice(0, 10));
  const todayAtOrigin = new Date(utc.getTime() + off * 60000).toISOString().slice(0, 10);
  return buildTrip("LHR", "HND", todayAtOrigin);
}

const nudge = (over: Partial<TravelerNudge> & { id: string }): TravelerNudge => ({
  dayIndex: 0,
  dayLabel: "D",
  category: "sunlight",
  title: "Get daylight",
  timeWindow: "all day",
  // Full-day windows so the assertion never depends on the wall clock.
  startMin: 0,
  endMin: 1439,
  durationLabel: "30m",
  actionSummary: "Bright light outside",
  whyItHelps: "Light moves the clock",
  ...over,
});

const mark = (id: string, dayIndex: number): ActionMark => ({
  id,
  dayIndex,
  status: "done",
  text: "done",
  at: Date.now(),
});

describe("TodayStage", () => {
  const trip = tripSpanningToday();

  test("shows the route, the shift, and both clocks", () => {
    const html = renderToStaticMarkup(
      <TodayStage
        trip={trip}
        owedMin={540}
        bodyShiftMin={0}
        nudges={null}
        marks={[]}
        routeOpen={false}
        onChip={() => {}}
      />,
    );
    expect(html).toContain("London → Tokyo");
    expect(html).toContain("9h");
    expect(html).toContain("ahead");
    expect(html).toContain("✎ Change");
    // The merged clock row survives the move onto the stage.
    expect(html).toContain("Body");
  });

  test("before a plan exists, the stage says the crew is reading — nothing more", () => {
    const html = renderToStaticMarkup(
      <TodayStage
        trip={trip}
        owedMin={540}
        bodyShiftMin={0}
        nudges={null}
        marks={[]}
        routeOpen={false}
        onChip={() => {}}
      />,
    );
    expect(html).toContain("The crew is reading your route.");
    expect(html).not.toContain("Next</span>");
  });

  test("with today's steps, the stage names exactly one next step", () => {
    const html = renderToStaticMarkup(
      <TodayStage
        trip={trip}
        owedMin={540}
        bodyShiftMin={60}
        nudges={[
          nudge({ id: "a", title: "Get daylight", startMin: 0 }),
          nudge({ id: "b", title: "Last coffee", startMin: 60 }),
        ]}
        marks={[]}
        routeOpen={false}
        onChip={() => {}}
      />,
    );
    expect(html).toContain("Next");
    expect(html).toContain("Get daylight");
    // One step at a time — the later ask waits its turn.
    expect(html).not.toContain("Last coffee");
  });

  test("completed steps are honoured — the stage agrees with the feed", () => {
    const dayIndex = trip.departureDayIndex;
    const html = renderToStaticMarkup(
      <TodayStage
        trip={trip}
        owedMin={480}
        bodyShiftMin={60}
        nudges={[
          nudge({ id: "a", dayIndex, title: "Get daylight" }),
          nudge({ id: "b", dayIndex, title: "Last coffee" }),
        ]}
        marks={[mark("a", dayIndex)]}
        routeOpen={false}
        onChip={() => {}}
      />,
    );
    expect(html).toContain("Last coffee");
    expect(html).not.toContain("Get daylight");
  });

  test("when everything is placed, the stage says so instead of inventing work", () => {
    const dayIndex = trip.departureDayIndex;
    const html = renderToStaticMarkup(
      <TodayStage
        trip={trip}
        owedMin={480}
        bodyShiftMin={60}
        nudges={[nudge({ id: "a", dayIndex, title: "Get daylight" })]}
        marks={[mark("a", dayIndex)]}
        routeOpen={false}
        onChip={() => {}}
      />,
    );
    expect(html).toContain("Everything is placed for today.");
  });
});
