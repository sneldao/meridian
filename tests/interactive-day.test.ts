import { describe, expect, test } from "bun:test";
import { laneRows, readInteractiveDay } from "../src/domain/interactive-day";
import { buildDayScene } from "../src/domain/day-scene";
import { buildDemoScenario } from "../src/domain/demo-scenarios";
import { fmtMin } from "../src/domain/circadian";
import type { DaySceneModel, SceneWindow } from "../src/domain/day-scene";

/* The interactive day reads the scene — never writes it. Every line the
 * crew speaks is built from model values through fmtMin; the states follow
 * the round-31 rules (Otto explains selections, Iris speaks only when
 * there is something to check). */

const demo = buildDemoScenario("miles", "2026-11-04");
const scene = buildDayScene({ ...demo, dayIndex: demo.event.dayIndex })!;

const fakeWindow = (over: Partial<SceneWindow>): SceneWindow => ({
  id: "99:0",
  kind: "reduce",
  label: "Reduce light",
  startMin: 900,
  endMin: 1020,
  continuesBefore: false,
  continuesAfter: false,
  fromEarlierDay: false,
  ...over,
});

const withWindow = (w: SceneWindow): DaySceneModel => ({
  ...scene,
  windows: [...scene.windows, w].sort((a, b) => a.startMin - b.startMin),
});

