import { describe, expect, test } from "bun:test";
import {
  ROOMS,
  blendKeys,
  locate,
  worldAt,
  type RoomCtx,
  type SkyKey,
} from "@/domain/feed-scenes";

const ctx = (over: Partial<RoomCtx> = {}): RoomCtx => ({
  w: 1440,
  h: 900,
  hor: [0.91, 0.6, 0.44],
  zen: [0.047, 0.07, 0.125],
  horH0: 0.26,
  starO: 0.55,
  owedFrac: 0.5,
  glow: 0.4,
  scouts: [0.52, 0.6, 0.49, 0.56, 0.46],
  days: [{ lit: 1 }, { lit: 0.5 }, { lit: 0 }],
  ...over,
});

const STARTS = [0, 1000, 2000, 3000, 4000, 5000];
const LENGTHS = [1000, 1000, 1000, 1000, 1000, 800];

describe("locate", () => {
  test("scrollY exactly at a start selects that room at p=0", () => {
    for (let i = 0; i < STARTS.length; i++) {
      const { i: room, p } = locate(STARTS[i], STARTS, LENGTHS);
      expect(room).toBe(i);
      expect(p).toBe(0);
    }
  });

  test("past the end clamps to the last room at p=1, t=0", () => {
    const { i, p, t } = locate(99999, STARTS, LENGTHS);
    expect(i).toBe(STARTS.length - 1);
    expect(p).toBe(1);
    expect(t).toBe(0);
  });

  test("i is monotonic in scrollY", () => {
    let prev = -1;
    for (let y = 0; y <= 6000; y += 137) {
      const { i } = locate(y, STARTS, LENGTHS);
      expect(i).toBeGreaterThanOrEqual(prev);
      prev = i;
    }
  });

  test("t only opens inside the last 35% of a room", () => {
    expect(locate(1500, STARTS, LENGTHS).t).toBe(0); // p=0.5
    const { t } = locate(1900, STARTS, LENGTHS); // p=0.9
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    expect(locate(1999, STARTS, LENGTHS).t).toBeCloseTo(1, 1);
  });
});

describe("blendKeys", () => {
  const a = ROOMS[0].key(ctx());
  const b = ROOMS[1].key(ctx());

  test("t=0 is exactly a, t=1 is exactly b", () => {
    expect(blendKeys(a, b, 0)).toEqual(a);
    expect(blendKeys(a, b, 1)).toEqual(b);
  });

  test("midpoint lerps every channel", () => {
    const m = blendKeys(a, b, 0.5);
    expect(m.horizonH).toBeCloseTo((a.horizonH + b.horizonH) / 2);
    expect(m.sun.y).toBeCloseTo((a.sun.y + b.sun.y) / 2);
    expect(m.top[0]).toBeCloseTo((a.top[0] + b.top[0]) / 2);
    expect(m.scouts[0]).toBeCloseTo((a.scouts[0] + b.scouts[0]) / 2);
  });

  test("zoom, sunLit and magnet lerp with the rest", () => {
    const day = ROOMS.find((r) => r.id === "day")!.key(ctx());
    const next = ROOMS.find((r) => r.id === "next")!.key(ctx());
    const m = blendKeys(day, next, 0.5);
    expect(m.zoom).toBeCloseTo((day.zoom + next.zoom) / 2);
    expect(m.sunLit).toBeCloseTo((day.sunLit + next.sunLit) / 2);
    expect(m.magnet).toBeCloseTo((day.magnet + next.magnet) / 2);
    expect(blendKeys(day, next, 0).zoom).toBe(day.zoom);
    expect(blendKeys(day, next, 1).zoom).toBe(next.zoom);
    expect(blendKeys(day, next, 0).magnet).toBe(day.magnet);
    expect(blendKeys(day, next, 1).magnet).toBe(next.magnet);
  });

  test("markers lerp pairwise, missing lights from 0", () => {
    const c = ctx();
    const plan = ROOMS.find((r) => r.id === "plan")!.key(c);
    const discover = ROOMS.find((r) => r.id === "discover")!.key(c);
    const m = blendKeys(plan, discover, 0.5);
    expect(m.arc!.markers!.length).toBe(plan.arc!.markers!.length);
    // discover lights every day: lit climbs toward 1 mid-blend
    expect(m.arc!.markers![2].lit).toBeCloseTo((0 + 1) / 2);
    expect(blendKeys(plan, discover, 1).arc!.markers).toEqual(discover.arc!.markers);
  });

  test("a null arc borrows the other room's arc instead of snapping", () => {
    const noArc: SkyKey = { ...a, arc: null };
    const m = blendKeys(noArc, b, 0.5);
    expect(m.arc).not.toBeNull();
    expect(m.arc!.ax).toBeCloseTo(b.arc!.ax);
    const m2 = blendKeys(b, noArc, 0.5);
    expect(m2.arc).not.toBeNull();
  });

  test("missing scouts lerp against -1", () => {
    const short: SkyKey = { ...a, scouts: [0.2] };
    const long: SkyKey = { ...b, scouts: [0.2, 0.4, 0.6] };
    const m = blendKeys(short, long, 0.5);
    expect(m.scouts.length).toBe(3);
    expect(m.scouts[1]).toBeCloseTo((-1 + 0.4) / 2);
  });
});

