/* Altitudes — the feed as rooms in one world (docs/plan/feed-altitudes.md).
 *  Pure scene config: each room owns a side, a slab width and a modeled sky
 *  keyframe derived entirely from real state (the honesty clause — nothing
 *  decorative). locate() turns scrollY into per-room progress; blendKeys()
 *  is the reveal between two rooms, painted to the single canvas. No DOM
 *  here — measurements arrive as numbers. */

export type RoomId = "stage" | "now" | "day" | "next" | "plan" | "discover";
export type Rgb = [number, number, number];

export interface SkyKey {
  top: Rgb;
  mid: Rgb;
  hor: Rgb;
  horizonH: number;
  stars: number;
  cover: number;
  /** Camera push-in about the sun's position (1 = none). */
  zoom: number;
  /** 0..1 — lights the glass disc; the rooms have no DOM SunSelf over it. */
  sunLit: number;
  /** 0..1 — pointer magnetism: how far the hand may pull the sun and arc.
   *  0 = the model holds; 1 = the sun leans hardest toward the pointer. */
  magnet: number;
  /** Held flyover frame (0..1 of the scout's run toward the sun). Rooms
   *  never set it — the flyover is a renderer burst keyed to the located
   *  room changing, so unset = off. Reserved for the keyframe shape. */
  streak?: number;
  sun: { x: number; y: number; r: number; color: Rgb };
  arc: {
    ax: number;
    ay: number;
    bx: number;
    by: number;
    t: number;
    /** Day markers along the route, lit by how locked that day is. */
    markers?: { t: number; lit: number }[];
  } | null;
  scouts: number[];
}

export interface RoomCtx {
  /** Viewport the sky is painted into. */
  w: number;
  h: number;
  /** Horizon beam colour (stage --stage-horizon). */
  hor: Rgb;
  /** Zenith / mid-band ink (stage --stage-ink-2). */
  zen: Rgb;
  /** The stage's horizon band height (0..1 from bottom). */
  horH0: number;
  /** Star-field opacity (stage --stage-star-o). */
  starO: number;
  /** Owed sleep normalised: owedMin / requiredShiftMin, clamped 0..1. */
  owedFrac: number;
  /** Coverage marker t on the route arc (0..1). */
  glow: number;
  /** The crew ahead — arc fractions for scout markers. */
  scouts: number[];
  /** Per trip day: 1 locked, 0.5 preview, 0 none — the route's day markers. */
  days?: { lit: number }[];
  /** Body-clock sun altitude (deg) at the next step, when known. */
  nextStepAlt?: number;
  /** Body-clock minutes — the altimeter chip's read. */
  nowMin?: number;
}

export interface Room {
  id: RoomId;
  side: "left" | "right" | "center";
  slab: "slim" | "wide" | "full";
  key: (c: RoomCtx) => SkyKey;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** The sun's stage disc: a bounded share of the frame (18px inset, ~15vw
 *  clamped), exactly what the round-53 feed painted at scroll 0. */
function sunDisc(c: RoomCtx) {
  const s = Math.min(220, Math.max(140, c.w * 0.15));
  return {
    x: (18 + s / 2) / c.w,
    y: c.horH0 + 8 / c.h,
    r: s / 2 / c.h,
  };
}

/** The route's day markers — one per trip day, centred in equal slots. */
function dayMarkers(c: RoomCtx, lit: (lit: number) => number) {
  const days = c.days?.slice(0, 8) ?? [];
  const n = days.length;
  return days.map((d, i) => ({ t: (i + 0.5) / Math.max(1, n), lit: lit(d.lit) }));
}

/** The stage's moment — feedSky at scroll 0, kept as the base every other
 *  room perturbs so the world stays continuous with the pinned stage. */
function base(c: RoomCtx): SkyKey {
  const sun = sunDisc(c);
  return {
    top: [c.zen[0] * 0.5, c.zen[1] * 0.5, c.zen[2] * 0.65],
    mid: c.zen,
    hor: c.hor,
    horizonH: c.horH0,
    stars: c.starO,
    cover: clamp01(c.owedFrac * 1.3 + 0.12),
    zoom: 1,
    sunLit: 0,
    magnet: 0,
    sun: { ...sun, color: c.hor },
    arc: { ax: 0.04, ay: c.horH0 * 0.45, bx: 0.96, by: c.horH0 * 0.45, t: c.glow },
    scouts: c.scouts,
  };
}

