import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ArrivalDayView } from "../src/components/ArrivalDayView";
import type { TravelerNudge } from "../src/domain/nudges";
import type { ResolvedPlaceChoice } from "../src/lib/place-choices";

const step = (id: string, startMin: number): TravelerNudge => ({
  id, dayIndex: 4, dayLabel: "D+1", category: "sunlight",
  title: `Step ${id}`, timeWindow: "", startMin, endMin: startMin + 30,
  durationLabel: "", actionSummary: `Do ${id}`, whyItHelps: "because",
});

const idea = (status: ResolvedPlaceChoice["status"] = "suggested"): ResolvedPlaceChoice => ({
  suggestion: { dayIndex: 4, date: "2026-05-11", label: "D+1", startMin: 840, endMin: 900, place: { name: "Kissa Tanto", categories: ["listening bar"] } },
  place: { name: "Kissa Tanto", categories: ["listening bar"] },
  status,
  alternatives: [{ name: "Other Spot", categories: [] }],
});

const base = {
  destination: "Tokyo",
  date: "2026-05-11",
  steps: [step("a", 600), step("b", 900), step("c", 1000)],
  completedIds: new Set<string>(),
  skippedIds: new Set<string>(),
  actionsReady: true,
  interactive: true,
  onDone: () => {}, onSkip: () => {},
  onKeep: () => {}, onSwap: () => {}, onDismiss: () => {}, onRestore: () => {},
  choicesReady: true,
  storageAvailable: true,
  planning: false,
};

describe("ArrivalDayView (SSR)", () => {
  test("place idea sits in chronological order between steps", () => {
    const html = renderToStaticMarkup(createElement(ArrivalDayView, { ...base, idea: idea() }));
    const i1 = html.indexOf("Step a"), i2 = html.indexOf("Kissa Tanto"), i3 = html.indexOf("Step b");
    expect(i1).toBeGreaterThan(-1);
    expect(i1).toBeLessThan(i2);
    expect(i2).toBeLessThan(i3);
    expect(html).toContain("Qloo place idea · optional");
    expect(html).toContain("A day that feels like you.");
    expect(html).toContain("May 11 · Tokyo local time");
    expect(html).toContain("Keep this idea");
    expect(html).toContain("Show me another");
    expect(html).toContain("Not this trip");
    expect(html).toContain("not booked");
    expect(html).not.toContain("match %");
  });

  test("kept idea shows kept label, not swap/dismiss", () => {
    const html = renderToStaticMarkup(createElement(ArrivalDayView, { ...base, idea: idea("kept") }));
    expect(html).toContain("Your pick · optional");
    expect(html).toContain("Kept for this trip");
    expect(html).not.toContain("Show me another");
    expect(html).toContain("on this device");
  });

  test("dismissed/unavailable ideas leave the timeline with restore affordance", () => {
    const d = renderToStaticMarkup(createElement(ArrivalDayView, { ...base, idea: idea("dismissed") }));
    expect(d).toContain("Idea set aside.");
    expect(d).toContain("Restore idea");
    expect(d).toContain("Step a");
    const u = renderToStaticMarkup(
      createElement(ArrivalDayView, { ...base, idea: { ...idea("unavailable"), savedPlace: { name: "Old Spot", categories: [] } } }),
    );
    expect(u).toContain("Old Spot");
    expect(u).toContain("Use current suggestion");
    expect(u).not.toContain("Kissa Tanto");
  });

  test("no idea is honest without fabricating one", () => {
    const html = renderToStaticMarkup(createElement(ArrivalDayView, { ...base }));
    expect(html).toContain("Choose a favorite below to add an optional place idea.");
    expect(html).toContain("Step a");
  });

  test("non-interactive finished state has no mark controls; steps keep aria states", () => {
    const on = renderToStaticMarkup(
      createElement(ArrivalDayView, { ...base, completedIds: new Set(["a"]), interactive: true }),
    );
    expect(on).toContain('aria-pressed="true"');
    const off = renderToStaticMarkup(createElement(ArrivalDayView, { ...base, interactive: false }));
    expect(off).not.toContain("aria-pressed");
  });
});

describe("ArrivalDayView regressions", () => {
  test("equal-start rows keep declaration order, idea sorts last", () => {
    const html = renderToStaticMarkup(createElement(ArrivalDayView, { ...base, steps: [step("a", 600), step("b", 600)], idea: { ...idea(), suggestion: { ...idea().suggestion, startMin: 600 } } }));
    const i = (n: string) => html.indexOf(n);
    expect(i("Step a")).toBeLessThan(i("Step b"));
    expect(i("Step b")).toBeLessThan(i("Kissa Tanto"));
  });
  test("empty day fabricates nothing", () => {
    const html = renderToStaticMarkup(createElement(ArrivalDayView, { ...base, steps: [] }));
    expect(html).toContain("A day that feels like you.");
    expect(html).toContain("Choose a favorite below");
    expect(html).not.toContain("Step a");
  });
  test("unready choices and actions disable controls", () => {
    const html = renderToStaticMarkup(createElement(ArrivalDayView, { ...base, actionsReady: false, choicesReady: false, idea: idea() }));
    expect(html).toContain('aria-pressed="false" disabled=""');
    expect(html).toContain("Keep this idea");
  });
  test("statuses show honest copies; stale snapshot keeps old names", () => {
    for (const [st, txt] of [["unavailable","Place ideas are unavailable."],["no-matches","No daytime places found"],["no-window","No clear hour"],["ready","No place idea added"]] as const) {
      const h = renderToStaticMarkup(createElement(ArrivalDayView, { ...base, tasteStatus: st }));
      expect(h).toContain(txt);
    }
    const h = renderToStaticMarkup(createElement(ArrivalDayView, {
      ...base, tasteFavorites: [{ id: "e1", name: "Björk", type: "artist" }], favoritesChanged: true, onUpdatePlan: () => {}, updateDisabled: true,
    }));
    expect(h).toContain("Björk");
    expect(h).toContain("Your favorites have changed");
    expect(h).not.toContain("Sade");
    expect(h).toContain("Update my plan");
  });
  test("reserved vs missing unavailable render distinctly", () => {
    const r = renderToStaticMarkup(createElement(ArrivalDayView, { ...base, idea: { ...idea("unavailable"), unavailableReason: "reserved", savedPlace: { name: "Dup", categories: [] }, canRestore: false } }));
    expect(r).toContain("already chosen for another day");
    expect(r).not.toContain("not in these results");
    expect(r).not.toContain("google.com/maps/search");
    expect(r).toContain("Step a");
    const m = renderToStaticMarkup(createElement(ArrivalDayView, { ...base, idea: { ...idea("unavailable"), unavailableReason: "missing", savedPlace: { name: "Gone", categories: [] }, canRestore: true } }));
    expect(m).toContain("not in these results");
    expect(m).toContain("Use current suggestion");
  });
});
