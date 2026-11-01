/* The demo stage's depth layers (the /demo night-stage backdrop).
 *
 * The stage sky is one modeled gradient; depth comes from a few authored
 * layers in front of it — star planes that drift at different rates and two
 * terrain silhouettes at the stage floor. The geometry is generated, not
 * hand-placed, but it must be the SAME sky on server and client and on
 * every load: a small deterministic generator (a seeded LCG, the same
 * family the sky model uses elsewhere) keeps it so. Output is plain
 * numbers — the component decides how to paint them. */

export interface DepthStar {
  /** 0..100 across the layer's viewBox. */
  x: number;
  /** 0..100 down the layer's viewBox. */
  y: number;
  /** Radius in viewBox units. */
  r: number;
  /** Base opacity 0..1 — dim stars sit back, bright ones forward. */
  o: number;
}

/** Small deterministic PRNG (numerical-recipes LCG) — no Math.random so
 *  SSR and hydration agree, and the night sky doesn't rearrange itself
 *  between visits. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One depth plane of stars. `yMax` keeps each plane's stars above the
 *  terrain line it hangs over; nearer planes get slightly larger, brighter
 *  stars and reach lower. */
export function starPlane(seed: number, count: number, yMax = 80): DepthStar[] {
  const rnd = lcg(seed);
  const stars: DepthStar[] = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.round(rnd() * 1000) / 10,
      y: Math.round(rnd() * yMax * 10) / 10,
      r: Math.round((0.06 + rnd() * 0.14) * 100) / 100,
      o: Math.round((0.3 + rnd() * 0.6) * 100) / 100,
    });
  }
  return stars;
}

/** A terrain silhouette: a closed path filling the bottom of a 100×40
 *  viewBox, its top edge a jagged ridgeline (the stage's jagged-edge grammar
 *  at terrain scale). `rough` 0..1 sets how far the line climbs — nearer
 *  ridges are smoother and sit lower. */
export function ridgePath(seed: number, peaks: number, rough = 0.5): string {
  const rnd = lcg(seed);
  const pts: string[] = [];
  const n = Math.max(3, peaks);
  for (let i = 0; i <= n; i++) {
    const x = Math.round((i / n) * 1000) / 10;
    // Valley floor ~30, peaks climb toward ~8 in the 40-tall box.
    const y = Math.round((30 - rnd() * 22 * rough - 2 * rough) * 10) / 10;
    pts.push(`L ${x} ${y}`);
  }
  return `M 0 40 ${pts.join(" ")} L 100 40 Z`;
}