export const ROOMS: Room[] = [
  {
    id: "stage",
    side: "center",
    slab: "full",
    key: base,
  },
  {
    id: "now",
    side: "right",
    slab: "slim",
    key: (c) => {
      const k = base(c);
      // The same moment, one camera step down — the tilt into the feed.
      // The room's disc carries no DOM SunSelf, so the glass lights itself.
      k.horizonH = c.horH0 + 0.06;
      k.sunLit = 1;
      k.magnet = 0.7;
      k.sun = { ...k.sun, y: k.sun.y + 0.03 };
      return k;
    },
  },
  {
    id: "day",
    side: "left",
    slab: "wide",
    key: (c) => {
      const k = base(c);
      // The day as ground: horizon climbs to the top third, the route
      // flattens into the day strip the scouts ride.
      k.horizonH = 0.62;
      k.cover = clamp01(c.owedFrac * 0.9);
      k.stars = c.starO * 0.4;
      k.sunLit = 1;
      k.magnet = 0.8;
      k.sun = { ...k.sun, x: 0.78, y: 0.7, r: k.sun.r * 0.9 };
      k.arc = { ax: 0.08, ay: 0.24, bx: 0.92, by: 0.24, t: c.glow };
      k.hor = k.hor.map((v) => clamp01(v * 1.08)) as Rgb;
      return k;
    },
  },
  {
    id: "next",
    side: "right",
    slab: "wide",
    key: (c) => {
      const k = base(c);
      // The sun pushed toward — the frustum-match beat: the camera pushes
      // in about the disc as the room reveals. When the next step's
      // body-clock altitude is known, the sun rides it.
      const y =
        c.nextStepAlt !== undefined
          ? 0.22 + clamp01(c.nextStepAlt / 90) * 0.4
          : 0.34;
      k.horizonH = 0.22;
      k.cover = clamp01(c.owedFrac * 0.6);
      k.stars = c.starO * 0.5;
      k.zoom = 1.35;
      k.sunLit = 1;
      k.magnet = 1;
      k.sun = { ...k.sun, x: 0.26, y, r: Math.min(0.3, k.sun.r * 2.6) };
      k.arc = null;
      return k;
    },
  },
  {
    id: "plan",
    side: "center",
    slab: "full",
    key: (c) => {
      const k = base(c);
      // Descent to ground level: the table reads full width, a setting
      // disc the ridge buries two-thirds of, the days lit along the arc.
      k.horizonH = 0.16;
      k.stars = Math.max(c.starO, 0.5);
      k.cover = clamp01(c.owedFrac * 0.8);
      k.sunLit = 1;
      k.magnet = 0.6;
      k.sun = { ...k.sun, x: 0.5, y: k.horizonH - 0.16, r: k.sun.r * 1.8 };
      k.arc = {
        ax: 0.06,
        ay: 0.14,
        bx: 0.94,
        by: 0.14,
        t: c.glow,
        markers: dayMarkers(c, (lit) => lit),
      };
      return k;
    },
  },
  {
    id: "discover",
    side: "left",
    slab: "slim",
    key: (c) => {
      const k = base(c);
      // Landed at the destination: ridge high, ember-warm horizon, the
      // crew and every day marker settled at the route's end.
      k.horizonH = 0.34;
      k.stars = Math.max(c.starO, 0.7);
      k.cover = clamp01(c.owedFrac * 0.5);
      k.hor = lerpRgb(c.hor, [0.45, 0.28, 0.3], 0.5);
      k.sunLit = 1;
      k.magnet = 0.9;
      k.sun = { ...k.sun, x: 0.72, y: 0.36, r: k.sun.r * 0.9 };
      k.arc = {
        ax: 0.5,
        ay: 0.3,
        bx: 0.96,
        by: 0.3,
        t: 1,
        markers: dayMarkers(c, () => 1),
      };
      k.scouts = c.scouts.length ? c.scouts.map(() => 0.97) : [0.97];
      return k;
    },
  },
];

