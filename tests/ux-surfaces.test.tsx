import { afterAll, describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";

mock.module("next/navigation", () => ({
  usePathname: () => "/",
}));
afterAll(() => mock.restore());

const { TripEntryScreen } = await import("../src/components/TripEntryScreen");
const { BottomNav } = await import("../src/components/BottomNav");
const { BodyClockDetails } = await import("../src/components/dial/BodyClockDetails");
const { buildTrip, GARMIN_BASELINE, CALENDAR, ADHERENCE_PROFILE } = await import("../src/domain/fixtures");
const { solveDay } = await import("../src/domain/solver");

describe("TripEntryScreen (first use)", () => {
  const html = renderToStaticMarkup(
    createElement(TripEntryScreen, {
      initialDate: "2026-05-10",
      onContinue: () => {},
      onExploreExample: () => {},
    }),
  );

  test("states the honest value proposition", () => {
    expect(html).toContain("Arrive better adjusted.");
    expect(html).toContain("A daily plan for sleep, light and caffeine");
  });

  test("offers one primary action and the example", () => {
    expect(html).toContain("Continue");
    expect(html).toContain("Explore an example");
  });

  test("the route fields are real labelled inputs, blank until chosen", () => {
    for (const label of ["From airport", "To airport", "Departure date"]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
    expect(html).toContain('placeholder="City or airport"');
    expect(html).toContain('value="2026-05-10"');
    expect(html).toContain("disabled");
    expect(html).not.toContain("Choose different");
  });

  test("renders no fixture actions or demo steps", () => {
    expect(html).not.toContain("Make my plan");
    expect(html).not.toContain("Done");
    expect(html).not.toContain("Next up");
  });
});

describe("BottomNav", () => {
  const html = renderToStaticMarkup(createElement(BottomNav));

  test("shows exactly the three goal links", () => {
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/review"');
    expect(html).toContain('href="/history"');
    expect((html.match(/<a /g) ?? []).length).toBe(3);
  });

  test("no Clock tab and no view-state controls", () => {
    expect(html).not.toContain("view=clock");
    expect(html).not.toContain(">Clock<");
    expect(html).not.toContain("<button");
  });
});

describe("BodyClockDetails (explanatory clock)", () => {
  const trip = buildTrip("LHR", "HND", "2026-05-10");
  const locked = new Map(
    trip.days
      .map((spec) => {
        const r = solveDay({
          trip,
          spec,
          lockedDays: [],
          calendar: CALENDAR,
          adherence: ADHERENCE_PROFILE,
          baseline: GARMIN_BASELINE,
        });
        return r ? ([r.plan.label, r.plan] as const) : null;
      })
      .filter((x): x is readonly [string, NonNullable<ReturnType<typeof solveDay>>["plan"]] => !!x),
  );

  const html = renderToStaticMarkup(
    createElement(BodyClockDetails, {
      trip,
      locked,
      baseline: GARMIN_BASELINE,
      calendarEvents: CALENDAR,
      selectedDayLabel: trip.days[0].label,
      marks: [],
      baselineProvenance: "garmin",
      open: true,
    }),
  );

  test("names the city whose local time every readout uses", () => {
    expect(html).toContain("local time");
    expect(html).toContain(trip.origin.name);
  });

  test("has no setup, action or simulated-wearable controls", () => {
    for (const bad of [
      "Set up your clock",
      "Mark done",
      "Not tonight",
      "drinking",
      "Wearable import",
      "Repair today",
      "cheeky",
      "direct",
      "Explore an example",
    ]) {
      expect(html).not.toContain(bad);
    }
  });
});
