import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { PerformanceBrief } from "../src/components/PerformanceBrief";
import { LightWindowPanel } from "../src/components/LightWindowPanel";
import { TripEntryScreen } from "../src/components/TripEntryScreen";
import { ScenarioExperience } from "../src/components/ScenarioExperience";
import { buildDemoScenario } from "../src/domain/demo-scenarios";
import { resolveHomeEntry } from "../src/lib/home-entry";
import type { DayPlan, Intervention } from "../src/domain/types";
import { NudgeFeedScreen, type NudgeFeedScreenProps } from "../src/components/NudgeFeedScreen";

describe("PerformanceBrief (SSR)", () => {
  const d = buildDemoScenario("cedric", "2026-11-04");
  test("shows model numbers, source and disclaimer — no % or cure claims", () => {
    const h = renderToStaticMarkup(createElement(PerformanceBrief, { moment: d.moment, destination: "Tokyo", date: "2026-11-05", eventSource: "fixture", example: true }));
    expect(h).toContain("A fictional moment that matters");
    expect(h).toContain("Evening performance");
    expect(h).toContain("Event time");
    expect(h).toContain("Estimated body time");
    expect(h).toContain("Example event");
    expect(h).toContain("not a measurement of alertness");
    for (const bad of ["%", "guaranteed", "You will be sharp", "fix jetlag"]) expect(h).not.toContain(bad);
  });
  test("no event renders honest fallback", () => {
    const h = renderToStaticMarkup(createElement(PerformanceBrief, { moment: null, destination: "Tokyo" }));
    expect(h).toContain("Show up for what matters.");
    expect(h).toContain("work around the moments");
  });
});

describe("LightWindowPanel (SSR)", () => {
  const d = buildDemoScenario("cedric", "2026-11-04");
  const plan = d.plans.find((p) => p.dayIndex === d.trip.departureDayIndex + 1)!;
  test("seek + reduce rows with real times", () => {
    const h = renderToStaticMarkup(createElement(LightWindowPanel, { plan, date: "2026-11-05", city: "Tokyo", example: true }));
    expect(h).toContain("Lightmaxxing, with timing.");
    expect(h).toContain("Seek light");
    expect(h).toContain("Reduce light");
    expect(h).toContain("12:45");
    expect(h).toContain("08:15");
    expect(h).toContain("Example plan");
    expect(h).toContain("more light is not always better");
  });
  test("honest empty states", () => {
    const h = renderToStaticMarkup(createElement(LightWindowPanel, { plan: null, date: "2026-11-05", city: "Tokyo" }));
    expect(h).toContain("No verified light window for this day yet.");
    const empty = { ...plan, interventions: [] } as DayPlan;
    expect(renderToStaticMarkup(createElement(LightWindowPanel, { plan: empty, date: "2026-11-05", city: "Tokyo" }))).toContain("No light window placed for this day.");
  });
});

describe("entry + selector (SSR)", () => {
  test("new copy, real CTA, sample buttons", () => {
    const h = renderToStaticMarkup(createElement(TripEntryScreen, { initialDate: "2026-05-10", onContinue: () => {}, onExploreExample: () => {}, onExploreScenario: () => {} }));
    expect(h).toContain("Show up for what matters.");
    expect(h).toContain("Arrive with a plan");
    expect(h).toContain("See my trip plan");
    expect(h).toContain("Try Jason");
    expect(h).toContain("Try Cedric");
    expect(h).toContain("Try Alex");
    expect(h).toContain("Imagined demo scenarios");
    expect(h).toContain("Before the big moment");
    expect(h).toContain("Between the commitments");
  });
  test("home entry resolves known/legacy/unknown example params", () => {
    const sp = (v: string) => new URLSearchParams(`example=${v}`);
    expect(resolveHomeEntry(sp("jason"), null, null).scenarioId).toBe("jason");
    expect(resolveHomeEntry(sp("1"), null, null).scenarioId).toBeUndefined();
    expect(resolveHomeEntry(sp("1"), null, null).mode).toBe("example");
    expect(resolveHomeEntry(sp("bogus"), null, null).mode).toBe("setup");
    expect(resolveHomeEntry(sp("jason"), JSON.stringify({ origin: "SFO", dest: "SIN", date: "2026-05-10" }), null).route).toBeNull();
  });
});

