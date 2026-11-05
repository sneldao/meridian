import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { crewAnswer, type CrewFacts } from "../src/domain/crew-answer";
import { coverageOf, fmtMin } from "../src/domain/circadian";
import { previewPlan } from "../src/domain/solver";
import {
  buildTrip,
  calendarFor,
  ADHERENCE_PROFILE,
  GARMIN_BASELINE,
} from "../src/domain/fixtures";
import type { CalendarEvent } from "../src/domain/types";

/* The deterministic ask lane (agent-native §4a). Every answer is composed
 * from the same state the feed shows — the tests pin that law: times name
 * real windows, what-ifs are real solver re-runs, owners are routed, and
 * anything unparseable gets the one honest fallback. */

const TRIP = buildTrip("LHR", "HND", "2026-10-18");
const CAL = calendarFor(TRIP);
const PREVIEW = previewPlan({
  trip: TRIP,
  calendar: CAL,
  adherence: ADHERENCE_PROFILE,
  baseline: GARMIN_BASELINE,
});
const PLANS = [...PREVIEW.values()].filter(Boolean).map((s) => s!.plan);
const D3 = PLANS.find((d) => d.label === "D-3")!;

const facts: CrewFacts = {
  trip: TRIP,
  owedMin: coverageOf(TRIP, PLANS).residualMin,
  plans: PLANS,
  plansArePreview: true,
  activeDaySpec: TRIP.days[0],
  calendar: CAL,
  adherence: ADHERENCE_PROFILE,
  baseline: GARMIN_BASELINE,
  baselineFacts: {
    chronotype: GARMIN_BASELINE.chronotype,
    bedMin: GARMIN_BASELINE.avgBedtimeMin,
    wakeMin: GARMIN_BASELINE.avgWakeMin,
  },
  places: { matched: 3, provenance: "recorded Qloo sample — not a live lookup" },
  citations: 4,
  moves: 2,
};

describe("crewAnswer — why <time> names the real window", () => {
  test("a time inside the light window answers with its span and day", () => {
    const light = D3.interventions.find((iv) => iv.kind === "light_exposure")!;
    const a = crewAnswer(`why is light at ${fmtMin(light.startMin)}?`, facts);
    expect(a.owner).toBe("Otto");
    expect(a.agent).toBe("planner");
    expect(a.answer).toContain(fmtMin(light.startMin));
    expect(a.answer).toContain("D-3");
    expect(a.provenance).toBe("solver preview");
  });

  test("a wind-down time answers the wind-down, not the light block", () => {
    const avoid = D3.interventions.find((iv) => iv.kind === "avoid_light")!;
    const a = crewAnswer(`why is light at ${fmtMin(avoid.startMin)}?`, facts);
    expect(a.answer).toContain("Wind-down");
    expect(a.answer).toContain(fmtMin(avoid.startMin));
    // The day's own note is quoted, and the shift math is real.
    expect(a.detail?.[0]).toBe(avoid.note);
    expect(a.detail?.[1]).toContain(`${Math.abs(D3.shiftMin)}min`);
  });

  test("the 07:00 light window names the next wind-down", () => {
    const light = D3.interventions.find((iv) => iv.kind === "light_exposure")!;
    const a = crewAnswer(`why ${fmtMin(light.startMin)}`, facts);
    const avoid = D3.interventions.find((iv) => iv.kind === "avoid_light")!;
    expect(a.answer).toContain(`before the ${fmtMin(avoid.startMin)} wind-down`);
    expect(a.answer).toContain("eastward");
  });

  test("a time with no window says so and names the nearest", () => {
    // Find a minute NO day holds a window for — the honest "nothing sits
    // there" case. (03:00 is inside the sleep window; 09:00 inside D-2's.)
    let free = -1;
    for (let t = 9 * 60; t < 22 * 60 && free < 0; t += 15) {
      const busy = PLANS.some((d) =>
        d.interventions.some((iv) => {
          const end = (iv.endMin ?? iv.startMin + 30) + (iv.endMin != null && iv.endMin <= iv.startMin ? 1440 : 0);
          return (iv.startMin <= t && t < end) || Math.abs(iv.startMin - t) <= 15;
        }),
      );
      if (!busy) free = t;
    }
    expect(free).toBeGreaterThan(0);
    const a = crewAnswer(`why ${fmtMin(free)}`, facts);
    expect(a.owner).toBe("Otto");
    expect(a.answer).toContain(`Nothing sits at ${fmtMin(free)}`);
    expect(a.answer).toContain("nearest window");
  });
});

