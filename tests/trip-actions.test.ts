import { describe, expect, test } from "bun:test";
import {
  acknowledgeTripActions,
  readTripActions,
  toggleTripAction,
  type ActionMark,
  type TripActionState,
} from "../src/lib/trip-actions";
import {
  derivePendingMarks,
  hydrateTripActionsFromStorage,
  persistTripActionsToStorage,
} from "../src/lib/use-trip-actions";

const act = (over: Partial<Omit<ActionMark, "status">> = {}): Omit<ActionMark, "status"> => ({
  id: "D-1-sunlight",
  dayIndex: 2,
  kind: "light_exposure",
  startMin: 420,
  text: "did: Get outside light",
  at: 1_700_000_000_000,
  ...over,
});

const EMPTY: TripActionState = { completedIds: [], marks: {}, pendingIds: [] };

describe("toggleTripAction", () => {
  test("done marks the step complete and queues the check-in", () => {
    const s = toggleTripAction(EMPTY, act(), "done");
    expect(s.completedIds).toEqual(["D-1-sunlight"]);
    expect(s.pendingIds).toEqual(["D-1-sunlight"]);
    expect(s.marks["D-1-sunlight"].status).toBe("done");
  });

  test("same status again un-marks — done and skip toggle off", () => {
    let s = toggleTripAction(EMPTY, act(), "done");
    s = toggleTripAction(s, act(), "done");
    expect(s).toEqual(EMPTY);
    s = toggleTripAction(s, act(), "skipped");
    s = toggleTripAction(s, act(), "skipped");
    expect(s).toEqual(EMPTY);
  });

  test("done and skip are mutually exclusive — opposite status replaces", () => {
    let s = toggleTripAction(EMPTY, act(), "done");
    s = toggleTripAction(s, act({ text: "skipped: Get outside light" }), "skipped");
    expect(s.completedIds).toEqual([]);
    expect(s.marks["D-1-sunlight"].status).toBe("skipped");
    s = toggleTripAction(s, act(), "done");
    expect(s.marks["D-1-sunlight"].status).toBe("done");
    expect(s.completedIds).toEqual(["D-1-sunlight"]);
  });

  test("a legacy done (completedIds, no mark) toggles off like a marked done", () => {
    const legacy: TripActionState = { completedIds: ["D-1-sunlight"], marks: {}, pendingIds: [] };
    const s = toggleTripAction(legacy, act(), "done");
    expect(s.completedIds).toEqual([]);
    expect(s.pendingIds).toEqual([]);
  });

  test("per-step and per-day ids are independent", () => {
    let s = toggleTripAction(EMPTY, act({ id: "D-1-sunlight", dayIndex: 2 }), "done");
    s = toggleTripAction(s, act({ id: "D-2-sleep", dayIndex: 3 }), "skipped");
    expect(s.completedIds).toEqual(["D-1-sunlight"]);
    expect(new Set(s.pendingIds)).toEqual(new Set(["D-1-sunlight", "D-2-sleep"]));
  });

  test("never mutates the caller's state", () => {
    const before: TripActionState = { completedIds: ["x"], marks: {}, pendingIds: [] };
    const frozen = JSON.parse(JSON.stringify(before));
    toggleTripAction(before, act(), "done");
    expect(before).toEqual(frozen);
  });

  test("prototype-named ids cannot pollute the ledger", () => {
    const s = toggleTripAction(EMPTY, act({ id: "__proto__" }), "done");
    expect(s.marks["__proto__"].status).toBe("done");
    expect(Object.getPrototypeOf(s.marks)).toBeNull();
    expect({} as Record<string, unknown>["__proto__"]).not.toBe("done");
  });
});

describe("acknowledgeTripActions", () => {
  test("clears the pending queue but keeps the marks — submitted skips stay skipped", () => {
    let s = toggleTripAction(EMPTY, act(), "skipped");
    s = toggleTripAction(s, act({ id: "D-1-sleep" }), "done");
    s = acknowledgeTripActions(s, ["D-1-sunlight", "D-1-sleep"]);
    expect(s.pendingIds).toEqual([]);
    expect(s.marks["D-1-sunlight"].status).toBe("skipped");
    expect(s.marks["D-1-sleep"].status).toBe("done");
    expect(s.completedIds).toEqual(["D-1-sleep"]);
  });
});

