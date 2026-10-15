import { describe, expect, test } from "bun:test";
import {
  calendarConflicts,
  graphEnabled,
  graphSession,
  priorFailures,
  recallFindings,
  recordCheckInToGraph,
  recordFinding,
} from "../src/domain/graph-memory";

// FalkorDB is optional infrastructure — every path must no-op cleanly when
// FALKORDB_URL is unset or the database is down. These tests guard the
// "never breaks the run" invariant; live-query tests belong to the seeded
// manual check (`bun run seed:graph` + /api/graph/health).

describe("graph memory without FALKORDB_URL", () => {
  test("graphEnabled is false and tools report offline, not found", async () => {
    expect(graphEnabled()).toBe(false);

    const findings = await recallFindings("morning light");
    expect(findings.found).toBe(false);
    expect(findings.note).toBe("graph memory offline");
    expect(findings.rows).toBe(0);

    const failures = await priorFailures("light_exposure");
    expect(failures.found).toBe(false);
    expect(failures.note).toBe("graph memory offline");

    const conflicts = await calendarConflicts(0);
    expect(conflicts.found).toBe(false);
    expect(conflicts.rows).toBe(0);
  });

  test("write paths no-op instead of throwing", async () => {
    await expect(
      recordCheckInToGraph({ dayIndex: 1, kind: "light_exposure", status: "skipped", text: "x", at: Date.now() }),
    ).resolves.toBeUndefined();
    await expect(recordFinding("a finding", "some target")).resolves.toBeUndefined();
  });

  test("session label defaults to run-2 and is env-overridable", () => {
    expect(graphSession()).toBe(process.env.MERIDIAN_SESSION ?? "run-2");
  });
});
