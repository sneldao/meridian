import { describe, expect, test } from "bun:test";
import { fmtUtcOffset, localClock } from "../src/domain/timezones";

// The hover tooltip prints the wall time of whatever city the pointer touches,
// so the two things that must be true: it is that city's own clock, and it is
// honest across DST edges (the exact class of error that makes a travel-faith
// product look careless).

describe("localClock", () => {
  test("prints the zone's wall time, not the server's", () => {
    expect(localClock("Asia/Tokyo", new Date("2026-10-17T00:30:00Z"))).toBe("09:30");
    expect(localClock("Europe/London", new Date("2026-10-17T00:30:00Z"))).toBe("01:30");
  });

  test("half-hour zones are half-hour", () => {
    // India is +5:30; Nepal even +5:45.
    expect(localClock("Asia/Kolkata", new Date("2026-10-17T00:30:00Z"))).toBe("06:00");
    expect(localClock("Asia/Kathmandu", new Date("2026-10-17T00:30:00Z"))).toBe("06:15");
  });

  test("is DST-honest through a real clock change", () => {
    // London leaves BST the morning of Sun 25 Oct 2026: still UTC+1 at 00:30Z…
    expect(localClock("Europe/London", new Date("2026-10-25T00:30:00Z"))).toBe("01:30");
    // …and GMT by 02:00Z, without the caller telling us anything.
    expect(localClock("Europe/London", new Date("2026-10-25T02:00:00Z"))).toBe("02:00");
  });
});

describe("fmtUtcOffset", () => {
  test("signs and the odd hours and minutes are right", () => {
    expect(fmtUtcOffset(60)).toBe("UTC+1");
    expect(fmtUtcOffset(480)).toBe("UTC+8");
    expect(fmtUtcOffset(-450)).toBe("UTC−7:30");
    expect(fmtUtcOffset(330)).toBe("UTC+5:30");
    expect(fmtUtcOffset(0)).toBe("UTC+0");
  });
});
