import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "fs";
import { join } from "path";
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

  test("without today's steps, the stage says planning ahead — never a fake load", () => {
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
    // The old line claimed a crew run that wasn't happening; it now renders
    // only while one is genuinely live (see the running test below).
    expect(html).not.toContain("The crew is reading your route.");
    expect(html).toContain("Planning ahead");
    expect(html).toContain("Your days unfold below.");
    expect(html).not.toContain("Next</span>");
  });

  test("while a run is live, the stage says the crew is reading — truthfully", () => {
    const html = renderToStaticMarkup(
      <TodayStage
        trip={trip}
        owedMin={540}
        bodyShiftMin={0}
        nudges={null}
        marks={[]}
        routeOpen={false}
        onChip={() => {}}
        running
      />,
    );
    expect(html).toContain("The crew is reading your route.");
    expect(html).not.toContain("Planning ahead");
  });

  test("the run's door sits on the stage where the eye already is", () => {
    const open = renderToStaticMarkup(
      <TodayStage
        trip={trip}
        owedMin={540}
        bodyShiftMin={0}
        nudges={null}
        marks={[]}
        routeOpen={false}
        onChip={() => {}}
        canStart
        onStart={() => {}}
      />,
    );
    // Same words as the setup sheet's CTA — the two doors never disagree.
    expect(open).toContain("Make my plan");
    const closed = renderToStaticMarkup(
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
    expect(closed).not.toContain("Make my plan");
    // A live run shows its line, not the door.
    const running = renderToStaticMarkup(
      <TodayStage
        trip={trip}
        owedMin={540}
        bodyShiftMin={0}
        nudges={null}
        marks={[]}
        routeOpen={false}
        onChip={() => {}}
        running
        canStart
        onStart={() => {}}
      />,
    );
    expect(running).not.toContain("Make my plan");
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

  test("the page shares one preview with the stage, not an example-gated one", () => {
    /* The 2026-11-07 review: stagePreview was computed only when
     * entry?.mode === "example", so a real trip URL left the hero saying
     * "the crew is reading your route" forever while the feed below showed
     * the plan. The stage and the feed must share one preview keyed to the
     * trip alone — the same contract NudgeFeedScreen's preview keeps. */
    const page = readFileSync(join(import.meta.dir, "..", "src", "app", "page.tsx"), "utf8");
    const block = page.slice(
      page.indexOf("const stagePreview"),
      page.indexOf("const stagePreview") + 700,
    );
    expect(block).not.toContain('"example"');
    expect(block).not.toContain("entry?.mode");
    expect(block).toContain("previewPlan");
    // And the stage receives the run's state and door from the page.
    expect(page).toContain('running={effectivePhase === "running"}');
    expect(page).toContain("onStart={startShift}");
    expect(page).toContain('canStart={effectivePhase === "idle" && entry?.mode === "trip"}');
  });
});
