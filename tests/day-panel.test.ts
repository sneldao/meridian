import { describe, expect, test } from "bun:test";
import { dayPanelMode } from "../src/components/NudgeFeedScreen";

describe("dayPanelMode", () => {
  test("saved plan + real trip → edit", () => {
    expect(dayPanelMode({ planEdit: true, sampleMode: false, lockedSize: 3 })).toBe("edit");
  });
  test("no edit context, sample mode, or empty locked → explore", () => {
    expect(dayPanelMode({ planEdit: false, sampleMode: false, lockedSize: 3 })).toBe("explore");
    expect(dayPanelMode({ planEdit: true, sampleMode: true, lockedSize: 3 })).toBe("explore");
    expect(dayPanelMode({ planEdit: true, sampleMode: false, lockedSize: 0 })).toBe("explore");
  });
});

/* The arrival-view rail: post-flight days keep day navigation. */

import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { NudgeFeedScreen, type NudgeFeedScreenProps } from "../src/components/NudgeFeedScreen";
import { buildDemoScenario } from "../src/domain/demo-scenarios";

describe("day stepper on an arrival-view day (SSR)", () => {
  test("post-flight locked day renders Previous/Next day", () => {
    const d = buildDemoScenario("miles", "2026-11-04");
    const postFlight = d.trip.days.find((x) => x.dayIndex > d.trip.departureDayIndex)!;
    const locked = new Map(d.plans.map((p) => [p.label, p]));
    const props: NudgeFeedScreenProps = {
      trip: d.trip, phase: "done" as const,
      selectedDayLabel: postFlight.label,
      onSelectDay: () => {},
      locked, drafts: new Map(), verdicts: new Map(), rejected: new Set<string>(),
      baseline: d.baseline, calendarEvents: d.calendar, moves: [], citations: [],
      onStartCrewSync: () => {}, baselineKind: "garmin" as const, baselineSource: "garmin" as const,
      calendarSource: "google" as const,
      actions: { completedIds: new Set<string>(), skippedIds: new Set<string>(), pendingMarks: new Map(), marks: [], ready: true, mark: () => {}, acknowledge: () => {} },
    };
    const h = renderToStaticMarkup(createElement(NudgeFeedScreen, props));
    expect(h).toContain('aria-label="Previous day"');
    expect(h).toContain('aria-label="Next day"');
  });
});