describe("room keyframes", () => {
  for (const size of [{ w: 1440, h: 900 }, { w: 1024, h: 768 }]) {
    test(`sun stays in the open side at ${size.w}x${size.h}`, () => {
      for (const room of ROOMS) {
        const k = room.key(ctx(size));
        if (room.side === "right") {
          expect(k.sun.x, room.id).toBeLessThanOrEqual(0.38);
        } else if (room.side === "left") {
          expect(k.sun.x, room.id).toBeGreaterThanOrEqual(0.62);
        }
      }
    });
  }

  test("stage/now cover is the owed fraction, honestly", () => {
    for (const owedFrac of [0, 0.5, 1]) {
      const c = ctx({ owedFrac });
      const want = Math.min(1, Math.max(0, owedFrac * 1.3 + 0.12));
      for (const id of ["stage", "now"] as const) {
        const k = ROOMS.find((r) => r.id === id)!.key(c);
        expect(k.cover).toBeCloseTo(want);
      }
    }
  });

  test("the push-in lives only in the next room", () => {
    const c = ctx();
    for (const room of ROOMS) {
      const k = room.key(c);
      if (room.id === "next") expect(k.zoom).toBeGreaterThan(1);
      else expect(k.zoom, room.id).toBe(1);
    }
  });

  test("each room keys its own pointer magnetism; the stage holds 0", () => {
    const c = ctx();
    const want: Record<string, number> = {
      stage: 0,
      now: 0.7,
      day: 0.8,
      next: 1,
      plan: 0.6,
      discover: 0.9,
    };
    for (const room of ROOMS) {
      expect(room.key(c).magnet, room.id).toBe(want[room.id]);
      // Rooms never hold the flyover — it is a renderer burst, so the
      // keyframe carries no streak frame.
      expect(room.key(c).streak, room.id).toBeUndefined();
    }
  });

  test("the day room's focal tuning: larger disc, lower strip, warmer beam", () => {
    const c = ctx();
    const day = ROOMS.find((r) => r.id === "day")!.key(c);
    const stage = ROOMS.find((r) => r.id === "stage")!.key(c);
    // The disc reads at 90% of the stage disc's radius (was 70%).
    expect(day.sun.r).toBeCloseTo(stage.sun.r * 0.9);
    // The route flattens into the day strip at 0.24.
    expect(day.arc!.ay).toBe(0.24);
    expect(day.arc!.by).toBe(0.24);
    // The beam warms ×1.08, clamped — the ground horizon reads brighter.
    const want = c.hor.map((v) => Math.min(1, Math.max(0, v * 1.08)));
    expect(day.hor).toEqual(want);
    // And it never touches the shared context colour.
    expect(day.hor).not.toBe(c.hor);
  });

  test("plan markers count caps at 8 and t stays strictly increasing in (0,1)", () => {
    const many = ctx({ days: Array.from({ length: 12 }, () => ({ lit: 1 })) });
    const plan = ROOMS.find((r) => r.id === "plan")!.key(many);
    expect(plan.arc!.markers!.length).toBe(8);
    let prev = 0;
    for (const m of plan.arc!.markers!) {
      expect(m.t).toBeGreaterThan(prev);
      expect(m.t).toBeLessThan(1);
      prev = m.t;
    }
    const few = ROOMS.find((r) => r.id === "plan")!.key(ctx());
    expect(few.arc!.markers!.length).toBe(3);
    expect(few.arc!.markers!.map((m) => m.lit)).toEqual([1, 0.5, 0]);
  });

  test("no key value is NaN for any owed fraction", () => {
    for (const owedFrac of [0, 0.5, 1]) {
      const c = ctx({ owedFrac });
      for (const room of ROOMS) {
        const k = room.key(c);
        const flat: number[] = [
          ...k.top, ...k.mid, ...k.hor,
          k.horizonH, k.stars, k.cover, k.zoom, k.sunLit, k.magnet,
          k.sun.x, k.sun.y, k.sun.r, ...k.sun.color,
          ...(k.arc
            ? [
                k.arc.ax, k.arc.ay, k.arc.bx, k.arc.by, k.arc.t,
                ...(k.arc.markers ?? []).flatMap((m) => [m.t, m.lit]),
              ]
            : []),
          ...k.scouts,
        ];
        for (const v of flat) {
          expect(Number.isFinite(v), `${room.id} ${v}`).toBe(true);
        }
      }
    }
  });
});

describe("worldAt", () => {
  test("rest inside a room, reveal at its tail", () => {
    const c = ctx();
    const rest = worldAt(1500, STARTS, LENGTHS, c);
    expect(rest).toEqual(ROOMS[1].key(c));
    const tail = worldAt(1999, STARTS, LENGTHS, c);
    expect(tail.horizonH).not.toBeCloseTo(ROOMS[1].key(c).horizonH);
  });
});
