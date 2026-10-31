import { describe, expect, test } from "bun:test";
import { resolveTheme, sunUp, type SunPlace } from "../src/domain/theme";

// The night palette used to follow the phone. These tests are the seam that
// stops it: the destination's sun decides, and the device decides only when
// there is no destination yet.

const GREENWICH_EQUATOR: SunPlace = { lat: 0, lon: 0 };
const TOKYO: SunPlace = { lat: 35.6842, lon: 139.6915, name: "Tokyo" };
const SVALBARD: SunPlace = { lat: 78.2232, lon: 15.6267, name: "Longyearbyen" };

const at = (iso: string) => new Date(iso);
const device = (choice: "auto" | "light" | "dark", deviceHour: number, osDark = false) =>
  ({ choice, osDark, deviceHour });

describe("theme follows the sun, not the phone", () => {
  test("an explicit choice wins over everything", () => {
    expect(resolveTheme({ ...device("light", 3, true), place: TOKYO, at: at("2026-05-11T23:00:00Z") })).toBe("");
    expect(resolveTheme({ ...device("dark", 12, false), place: TOKYO, at: at("2026-05-11T02:00:00Z") })).toBe("night");
  });

  test("auto with no destination keeps the old device behaviour", () => {
    expect(resolveTheme({ ...device("auto", 12) })).toBe("");
    expect(resolveTheme({ ...device("auto", 21) })).toBe("night");
    expect(resolveTheme({ ...device("auto", 5) })).toBe("night");
    expect(resolveTheme({ ...device("auto", 12, true) })).toBe("night");
  });

  test("a known destination overrides the device clock both ways", () => {
    // 03:00 on the phone, 12:00 sunlight at the prime meridian.
    expect(resolveTheme({ ...device("auto", 3, true), place: GREENWICH_EQUATOR, at: at("2026-03-20T12:00:00Z") })).toBe("");
    // 12:00 on the phone, midnight at the prime meridian.
    expect(resolveTheme({ ...device("auto", 12), place: GREENWICH_EQUATOR, at: at("2026-03-20T00:00:00Z") })).toBe("night");
  });

  test("Tokyo at 09:00 local is a morning, whatever the phone says", () => {
    const morning = at("2026-05-11T00:00:00Z"); // 09:00 JST
    const evening = at("2026-05-11T12:00:00Z"); // 21:00 JST
    expect(sunUp(TOKYO, morning)).toBe(true);
    expect(sunUp(TOKYO, evening)).toBe(false);
    expect(resolveTheme({ ...device("auto", 2), place: TOKYO, at: morning })).toBe("");
    expect(resolveTheme({ ...device("auto", 10), place: TOKYO, at: evening })).toBe("night");
  });

  test("the polar caps make this more than a clock", () => {
    // Midnight sun and polar night are both answered by the model, not an hour.
    expect(sunUp(SVALBARD, at("2026-06-21T00:00:00Z"))).toBe(true);
    expect(sunUp(SVALBARD, at("2026-12-21T12:00:00Z"))).toBe(false);
    expect(resolveTheme({ ...device("auto", 12, true), place: SVALBARD, at: at("2026-06-21T00:00:00Z") })).toBe("");
    expect(resolveTheme({ ...device("auto", 12, false), place: SVALBARD, at: at("2026-12-21T12:00:00Z") })).toBe("night");
  });

  test("sunrise and sunset are the flip points, not a rounded hour", () => {
    // Tokyo sunrise in mid-May is ~04:35 local (19:35Z the day before).
    expect(sunUp(TOKYO, at("2026-05-10T18:30:00Z"))).toBe(false);
    expect(sunUp(TOKYO, at("2026-05-10T20:30:00Z"))).toBe(true);
  });
});
