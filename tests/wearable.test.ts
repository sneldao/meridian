import { describe, expect, test } from "bun:test";
import { baselineFromNights, parseGarminSleepCsv } from "../src/tools/wearable";

const CSV = `Calendar Date,Start,End,Sleep Time,Deep Sleep,Light Sleep,REM,Awake,Avg HRV
2026-10-12,23:41,06:50,7:09,1:30,4:20,1:19,0:32,46
2026-10-13,24:05,07:05,7:00,1:22,4:30,1:08,0:41,49
2026-10-14,23:58,06:42,6:44,1:15,4:25,1:04,0:37,50`;

describe("parseGarminSleepCsv", () => {
  test("parses a realistic export into per-night rows", () => {
    const out = parseGarminSleepCsv(CSV);
    expect("error" in out).toBe(false);
    if ("error" in out) return;
    expect(out.nights).toHaveLength(3);
    expect(out.nights[0]).toMatchObject({ date: "2026-10-12", bedtimeMin: 23 * 60 + 41, wakeMin: 6 * 60 + 50, sleepMin: 7 * 60 + 9, hrvMs: 46 });
  });

  test("a single usable night is not a baseline", () => {
    const out = parseGarminSleepCsv(`Date,Bedtime,Wake,Sleep\n2026-10-12,23:41,06:50,7:09`);
    expect("error" in out).toBe(true);
  });

  test("unparseable columns fail loudly, not halfway", () => {
    const out = parseGarminSleepCsv(`a,b,c\n1,2,3\n4,5,6`);
    expect("error" in out).toBe(true);
  });
});

describe("baselineFromNights", () => {
  test("averages the nights and derives chronotype from wake time", () => {
    const parsed = parseGarminSleepCsv(CSV);
    if ("error" in parsed) throw new Error(parsed.error);
    const b = baselineFromNights(parsed.nights);
    expect(b.avgWakeMin).toBe(Math.round((6 * 60 + 50 + 7 * 60 + 5 + 6 * 60 + 42) / 3));
    expect(b.chronotype).toBe("neutral");
    expect(b.source).toContain("3 nights");
    expect(b.nights).toHaveLength(3);
  });
});