/** scrollY + measured room geometry → which room, its 0..1 progress, and
 *  the transition blend t (the last 35% of each room is its reveal window;
 *  the last room never blends). */
export function locate(
  scrollY: number,
  starts: number[],
  lengths: number[],
): { i: number; p: number; t: number } {
  const last = Math.max(0, starts.length - 1);
  let i = 0;
  for (let k = 0; k <= last; k++) {
    if (starts[k] <= scrollY) i = k;
    else break;
  }
  const len = lengths[i] ?? 0;
  const p = len > 0 ? clamp01((scrollY - starts[i]) / len) : scrollY >= starts[i] ? 1 : 0;
  const t = i === last ? 0 : smoothstep(0.65, 1, p);
  return { i, p, t };
}

/** The reveal between two rooms — every channel lerps; a null arc borrows
 *  the other room's arc (geometry and coverage) so it fades rather than
 *  snapping in. Markers lerp pairwise; a missing marker is the other's
 *  position with lit 0 — days light up, never teleport. */
export function blendKeys(a: SkyKey, b: SkyKey, t: number): SkyKey {
  const l = (x: number, y: number) => lerp(x, y, t);
  const aa = a.arc ?? b.arc;
  const bb = b.arc ?? a.arc;
  const markers = (() => {
    const am = aa?.markers ?? [];
    const bm = bb?.markers ?? [];
    const n = Math.max(am.length, bm.length);
    if (!n) return undefined;
    const out: { t: number; lit: number }[] = [];
    for (let i = 0; i < n; i++) {
      const ma = am[i] ?? (bm[i] ? { t: bm[i].t, lit: 0 } : undefined);
      const mb = bm[i] ?? (am[i] ? { t: am[i].t, lit: 0 } : undefined);
      if (ma && mb) out.push({ t: l(ma.t, mb.t), lit: l(ma.lit, mb.lit) });
    }
    return out;
  })();
  const n = Math.max(a.scouts.length, b.scouts.length);
  const scouts: number[] = [];
  for (let i = 0; i < n; i++) scouts.push(l(a.scouts[i] ?? -1, b.scouts[i] ?? -1));
  return {
    top: lerpRgb(a.top, b.top, t),
    mid: lerpRgb(a.mid, b.mid, t),
    hor: lerpRgb(a.hor, b.hor, t),
    horizonH: l(a.horizonH, b.horizonH),
    stars: l(a.stars, b.stars),
    cover: l(a.cover, b.cover),
    zoom: l(a.zoom, b.zoom),
    sunLit: l(a.sunLit, b.sunLit),
    magnet: l(a.magnet, b.magnet),
    streak:
      a.streak !== undefined || b.streak !== undefined
        ? l(a.streak ?? 0, b.streak ?? 0)
        : undefined,
    sun: {
      x: l(a.sun.x, b.sun.x),
      y: l(a.sun.y, b.sun.y),
      r: l(a.sun.r, b.sun.r),
      color: lerpRgb(a.sun.color, b.sun.color, t),
    },
    arc:
      aa && bb
        ? {
            ax: l(aa.ax, bb.ax),
            ay: l(aa.ay, bb.ay),
            bx: l(aa.bx, bb.bx),
            by: l(aa.by, bb.by),
            t: l(aa.t, bb.t),
            markers,
          }
        : null,
    scouts,
  };
}

/** The world at this scroll position — room i's keyframe revealing room
 *  i+1's inside its transition window, at rest everywhere else. */
export function worldAt(
  scrollY: number,
  starts: number[],
  lengths: number[],
  ctx: RoomCtx,
): SkyKey {
  const { i, t } = locate(scrollY, starts, lengths);
  const last = ROOMS.length - 1;
  const a = ROOMS[Math.min(i, last)].key(ctx);
  const b = ROOMS[Math.min(i + 1, last)].key(ctx);
  return blendKeys(a, b, t);
}
