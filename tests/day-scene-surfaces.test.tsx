import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { DayScene } from "../src/components/DayScene";
import { buildDayScene } from "../src/domain/day-scene";
import { buildDemoScenario } from "../src/domain/demo-scenarios";
import type { ResolvedPlaceChoice } from "../src/lib/place-choices";

describe("DayScene (SSR)", () => {
  const d = buildDemoScenario("jason", "2026-11-04");
  const sceneIdx = d.trip.departureDayIndex + 1;
  const scene = buildDayScene({ trip: d.trip, dayIndex: sceneIdx, plans: d.plans, calendar: d.calendar, baseline: d.baseline })!;

  test("native range, clocks, solar svg, honest labels", () => {
    expect(scene).not.toBeNull();
    const html = renderToStaticMarkup(createElement(DayScene, { scene, example: true, eventSource: "fixture" }));
    expect(html).toContain('type="range"');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="1439"');
    expect(html).toContain("local time");
    expect(html).toContain("Estimated body time");
    expect(html).toContain("modeled sun altitude");
    expect(html).toContain("Modeled sun position, not a weather forecast");
    expect(html).toContain("Inspect the day—not change the plan");
    expect(html).toContain("Seek light");
    expect(html).toContain("Reduce light");
    expect(html).toContain("Sleep");
    expect(html).toContain("not measured alertness");
    expect(html).toContain("do not record completed steps");
    expect(html).not.toContain("guaranteed");
    expect(html).not.toContain("match %");
    expect(html).not.toContain("% match");
    expect(html).toContain('value="960"');
    expect(html).toContain("08:30");
  });

  test("origin-city prep day and event-jump button on non-event day", () => {
    const prep = buildDayScene({ trip: d.trip, dayIndex: d.trip.departureDayIndex - 1, plans: d.plans, calendar: d.calendar, baseline: d.baseline })!;
    const html = renderToStaticMarkup(createElement(DayScene, { scene: prep, onSelectDay: () => {} }));
    expect(html).toContain(prep.city.name);
    expect(html).toContain("Jump to event day");
    const evt = renderToStaticMarkup(createElement(DayScene, { scene }));
    expect(evt).toContain("Jump to Investment meeting");
  });

  test("no plan => honest text, no fabricated windows", () => {
    const dayNoPlan = buildDayScene({ trip: d.trip, dayIndex: 0, plans: [], calendar: d.calendar, baseline: d.baseline })!;
    const html = renderToStaticMarkup(createElement(DayScene, { scene: dayNoPlan }));
    expect(html).toContain("no verified plan yet");
    expect(html).toContain("No listed light or sleep window");
  });

  test("carry-over windows flagged; idea dismissed/unavailable not rendered", () => {
    const html = renderToStaticMarkup(createElement(DayScene, { scene }));
    expect(html).toContain("from earlier day");
    const dismiss: ResolvedPlaceChoice = {
      suggestion: { dayIndex: sceneIdx, date: scene.date, label: scene.dayLabel, startMin: 840, endMin: 900, place: { name: "Venue X", categories: [] } },
      place: { name: "Venue X", categories: [] },
      status: "dismissed",
      alternatives: [],
    };
    const hd = renderToStaticMarkup(createElement(DayScene, { scene, idea: dismiss }));
    expect(hd).not.toContain("Venue X");
    const sugg = { ...dismiss, status: "suggested" as const };
    const hs = renderToStaticMarkup(createElement(DayScene, { scene, idea: sugg }));
    expect(hs).toContain("Venue X");
    expect(hs).toContain("Optional—not booked.");
  });
});