describe("ScenarioExperience + prefill (SSR)", () => {
  test("each scenario renders disclosure, names, recorded source — no actions or fetch", () => {
    const saved = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("must not fetch"); }) as unknown as typeof fetch;
    try {
      for (const id of ["jason", "cedric", "alex"] as const) {
        const h = renderToStaticMarkup(createElement(ScenarioExperience, { id, departureDate: "2026-11-04", onChooseScenario: () => {}, onMakeTrip: () => {}, onBack: () => {} }));
        expect(h).toContain("Imagined demo scenarios");
        expect(h).toContain("not their actual data or endorsements");
        expect(h).toContain("Recorded Qloo sample");
        expect(h).toContain("Make this my trip");
        expect(h).not.toContain(">Done<");
        expect(h).not.toContain(">Skip<");
      }
    } finally {
      globalThis.fetch = saved;
    }
    const jason = renderToStaticMarkup(createElement(ScenarioExperience, { id: "jason", departureDate: "2026-11-04", onChooseScenario: () => {}, onMakeTrip: () => {}, onBack: () => {} }));
    expect(jason).toContain("Jason Calacanis");
    expect(jason).toContain("10:00 morning");
    expect(jason).toContain("16:00 afternoon");
    expect(jason).toContain("Be there for the big decision.");
  });
  test("initialRoute prefills the real form", () => {
    const h = renderToStaticMarkup(createElement(TripEntryScreen, {
      initialDate: "2026-05-10",
      onContinue: () => {},
      onExploreExample: () => {},
      initialRoute: { origin: "LHR", dest: "HND", date: "2026-11-04" },
    }));
    expect(h).toContain('value="LHR"');
    expect(h).toContain('value="HND"');
    expect(h).toContain('value="2026-11-04"');
  });
  test("exampleBaseline vs google provenance on PerformanceBrief", () => {
    const g = renderToStaticMarkup(createElement(PerformanceBrief, { moment: null, destination: "Tokyo", eventSource: "google" }));
    expect(g).not.toContain("A fictional moment");
    const e = renderToStaticMarkup(createElement(PerformanceBrief, { moment: null, destination: "Tokyo", exampleBaseline: true }));
    expect(e).not.toContain("with pre-event plan");
    const np = renderToStaticMarkup(createElement(PerformanceBrief, { moment: null, destination: "Tokyo", hasPlan: false }));
    expect(np).toBeDefined();
  });
});
describe("provenance and edge cases (SSR)", () => {
  const d = buildDemoScenario("cedric", "2026-11-04");
  test("google event + example baseline: real event, sample sleep copy", () => {
    const h = renderToStaticMarkup(createElement(PerformanceBrief, { moment: d.moment, destination: "Tokyo", date: "2026-11-05", eventSource: "google", exampleBaseline: true }));
    expect(h).toContain("Example sleep profile");
    expect(h).not.toContain("A fictional moment");
    expect(h).not.toContain("Example event");
    const np = renderToStaticMarkup(createElement(PerformanceBrief, { moment: d.moment, destination: "Tokyo", hasPlan: false }));
    expect(np).toContain("before any planned adjustment");
    expect(np).not.toContain("with pre-event plan");
    const bad = renderToStaticMarkup(createElement(PerformanceBrief, { moment: d.moment, destination: "Tokyo", date: "2026-99-99" }));
    expect(bad).toContain("Tokyo local time");
  });
  test("midnight-wrap, start-only, and dangling sleep dashes", () => {
    const ivs: Intervention[] = [
      { kind: "avoid_light", startMin: 1380, endMin: 60, note: "Shade" } as Intervention,
      { kind: "light_exposure", startMin: 420, note: "Light" } as Intervention,
      { kind: "sleep_window", startMin: 1320, note: "Rest" } as Intervention,
    ];
    const plan = { ...d.plans[0], interventions: ivs } as DayPlan;
    const h = renderToStaticMarkup(createElement(LightWindowPanel, { plan, date: "2026-11-05", city: "Tokyo" }));
    expect(h).toContain("23:00");
    expect(h).toContain("01:00");
    expect(h).toContain("ends next day");
    expect(h).toContain("07:00");
    expect(h).not.toContain("07:00–");
    expect(h).toContain("Sleep 22:00");
    expect(h).not.toContain("Sleep 22:00–");
  });
});

describe("feed ordering (SSR)", () => {
  test("performance > hero > light > taste; no duplicated hero-meeting", () => {
    const d = buildDemoScenario("cedric", "2026-11-04");
    const props: NudgeFeedScreenProps = {
      trip: d.trip, phase: "idle" as const, selectedDayLabel: "D-1", onSelectDay: () => {},
      locked: new Map(), drafts: new Map(), verdicts: new Map(), rejected: new Set<string>(),
      baseline: d.baseline, calendarEvents: d.calendar, moves: [], citations: [],
      onStartCrewSync: () => {}, baselineKind: "demo-default" as const, baselineSource: "fixture" as const,
      calendarSource: "google" as const,
      actions: { completedIds: new Set<string>(), skippedIds: new Set<string>(), pendingMarks: new Map(), marks: [], ready: true, mark: () => {}, acknowledge: () => {} },
    };
    const html = renderToStaticMarkup(createElement(NudgeFeedScreen, props));
    const pb = html.indexOf('class="day-scene"');
    const hero = html.indexOf('class="hero ');
    const lp = html.indexOf('class="light-panel"');
    const td = html.indexOf("Find your kind of");
    expect(pb).toBeGreaterThanOrEqual(0);
    expect(pb).toBeLessThan(hero);
    expect(hero).toBeLessThan(td);
    expect(lp).toBeGreaterThanOrEqual(0);
    expect(lp).toBeLessThan(hero);
    expect(html).not.toContain("hero-meeting");
    expect(html).toContain("Seek light");
    expect(html).toContain("Plan preview");
    expect(html.slice(pb, hero)).not.toContain("Example event");
  });
});
