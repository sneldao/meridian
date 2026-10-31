import { describe, expect, test } from "bun:test";
import { buildDayScene } from "../src/domain/day-scene";
import { buildDemoScenario } from "../src/domain/demo-scenarios";
import { buildTasteItinerary } from "../src/domain/taste-itinerary";
import { resolvePlaceChoice } from "../src/lib/place-choices";
import { sampleTasteProfile } from "../src/lib/sample-taste";
import { defaultDayCardOptions, publicDayCard, snapshotDayCard } from "../src/lib/day-card";

const demo = buildDemoScenario("jason", "2026-11-04");
const scene = buildDayScene({ ...demo, dayIndex: demo.event.dayIndex })!;
const profile = sampleTasteProfile("luke")!;
const itinerary = buildTasteItinerary(demo.trip, demo.plans, demo.calendar, { ...profile, status: "ready" }, "replay");
const idea = resolvePlaceChoice(itinerary, itinerary.suggestions[0], {});
const inputs = { idea, favorites: profile.favorites, eventSource: "fixture" as const, exampleBaseline: true, recordedTaste: true };
const all = { includeSchedule: true, includeEvent: true, includeBodyTime: true, includeTaste: true };

describe("day-card privacy projection", () => {
  test("a real trip with sample calendar/baseline does not opt into sharing", () => {
    const snapshot = snapshotDayCard(scene, inputs);
    const options = defaultDayCardOptions(snapshot);
    expect(Object.values(options)).toEqual([false, false, false, false]);
    const card = publicDayCard(snapshot, options);
    const serialized = JSON.stringify(card);
    for (const privateValue of [demo.event.title, scene.date, "08:30", "16:00", idea.place.name, profile.favorites[0].name, "13:45"]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(card.city).toBe("Tokyo");
    expect(card.dateLabel).toBeUndefined();
    expect(serialized).not.toContain("localMin");
    expect(serialized).not.toContain("bodyMin");
    expect(serialized).not.toContain("startMin");
  });

  test("explicit settings disclose only their named categories", () => {
    const snapshot = snapshotDayCard(scene, inputs);
    const off = defaultDayCardOptions(snapshot);
    const schedule = JSON.stringify(publicDayCard(snapshot, { ...off, includeSchedule: true }));
    expect(schedule).toContain(scene.date);
    expect(schedule).toContain("12:45");
    expect(schedule).not.toContain(demo.event.title);
    expect(schedule).not.toContain(idea.place.name);
    const event = JSON.stringify(publicDayCard(snapshot, { ...off, includeEvent: true }));
    expect(event).toContain(demo.event.title);
    expect(event).toContain("16:00");
    expect(event).not.toContain("08:30");
    const body = JSON.stringify(publicDayCard(snapshot, { ...off, includeBodyTime: true }));
    expect(body).toContain("08:30");
    expect(body).toContain("not measured alertness");
    expect(body).not.toContain(demo.event.title);
    const taste = JSON.stringify(publicDayCard(snapshot, { ...off, includeTaste: true }));
    expect(taste).toContain(idea.place.name);
    expect(taste).toContain(profile.favorites[0].name);
    expect(taste).not.toContain("13:45");
    expect(taste).toContain("Recorded Qloo sample");
    expect(taste).toContain("unverified");
  });

  test("fictional journeys retain their disclosures in the public artifact", () => {
    const snapshot = snapshotDayCard(scene, { ...inputs, fictionalTrip: true });
    expect(defaultDayCardOptions(snapshot)).toEqual(all);
    const card = publicDayCard(snapshot, all);
    expect(card.notices.join(" ")).toContain("Not actual personal data or an endorsement");
    expect(card.notices.join(" ")).toContain("not a record of completed steps");
    expect(card.notices.join(" ")).toContain("Example sleep profile");
    expect(card.sections[0].lines).toContain("08:30 estimated body time at the event");
  });

  test("dismissed/unavailable or different-date ideas are never exported", () => {
    for (const status of ["dismissed", "unavailable"] as const) {
      const snapshot = snapshotDayCard(scene, { ...inputs, idea: { ...idea, status } });
      expect(snapshot.place).toBeNull();
      expect(JSON.stringify(publicDayCard(snapshot, all))).not.toContain(idea.place.name);
    }
    const prep = buildDayScene({ ...demo, dayIndex: 0 })!;
    const snapshot = snapshotDayCard(prep, inputs);
    expect(snapshot.place).toBeNull();
    expect(snapshot.moment).toBeNull();
    expect(JSON.stringify(publicDayCard(snapshot, all))).not.toContain(demo.event.title);
  });

  test("snapshot fields are detached from mutable inputs and stale taste stays labeled", () => {
    const mutableScene = structuredClone(scene);
    const mutableIdea = structuredClone(idea);
    const mutableFavorites = structuredClone(profile.favorites);
    const snapshot = snapshotDayCard(mutableScene, { ...inputs, idea: mutableIdea, favorites: mutableFavorites, staleTaste: true });
    const before = JSON.stringify(snapshot);
    mutableScene.city.name = "Changed city";
    mutableScene.moment!.title = "Changed title";
    mutableIdea.place.name = "Changed venue";
    mutableFavorites[0].name = "Changed favorite";
    expect(JSON.stringify(snapshot)).toBe(before);
    expect(publicDayCard(snapshot, all).notices.join(" ")).toContain("earlier recommendation snapshot");
  });

  test("missing and preview plans do not become confirmed or completed", () => {
    const missing = buildDayScene({ ...demo, plans: [], dayIndex: demo.event.dayIndex })!;
    expect(publicDayCard(snapshotDayCard(missing), all).status).toBe("No verified plan for this day");
    expect(publicDayCard(snapshotDayCard(scene, { preview: true }), all).status).toBe("Plan preview");
  });
});