describe("readTripActions", () => {
  test("round-trips through storage", () => {
    let s = toggleTripAction(EMPTY, act(), "skipped");
    s = toggleTripAction(s, act({ id: "D-2-sleep" }), "done");
    const back = readTripActions(JSON.stringify(s), null, null);
    expect(back).toEqual(s);
  });

  test("absent and corrupt storage is an empty ledger, not a crash", () => {
    for (const raw of [null, "", "not json", "42", "[1]", '{"completedIds":"x"}', '{"marks":[1]}']) {
      expect(readTripActions(raw, null, null)).toEqual(EMPTY);
    }
  });

  test("corrupt new-format storage does not revive stale legacy keys", () => {
    const back = readTripActions("corrupt", JSON.stringify(["old-done"]), null);
    expect(back).toEqual(EMPTY);
  });

  test("a persisted skip wins over a stale done in the same ledger", () => {
    const back = readTripActions(
      JSON.stringify({
        completedIds: ["a"],
        marks: { a: { id: "a", dayIndex: 1, status: "skipped", text: "s", at: 1 } },
        pendingIds: ["a"],
      }),
      null,
      null,
    );
    expect(back.completedIds).toEqual([]);
    expect(back.marks.a.status).toBe("skipped");
  });

  test("a persisted done mark completes even when the list is absent", () => {
    const back = readTripActions(
      JSON.stringify({
        marks: { a: { id: "a", dayIndex: 0, status: "done", text: "d", at: 1 } },
      }),
      null,
      null,
    );
    expect(back.completedIds).toEqual(["a"]);
  });

  test("duplicate ids and malformed mark fields are repaired or dropped", () => {
    const back = readTripActions(
      JSON.stringify({
        completedIds: ["a", "a"],
        marks: {
          bad_day: { id: "bad_day", dayIndex: -1, status: "done", at: 1 },
          bad_kind: { id: "bad_kind", dayIndex: 1, kind: "made_up", status: "done", at: 1 },
          bad_at: { id: "bad_at", dayIndex: 1, status: "done", at: "x" },
          ok: { id: "ok", dayIndex: 1, kind: "light_exposure", status: "done", at: 2 },
        },
        pendingIds: ["ok", "ok", "bad_day"],
      }),
      null,
      null,
    );
    expect(back.completedIds).toEqual(["a", "ok"]);
    expect(Object.keys(back.marks)).toEqual(["ok"]);
    expect(back.pendingIds).toEqual(["ok"]);
  });

  test("malformed entries inside a good envelope are dropped", () => {
    const back = readTripActions(
      JSON.stringify({
        completedIds: ["a", 4, null],
        marks: { a: { ...act({ id: "a" }), status: "done" }, b: "junk", c: { id: "c", status: "nope" } },
        pendingIds: ["a", 9],
      }),
      null,
      null,
    );
    expect(back.completedIds).toEqual(["a"]);
    expect(back.pendingIds).toEqual(["a"]);
    expect(Object.keys(back.marks)).toEqual(["a"]);
  });

  test("legacy completedNudges migrates when the new key is absent", () => {
    const back = readTripActions(null, JSON.stringify(["D-1-sunlight", "D-2-run"]), null);
    expect(back.completedIds).toEqual(["D-1-sunlight", "D-2-run"]);
    expect(back.pendingIds).toEqual([]);
  });

  test("legacy pending marks migrate, and a pending skip overrides a completed id", () => {
    const pending = JSON.stringify([
      ["D-1-sunlight", { dayIndex: 2, kind: "light_exposure", startMin: 420, status: "skipped", text: "skipped: light", at: 1 }],
      ["D-2-sleep", { dayIndex: 3, kind: "sleep_window", status: "done", text: "did: sleep", at: 2 }],
    ]);
    const back = readTripActions(null, JSON.stringify(["D-1-sunlight"]), pending);
    expect(back.completedIds).toEqual(["D-2-sleep"]);
    expect(back.marks["D-1-sunlight"].status).toBe("skipped");
    expect(new Set(back.pendingIds)).toEqual(new Set(["D-1-sunlight", "D-2-sleep"]));
  });
});