describe("crewAnswer — bare why answers for the attached card", () => {
  test("the context's own explanation is quoted", () => {
    const a = crewAnswer("why", {
      ...facts,
      context: {
        about: "the 07:00 Seek light step",
        detail: "Morning light is the strongest advance lever.",
        owner: "Otto",
        agent: "planner",
        provenance: "the step's own reason",
      },
    });
    expect(a.owner).toBe("Otto");
    expect(a.answer).toContain("07:00 Seek light");
    expect(a.answer).toContain("advance lever");
    expect(a.provenance).toBe("the step's own reason");
  });

  test("no context means the honest fallback, not a guess", () => {
    const a = crewAnswer("why", facts);
    expect(a.answer).toContain("Ask me about timing");
  });
});

describe("crewAnswer — what-if is a real solver re-run", () => {
  test("landing a day later gains a prep day and recomputes coverage", () => {
    const a = crewAnswer("what if I land a day later?", facts);
    expect(a.owner).toBe("Otto");
    expect(a.answer).toContain("Landing a day later");
    expect(a.answer).toContain("days to cover it");
    // The re-run is real: an extra prep day can only help or hold.
    const oldRes = coverageOf(TRIP, PLANS).residualMin;
    const newTrip = buildTrip("LHR", "HND", "2026-10-19", {
      preFlightDays: 4,
      postFlightDays: 1,
    });
    const solved = previewPlan({
      trip: newTrip,
      calendar: CAL.map((e) => {
        const label = TRIP.days[e.dayIndex]?.label;
        const idx = newTrip.days.findIndex((d) => d.label === label);
        return { ...e, dayIndex: idx };
      }).filter((e) => e.dayIndex >= 0),
      adherence: ADHERENCE_PROFILE,
      baseline: GARMIN_BASELINE,
    });
    const newRes = coverageOf(
      newTrip,
      [...solved.values()].flatMap((s) => (s ? [s.plan] : [])),
    ).residualMin;
    expect(newRes).toBeLessThanOrEqual(oldRes);
    expect(a.detail?.[0]).toContain(`${(newRes / 60).toFixed(1).replace(/\.0$/, "")}h`);
  });

  test("landing a day earlier spends a prep day — the delta is honest", () => {
    const a = crewAnswer("what if I land a day earlier?", facts);
    expect(a.answer).toContain("Landing a day earlier");
    // One fewer prep day: residual is worse or equal, and the line says which.
    expect(/worse|the same/.test(a.answer)).toBe(true);
  });

  test("a weekday parse lands on a bounded delta", () => {
    const a = crewAnswer("what if I land friday?", facts);
    expect(a.owner).toBe("Otto");
    expect(a.answer).toContain("Landing");
    expect(a.provenance).toBe("previewPlan re-run · coverageOf");
  });

  test("skipping a planned day un-covers its shift", () => {
    // D-1 banks nothing in this preview (a hold day) — ask for a day that
    // actually carries shift so the delta is non-trivial.
    const skipped = PLANS.find((d) => Math.abs(d.shiftMin) > 0)!;
    const a = crewAnswer(`what if I skip ${skipped.label}?`, facts);
    expect(a.owner).toBe("Otto");
    expect(a.answer).toContain(`${skipped.label} un-covered`);
    const minus = PLANS.map((d) =>
      d.dayIndex === skipped.dayIndex ? { ...d, shiftMin: 0, interventions: [] } : d,
    );
    const res = coverageOf(TRIP, minus).residualMin;
    expect(a.answer).toContain(`${(res / 60).toFixed(1).replace(/\.0$/, "")}h`);
    expect(a.detail?.[0]).toContain(`${Math.abs(skipped.shiftMin)}min`);
  });

  test("skipping a hold day is honestly a no-op", () => {
    const hold = PLANS.find((d) => d.shiftMin === 0);
    if (!hold) return; // no hold day in this fixture — nothing to pin
    const a = crewAnswer(`what if I skip ${hold.label}?`, facts);
    expect(a.answer).toContain("changes nothing");
  });
});

