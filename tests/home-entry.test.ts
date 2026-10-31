import { describe, expect, test } from "bun:test";
import {
  isValidHomeRoute,
  readHomeRoute,
  resolveHomeEntry,
  routeFromTrip,
} from "../src/lib/home-entry";
import { buildTrip } from "../src/domain/fixtures";

const route = { origin: "LHR", dest: "HND", date: "2026-05-10" };
const empty = new URLSearchParams("");

describe("isValidHomeRoute", () => {
  test("a real route passes", () => {
    expect(isValidHomeRoute(route)).toBe(true);
  });

  test("unknown, missing or same airports fail", () => {
    expect(isValidHomeRoute({ ...route, origin: "XXX" })).toBe(false);
    expect(isValidHomeRoute({ ...route, origin: "HND" })).toBe(false);
    expect(isValidHomeRoute({ ...route, origin: "" })).toBe(false);
    expect(isValidHomeRoute({ ...route, origin: 42 as unknown as string })).toBe(false);
  });

  test("impossible or malformed dates fail", () => {
    expect(isValidHomeRoute({ ...route, date: "2026-02-30" })).toBe(false);
    expect(isValidHomeRoute({ ...route, date: "2026-13-01" })).toBe(false);
    expect(isValidHomeRoute({ ...route, date: "10/05/2026" })).toBe(false);
    expect(isValidHomeRoute({ ...route, date: "2026-5-1" })).toBe(false);
    expect(isValidHomeRoute({ ...route, date: "" })).toBe(false);
  });

  test("airport codes normalise to upper case", () => {
    expect(isValidHomeRoute({ ...route, origin: "lhr" })).toBe(true);
  });
});

describe("readHomeRoute / routeFromTrip", () => {
  test("reads the plain route shape and rejects anything else", () => {
    expect(readHomeRoute(JSON.stringify(route))).toEqual(route);
    expect(readHomeRoute("not json")).toBeNull();
    expect(readHomeRoute(null)).toBeNull();
    expect(readHomeRoute(JSON.stringify({ origin: "LHR" }))).toBeNull();
    expect(readHomeRoute(JSON.stringify({ ...route, dest: "LHR" }))).toBeNull();
  });

  test("extracts the route from a stored trip, validating it", () => {
    const trip = buildTrip("LHR", "HND", "2026-05-10");
    const depDate = trip.days.find((d) => d.dayIndex === trip.departureDayIndex)!.date;
    expect(routeFromTrip(JSON.stringify(trip))).toEqual({
      origin: "LHR",
      dest: "HND",
      date: depDate,
    });
    expect(routeFromTrip(null)).toBeNull();
    expect(routeFromTrip("{oops")).toBeNull();
    expect(routeFromTrip(JSON.stringify({ origin: { code: "LHR" } }))).toBeNull();
  });
});

describe("resolveHomeEntry", () => {
  test("cold storage and no query is first-use setup", () => {
    expect(resolveHomeEntry(empty, null, null)).toEqual({
      mode: "setup",
      route: null,
      clockOpen: false,
    });
  });

  test("a saved route restores the trip, whatever today's date is", () => {
    const res = resolveHomeEntry(empty, JSON.stringify(route), null);
    expect(res.mode).toBe("trip");
    expect(res.route).toEqual(route);
  });

  test("a legacy saved trip still restores (backcompat)", () => {
    const trip = buildTrip("SFO", "SIN", "2026-06-01");
    const res = resolveHomeEntry(empty, null, JSON.stringify(trip));
    expect(res.mode).toBe("trip");
    expect(res.route?.origin).toBe("SFO");
    expect(res.route?.dest).toBe("SIN");
  });

  test("a valid explicit URL route beats the saved trip", () => {
    const q = new URLSearchParams("origin=jfk&dest=cdg&date=2026-07-04");
    const res = resolveHomeEntry(q, JSON.stringify(route), null);
    expect(res.mode).toBe("trip");
    expect(res.route).toEqual({ origin: "JFK", dest: "CDG", date: "2026-07-04" });
  });

  test("a malformed or partial explicit route is setup, never stale-trip fallback", () => {
    for (const qs of [
      "origin=LHR",
      "origin=LHR&dest=HND",
      "origin=LHR&dest=HND&date=2026-02-30",
      "origin=NOPE&dest=HND&date=2026-05-10",
      "origin=LHR&dest=LHR&date=2026-05-10",
    ]) {
      const res = resolveHomeEntry(new URLSearchParams(qs), JSON.stringify(route), null);
      expect(res.mode).toBe("setup");
      expect(res.route).toBeNull();
    }
  });

  test("corrupt storage is setup, not a crash", () => {
    const res = resolveHomeEntry(empty, "{oops", "[1,2]");
    expect(res.mode).toBe("setup");
  });

  test("example=1 overrides a saved trip", () => {
    const res = resolveHomeEntry(new URLSearchParams("example=1"), JSON.stringify(route), null);
    expect(res.mode).toBe("example");
    expect(res.route).toBeNull();
  });

  test("view=clock opens the explanation and keeps the trip", () => {
    const res = resolveHomeEntry(new URLSearchParams("view=clock"), JSON.stringify(route), null);
    expect(res.mode).toBe("trip");
    expect(res.clockOpen).toBe(true);
  });
});
