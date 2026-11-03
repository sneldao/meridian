import { describe, expect, test } from "bun:test";

/* The prod failure of 2026-11-03, reproduced locally: a dead provider key
 * makes every agent's stream end with an SDK error, runAgent used to drop
 * that silently, and the visible result was "planner submitted nothing" for
 * every day with 0 days locked — while the provider-fallback chain and the
 * replay transcript insurance never fired, because nothing threw.
 *
 * runAgent is not exported, so this drives runCrew end to end: the primary
 * provider uplink points at a closed local port, every agent fails, and the
 * outer catch drains the recorded transcript instead. Coverage: one crew
 * failure must be visible (error events, not day-by-day planner silence) and
 * the run must still finish with locked days. */

describe("a dead provider uplink fails loudly and falls back to the transcript", () => {
  test("stream errors are surfaced as errors; the run still locks days", () => {
    const script = `
      const { runCrew } = await import("./src/agents/runtime.ts");
      const { buildTrip, calendarFor } = await import("./src/domain/fixtures.ts");
      const trip = buildTrip("LHR", "HND", "2026-11-04");
      const errors = [];
      let locked = 0, plannerSilence = 0, done = 0;
      for await (const e of runCrew({ trip, calendar: calendarFor(trip) })) {
        if (e.type === "error") {
          errors.push(e.message);
          if (e.message.includes("planner submitted nothing")) plannerSilence++;
        }
        if (e.type === "day_locked") locked++;
        if (e.type === "done") done++;
      }
      if (plannerSilence !== 0) throw new Error("planner silence leaked into the feed: " + plannerSilence);
      if (done !== 1) throw new Error("run did not finish");
      if (locked === 0) throw new Error("replay fallback did not lock any days");
      if (!errors.some((m) => /uplink failed|stream failed/.test(m))) {
        throw new Error("no failure surfaced at all: " + JSON.stringify(errors));
      }
      console.log("ok");
    `;
    const out = Bun.spawnSync({
      cmd: ["bun", "-e", script],
      cwd: process.cwd(),
      env: {
        ...process.env,
        // Primary uplink dead: first fetch hits a closed port. No fallbacks
        // configured, so the chain is primary → replay transcript.
        AGENT_PROVIDER: "nebius",
        NEBIUS_BASE_URL: "http://127.0.0.1:1/v1",
        AGENT_PROVIDER_FALLBACK: "",
        REPLAY_BEAT_MS: "0",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    // The SDK prints provider failure stacks to its own stderr (including in
    // production logs); the assertion is about the event feed and the run.
    expect(out.stderr.toString()).not.toContain("planner submitted nothing");
    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString()).toContain("ok");
  }, 120000);
});