describe("crewAnswer — routing lands on the real owner", () => {
  test("conflicts route to Iris with the gate's own count", () => {
    const a = crewAnswer("who's watching for conflicts?", facts);
    expect(a.owner).toBe("Iris");
    expect(a.agent).toBe("evaluator");
    expect(a.answer).toContain("nothing flagged");
    expect(a.provenance).toBe("evaluatePlan");
  });

  test("a flagged calendar shows up in Iris's count", () => {
    const cal: CalendarEvent[] = [
      ...CAL,
      { id: "ev-c", title: "Site visit", dayIndex: 0, startMin: 7 * 60, endMin: 9 * 60, movable: false },
    ];
    const a = crewAnswer("who watches conflicts", { ...facts, calendar: cal });
    expect(a.answer).toMatch(/\d+ flags?/);
    expect(a.detail?.[0]).toContain("Site visit");
  });

  test("places route to Scout — a tool, no avatar", () => {
    const a = crewAnswer("who matched the places?", facts);
    expect(a.owner).toBe("Scout");
    expect(a.agent).toBeNull();
    expect(a.answer).toContain("3 places");
    expect(a.provenance).toContain("recorded Qloo sample");
  });

  test("baseline routes to Mara with the profile's own numbers", () => {
    const a = crewAnswer("who reads my baseline?", facts);
    expect(a.owner).toBe("Mara");
    expect(a.answer).toContain(GARMIN_BASELINE.chronotype);
    expect(a.answer).toContain(fmtMin(GARMIN_BASELINE.avgWakeMin));
  });

  test("calendar routes to Rex with the real tallies", () => {
    const a = crewAnswer("who moves my meetings?", facts);
    expect(a.owner).toBe("Rex");
    expect(a.answer).toContain("2 events moved");
  });

  test("science routes to Jun with the citation count", () => {
    const a = crewAnswer("who found the research?", facts);
    expect(a.owner).toBe("Jun");
    expect(a.answer).toContain("4 papers");
  });
});

describe("crewAnswer — when and fallback", () => {
  test("when is the caffeine cutoff names the solver's slot", () => {
    const cut = D3.interventions.find((iv) => iv.kind === "caffeine_cutoff")!;
    const a = crewAnswer("when is my caffeine cutoff?", facts);
    expect(a.owner).toBe("Otto");
    expect(a.answer).toContain(fmtMin(cut.startMin));
  });

  test("unmatched input gets the one honest fallback", () => {
    const a = crewAnswer("what's for lunch?", facts);
    expect(a.answer).toBe(
      "Ask me about timing — try 'why is light at 07:00?' or 'what if I land a day later?'",
    );
    expect(a.provenance).toContain("intent parser");
  });

  test("no trip is honest — never a templated answer", () => {
    const a = crewAnswer("why is light at 07:00?", { ...facts, trip: null });
    expect(a.answer).toContain("No trip on the table");
  });

  test("every intent names its provenance", () => {
    for (const q of [
      "why 07:00",
      "what if I land a day later",
      "who watches conflicts",
      "when is bedtime",
      "gibberish",
    ]) {
      const a = crewAnswer(q, facts);
      expect(a.provenance.length).toBeGreaterThan(0);
    }
  });
});

describe("crewAnswer — the surface keeps the motion + style laws", () => {
  const css = readFileSync(
    join(import.meta.dir, "..", "src", "app", "globals.css"),
    "utf8",
  );

  test("the answer's fade is the crew's own transform/opacity keyframes", () => {
    expect(css).toContain(".crew-answer {\n  animation: crew-fade-up 0.3s");
    const i = css.indexOf("@keyframes crew-fade-up");
    const kf = css.slice(i, css.indexOf("\n}", i));
    expect(kf).toContain("translateY");
    expect(kf).toContain("opacity");
    expect(kf).not.toContain("width");
  });

  test("reduced motion prints the answer instantly", () => {
    const rm = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce) {\n  .crew-answer"));
    expect(rm).toContain(".crew-answer { animation: none; }");
  });

  test("the ask field is token-styled — no hex in the new classes", () => {
    const block = css.slice(css.indexOf(".crew-ask {"), css.indexOf("/* Crew faces"));
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
  });
});
