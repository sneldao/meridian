import { describe, expect, test } from "bun:test";
import { parseBooking } from "@/lib/booking";

const NOW = new Date("2026-06-01T12:00:00Z");

describe("parseBooking", () => {
  test("BA-style confirmation with parenthesised codes", () => {
    const r = parseBooking(
      "Your flight BA005 London Heathrow (LHR) to Tokyo Haneda (HND) departs Wed 21 Oct 2026 11:20",
      NOW,
    );
    expect(r).toEqual({ origin: "LHR", dest: "HND", date: "2026-10-21" });
  });

  test("arrow separator", () => {
    const r = parseBooking("LHR → HND on 2026-10-21", NOW);
    expect(r).toEqual({ origin: "LHR", dest: "HND", date: "2026-10-21" });
  });

  test("dash separator with day-first numeric date", () => {
    const r = parseBooking("Booking confirmed: JFK-LAX, 21/10/2026", NOW);
    expect(r).toEqual({ origin: "JFK", dest: "LAX", date: "2026-10-21" });
  });

  test("'to' separator with US month-first date", () => {
    const r = parseBooking("Flying JFK to LAX on Oct 21, 2026 at 9:00 AM", NOW);
    expect(r).toEqual({ origin: "JFK", dest: "LAX", date: "2026-10-21" });
  });

  test("yearless date rolls to next occurrence", () => {
    const r = parseBooking("LHR to HND departing 21 Oct", NOW);
    expect(r).toEqual({ origin: "LHR", dest: "HND", date: "2026-10-21" });
    const r2 = parseBooking("LHR to HND departing 3 Jan", NOW);
    expect(r2).toEqual({ origin: "LHR", dest: "HND", date: "2027-01-03" });
  });

  test("garbage → null", () => {
    expect(parseBooking("hello there, nothing to see", NOW)).toBeNull();
  });

  test("same airport twice → null", () => {
    expect(parseBooking("LHR to LHR on 2026-10-21", NOW)).toBeNull();
  });

  test("unknown codes are skipped", () => {
    const r = parseBooking("XYZ isn't an airport but LHR → HND on 2026-10-21 is", NOW);
    expect(r).toEqual({ origin: "LHR", dest: "HND", date: "2026-10-21" });
  });
});