describe("the storage seam — preview is memory only", () => {
  const fakeStorage = () => {
    const calls: string[] = [];
    const map = new Map<string, string>();
    return {
      calls,
      getItem: (k: string) => (calls.push(`get:${k}`), map.get(k) ?? null),
      setItem: (k: string, v: string) => void (calls.push(`set:${k}`), map.set(k, v)),
      map,
    };
  };

  test("preview hydration performs zero storage accesses", () => {
    const s = fakeStorage();
    s.map.set("meridian:actions:LHR-HND-2026-05-07", "corrupt-but-should-not-be-read");
    const state = hydrateTripActionsFromStorage("LHR-HND-2026-05-07", true, s);
    expect(state).toEqual(EMPTY);
    expect(s.calls).toEqual([]);
  });

  test("preview writes perform zero storage accesses — nothing promotes", () => {
    const s = fakeStorage();
    const marked = toggleTripAction(EMPTY, act(), "skipped");
    persistTripActionsToStorage("LHR-HND-2026-05-07", true, marked, s);
    expect(s.calls).toEqual([]);
    expect(s.map.size).toBe(0);
  });

  test("live scope reads the new key plus the two legacy keys for migration", () => {
    const s = fakeStorage();
    s.map.set("meridian:completedNudges:LHR-HND-2026-05-07", JSON.stringify(["D-1-sunlight"]));
    const state = hydrateTripActionsFromStorage("LHR-HND-2026-05-07", false, s);
    expect(state.completedIds).toEqual(["D-1-sunlight"]);
    expect(new Set(s.calls)).toEqual(
      new Set([
        "get:meridian:actions:LHR-HND-2026-05-07",
        "get:meridian:completedNudges:LHR-HND-2026-05-07",
        "get:meridian:pendingCheckins:LHR-HND-2026-05-07",
      ]),
    );
  });

  test("live writes go only to the scoped actions key", () => {
    const s = fakeStorage();
    const marked = toggleTripAction(EMPTY, act(), "done");
    persistTripActionsToStorage("LHR-HND-2026-05-07", false, marked, s);
    expect(s.calls).toEqual(["set:meridian:actions:LHR-HND-2026-05-07"]);
    expect(
      readTripActions(s.map.get("meridian:actions:LHR-HND-2026-05-07")!, null, null),
    ).toEqual(marked);
  });

  test("live hydration reads the stored live ledger, never a rehearsal", () => {
    const s = fakeStorage();
    const stored = toggleTripAction(EMPTY, act({ id: "D-3-run" }), "skipped");
    s.map.set("meridian:actions:LHR-HND-2026-05-07", JSON.stringify(stored));
    const live = hydrateTripActionsFromStorage("LHR-HND-2026-05-07", false, s);
    expect(live.marks["D-3-run"].status).toBe("skipped");
  });
});

describe("the send queue — preview derives empty", () => {
  test("marks exist in memory but nothing is queueable on preview", () => {
    let s = toggleTripAction(EMPTY, act(), "skipped");
    s = toggleTripAction(s, act({ id: "D-2-sleep" }), "done");
    expect(derivePendingMarks(s, true).size).toBe(0);
    const live = derivePendingMarks(s, false);
    expect([...live.keys()].sort()).toEqual(["D-1-sunlight", "D-2-sleep"]);
  });

  test("after acknowledgment, submitted skips stay on the ledger", () => {
    let s = toggleTripAction(EMPTY, act(), "skipped");
    s = acknowledgeTripActions(s, ["D-1-sunlight"]);
    expect(derivePendingMarks(s, false).size).toBe(0);
    expect(s.marks["D-1-sunlight"].status).toBe("skipped");
  });
});
