import { describe, expect, test } from "bun:test";
import {
  routeGapHeadline,
  routeGapLine,
  routeGapRead,
} from "../src/domain/route-gap";

// The landing's stakes line is a claim about the route being typed, so it is
// computed — and the computation itself is asserted here, not eyeballed.

describe("routeGapRead", () => {
  test("the canonical route reproduces the signature sentence's maths", () => {
    // LHR → HND in October: 8h eastbound. A 07:00 Tokyo morning is 420min,
    // and 420 + (−480) wraps to 23:00 body time — the line the landing led
    // with as static copy now falls out of the model.
    const r = routeGapRead({ origin: "LHR", dest: "HND", date: "2026-10-20" });
    expect(r).not.toBeNull();
    expect(r!.gapMin).toBe(480);
    expect(r!.direction).toBe("east");
    expect(r!.bodyMin).toBe(23 * 60);
    expect(r!.destName).toBe("Tokyo");
  });

  test("westbound flips the body clock the other way", () => {
    const r = routeGapRead({ origin: "HND", dest: "LHR", date: "2026-10-20" })!;
    expect(r.direction).toBe("west");
    expect(r.gapMin).toBe(480);
    expect(r.bodyMin).toBe(15 * 60); // 07:00 + 8h = 15:00 body time
  });

  test("lowercase drafts still resolve", () => {
    const r = routeGapRead({ origin: "lhr", dest: "hnd", date: "2026-10-20" });
    expect(r?.gapMin).toBe(480);
  });

  test("the gap honours daylight saving on the travel date", () => {
    // London↔Singapore is 8h in January (GMT) and 7h in June (BST) — the
    // read must move with the date, or the landing would quote a stale gap
    // for half the year. (London↔New York would be a trap: both observe
    // DST, so the gap is constant.)
    const jan = routeGapRead({ origin: "LHR", dest: "SIN", date: "2027-01-15" })!;
    const jun = routeGapRead({ origin: "LHR", dest: "SIN", date: "2027-06-15" })!;
    expect(jan.gapMin).toBe(480);
    expect(jun.gapMin).toBe(420);
  });

  test("airports the registry doesn't know get no read, never a guess", () => {
    expect(routeGapRead({ origin: "XXX", dest: "HND", date: "2026-10-20" })).toBeNull();
    expect(routeGapRead({ origin: "LHR", dest: "ZZZ", date: "2026-10-20" })).toBeNull();
  });
});

describe("routeGapHeadline / routeGapLine", () => {
  const tokyo = routeGapRead({ origin: "LHR", dest: "HND", date: "2026-10-20" })!;

  test("the headline names the moment, the place, and the body time", () => {
    expect(routeGapHeadline(tokyo)).toBe("A 07:00 morning in Tokyo is 23:00 body time.");
  });

  test("the compact line carries the gap and the direction", () => {
    expect(routeGapLine(tokyo)).toBe("8.0h to move · eastbound");
  });

  test("a zero-gap route says so instead of inventing a shift", () => {
    const flat = { ...tokyo, gapMin: 0, destName: "Reykjavik" };
    expect(routeGapHeadline(flat)).toBe("Reykjavik already runs on your body's time.");
    expect(routeGapLine(flat)).toBe("no shift to bank");
  });
});