describe("readInteractiveDay", () => {
  test("window selection lands the cursor on the window start and Otto explains it", () => {
    const w = scene.windows[0];
    const read = readInteractiveDay(scene, { type: "window", windowId: w.id });
    expect(read.minute).toBe(w.startMin);
    expect(read.selectedWindow?.id).toBe(w.id);
    const otto = read.crew[0];
    expect(otto.agent).toBe("planner");
    expect(otto.state).toBe("explaining");
    expect(otto.line).toContain(w.label);
    expect(otto.line).toContain(fmtMin(w.startMin));
    expect(otto.line).toContain(w.endMin >= 1440 ? "24:00" : fmtMin(w.endMin));
  });

  test("a time inside a window reports it active", () => {
    const w = scene.windows[0];
    const inside = Math.floor((w.startMin + w.endMin) / 2);
    const read = readInteractiveDay(scene, { type: "time", minute: inside });
    expect(read.activeWindows.map((x) => x.id)).toContain(w.id);
    expect(read.crew[0].state).toBe("attentive");
  });

  test("a time at the moment puts Iris on it, in body time", () => {
    expect(scene.momentDayIndex).toBe(scene.dayIndex);
    const m = scene.moment!;
    const read = readInteractiveDay(scene, { type: "time", minute: m.localMin });
    const iris = read.crew[1];
    expect(iris.agent).toBe("evaluator");
    expect(iris.state).toBe("attentive");
    expect(iris.line).toContain(m.title);
    expect(iris.line).toContain(fmtMin(m.bodyMin));
  });

  test("a window overlapping the moment worries Iris", () => {
    const m = scene.moment!;
    const s2 = withWindow(fakeWindow({ startMin: m.localMin - 30, endMin: m.localMin + 60 }));
    const read = readInteractiveDay(s2, { type: "window", windowId: "99:0" });
    expect(read.crew[1].state).toBe("concerned");
    expect(read.crew[1].line).toContain(m.title);
  });

  test("a carried-over window gets Iris's attention without alarm", () => {
    const s2 = withWindow(fakeWindow({ startMin: 0, endMin: 240, continuesBefore: true, fromEarlierDay: true }));
    const read = readInteractiveDay(s2, { type: "window", windowId: "99:0" });
    expect(read.crew[1].state).toBe("attentive");
    expect(read.crew[1].line).toContain("carries over");
  });

  test("nothing to check — Iris rests in silence", () => {
    let quiet = -1;
    for (let m = 0; m < 1440; m++) {
      const far = Math.abs(m - scene.moment!.localMin) > 15;
      const inWindow = scene.windows.some((w) => m >= w.startMin && m < w.endMin);
      if (far && !inWindow) { quiet = m; break; }
    }
    expect(quiet).toBeGreaterThanOrEqual(0);
    const read = readInteractiveDay(scene, { type: "time", minute: quiet });
    expect(read.crew[1].state).toBe("resting");
    expect(read.crew[1].line).toBeNull();
  });

  test("nextWindow is the first window starting after the minute", () => {
    const read = readInteractiveDay(scene, { type: "time", minute: 0 });
    const expected = scene.windows.find((w) => w.startMin > 0) ?? null;
    expect(read.nextWindow?.id ?? null).toBe(expected?.id ?? null);
    const last = scene.windows[scene.windows.length - 1];
    const after = readInteractiveDay(scene, { type: "time", minute: last.startMin });
    expect(after.nextWindow).toBeNull();
  });

  test("the three reads play three roles — selection, why, facts", () => {
    const w = scene.windows.find((x) => x.kind === "seek") ?? scene.windows[0];
    const read = readInteractiveDay(scene, { type: "window", windowId: w.id });
    // The lead names what the minute holds — the window and its end — not
    // the headline's "next".
    expect(read.lead).toContain(w.label.toLowerCase());
    expect(read.lead).toContain(w.endMin >= 1440 ? "24:00" : fmtMin(w.endMin));
    // Otto carries the purpose; the panel carries the facts.
    expect(read.crew[0].line).toContain(fmtMin(w.startMin));
    expect(read.crew[0].line).not.toBe(read.explanation);
    expect(read.explanation).toContain("estimated body time");
    expect(new Set([read.lead, read.crew[0].line, read.explanation]).size).toBe(3);
  });

  test("the lead never restates the headline's 'next'", () => {
    // The old lead repeated the headline verbatim ("Next: X" under
    // "— next: X"). Now it adds what the headline lacks: the window the
    // minute sits inside, the moment marker, or the open-air invitation.
    for (const m of [0, 120, 500, 960, 1200, 1439]) {
      const read = readInteractiveDay(scene, { type: "time", minute: m });
      expect(read.lead).not.toBe(read.headline);
      if (read.nextWindow && !read.activeWindows.length) {
        expect(read.lead).not.toContain(`Next: ${read.nextWindow.label}`);
      }
      if (read.activeWindows.length) {
        expect(read.lead).toContain("Inside");
      }
    }
    const last = scene.windows[scene.windows.length - 1];
    const after = readInteractiveDay(scene, { type: "time", minute: last.startMin });
    expect(after.lead).toContain(last.label.toLowerCase());
  });

  test("nextWindow is the minimum startMin after the minute, sorted or not", () => {
    const shuffled: DaySceneModel = {
      ...scene,
      windows: [...scene.windows].reverse(),
    };
    const read = readInteractiveDay(shuffled, { type: "time", minute: 0 });
    const expected = [...scene.windows]
      .filter((w) => w.startMin > 0)
      .sort((a, b) => a.startMin - b.startMin)[0] ?? null;
    expect(read.nextWindow?.id ?? null).toBe(expected?.id ?? null);
  });

  test("laneRows stacks overlapping footprints and leaves the rest on one row", () => {
    const w = (id: string, startMin: number, endMin: number): SceneWindow => ({
      id, kind: "reduce", label: "Reduce light", startMin, endMin,
      continuesBefore: false, continuesAfter: false, fromEarlierDay: false,
    });
    // Two windows 30m apart with a 60m footprint must stack; a third, clear.
    const layout = laneRows([w("a", 100, 160), w("b", 130, 200), w("c", 600, 700)], 60);
    expect(layout.rows).toEqual([0, 1, 0]);
    expect(layout.rowCount).toBe(2);
    // A window clamped inside the day still counts its footprint.
    const late = laneRows([w("x", 1400, 1440), w("y", 1420, 1440)], 60);
    expect(late.rows[0]).not.toBe(late.rows[1]);
    // Disjoint windows never stack.
    const clear = laneRows([w("p", 100, 200), w("q", 800, 900)], 60);
    expect(clear.rowCount).toBe(1);
    expect(clear.rows).toEqual([0, 0]);
  });

  test("the headline carries the city, the time, and what's next", () => {
    const read = readInteractiveDay(scene, { type: "time", minute: 0 });
    expect(read.headline).toContain(scene.city.name);
    expect(read.headline).toContain(fmtMin(0));
    if (read.nextWindow) {
      expect(read.headline).toContain(read.nextWindow.label);
      expect(read.headline).toContain(fmtMin(read.nextWindow.startMin));
    }
  });

  test("reading never mutates the scene", () => {
    const before = JSON.stringify(scene);
    for (const w of scene.windows) {
      readInteractiveDay(scene, { type: "window", windowId: w.id });
    }
    for (const m of [0, 500, 960, 1439]) {
      readInteractiveDay(scene, { type: "time", minute: m });
    }
    expect(JSON.stringify(scene)).toBe(before);
  });
});
