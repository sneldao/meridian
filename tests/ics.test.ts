import { describe, expect, test } from "bun:test";
import { buildIcs as buildIcsLib } from "../src/lib/ics";
import { buildIcs as buildIcsTools } from "../src/tools/calendar";
import { buildDemoScenario } from "../src/domain/demo-scenarios";
import type { CalendarEvent } from "../src/domain/types";

/* One builder, two callers: the client edits the same feed the server wrote.
   The tools module must re-export the lib function so server and client can
   never drift. */

const demo = buildDemoScenario("miles", "2026-11-04");
const cal: CalendarEvent[] = [
  { id: "ev-1", title: "Standup", dayIndex: 0, startMin: 600, endMin: 630,
    movedTo: { dayIndex: 1, startMin: 660, endMin: 690 } },
  { id: "ev-2", title: "Board meeting", dayIndex: 1, startMin: 840, endMin: 900 },
];

describe("buildIcs", () => {
  test("tools/calendar re-exports the client-safe lib builder", () => {
    expect(buildIcsTools).toBe(buildIcsLib);
  });

  test("same inputs → same output, byte for byte", () => {
    const a = buildIcsLib(cal, demo.trip, demo.plans);
    const b = buildIcsLib(cal, demo.trip, demo.plans);
    expect(a).toBe(b);
    expect(a).toContain("BEGIN:VCALENDAR");
    expect(a).toContain("DTSTART:");
    // Committed moves move the event and say so.
    expect(a).toContain("(rescheduled by Meridian)");
    // Plan cues carry alarms.
    expect(a).toContain("BEGIN:VALARM");
    expect(a).toContain("☀ Light window opens");
    // Edited days shift cue times — same builder, new times.
    const moved = demo.plans.map((d, i) =>
      i === 0 ? { ...d, interventions: d.interventions.map((iv) => ({ ...iv, startMin: iv.startMin + 30 })) } : d,
    );
    const c = buildIcsLib(cal, demo.trip, moved);
    expect(c).not.toBe(a);
  });
});

/* Input parity: what the client rebuilds must match what the server wrote.
   The recorded run's briefing carries the server's ics; rebuilding it
   client-side from the run state must agree, or the edit path silently
   writes a different feed than the traveller subscribed to. */

import { calendarWithMoves, initialRunState, reduceRun, type StampedEvent } from "../src/state/run";

describe("client rebuild equals the server ics", () => {
  test("calendarWithMoves + locked days reproduce the briefing ics", async () => {
    process.env.AGENT_PROVIDER = "replay";
    process.env.REPLAY_BEAT_MS = "0";
    const { runCrew } = await import("../src/agents/runtime");
    const seen: StampedEvent[] = [];
    let t = 0;
    for await (const e of runCrew()) seen.push({ event: e, t: (t += 10) });
    const run = reduceRun(initialRunState(), { kind: "batch", items: seen });
    expect(run.briefing?.ics).toContain("BEGIN:VCALENDAR");
    const rebuilt = buildIcsLib(
      calendarWithMoves(run),
      run.trip!,
      [...run.locked.values()],
    );
    // DTSTAMP is a wall-clock stamp at write time — normalise it for the
    // comparison; everything else must match exactly.
    const norm = (s: string) => s.replace(/DTSTAMP:[^\r\n]*/g, "DTSTAMP:X");
    const server = norm(run.briefing!.ics!);
    const client = norm(rebuilt);
    if (client !== server) {
      const a = server.split("\r\n"), b = client.split("\r\n");
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) {
          throw new Error(`first difference at line ${i}:\nserver: ${a[i]}\nclient: ${b[i]}`);
        }
      }
    }
    expect(client).toBe(server);
  }, 30000);
});
