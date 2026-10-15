import { describe, expect, test } from "bun:test";
import { buildTrip } from "../src/domain/fixtures";
import { instantOf, tripClockOf, zoneOffsetMin } from "../src/tools/calendar-google";

const trip = buildTrip("LHR", "HND", "2026-10-18");
const at = (iso: string) => Date.parse(iso);

describe("zone offsets", () => {
  test("London is UTC+1 in October (BST)", () => {
    expect(zoneOffsetMin("Europe/London", at("2026-10-19T12:00:00Z"))).toBe(60);
  });

  test("a wall time with no offset is read as London wall time", () => {
    expect(instantOf("2026-10-19T06:00:00", "Europe/London")).toBe(at("2026-10-19T05:00:00Z"));
  });

  test("a timestamp that carries an offset is used as-is", () => {
    expect(instantOf("2026-10-19T06:00:00+01:00", "Europe/London")).toBe(at("2026-10-19T05:00:00Z"));
  });
});

describe("trip clock", () => {
  test("pre-flight events stay in home time", () => {
    // 09:00 London on D-3 (15 Oct).
    const c = tripClockOf(at("2026-10-15T08:00:00Z"), trip, "Europe/London");
    expect(c).toEqual({ dayIndex: 0, startMin: 9 * 60 });
  });

  test("the client pitch is 06:00 London on D+1, which is 14:00 Tokyo", () => {
    const c = tripClockOf(at("2026-10-19T05:00:00Z"), trip, "Europe/London");
    expect(c).toEqual({ dayIndex: 4, startMin: 14 * 60 });
  });

  test("an instant outside the trip window is dropped", () => {
    expect(tripClockOf(at("2026-12-01T05:00:00Z"), trip, "Europe/London")).toBeNull();
  });
});
