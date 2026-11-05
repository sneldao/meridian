import { ridgePath, seedFromText } from "@/domain/demo-depth";

/* The stage's terrain — the demo's own ridgePath silhouettes, seeded per
 *  destination so a trip's ground is as deterministic as its stars. The far
 *  ridge tops out just under the horizon line, so the sun reads as rising
 *  behind land rather than floating on a gradient; the near ridge is a
 *  darker mass holding the stage's bottom edge. Static SVG, aria-hidden —
 *  the ground is set, not actor. */
export function StageRidges({ seed }: { seed: string }) {
  const s = seedFromText(seed);
  const far = ridgePath(s, 9, 0.8);
  const near = ridgePath(s ^ 0x9e3779b9, 5, 0.4);
  return (
    <div className="stage-ridges" aria-hidden="true">
      <svg
        className="stage-ridge stage-ridge-far"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
      >
        <path d={far} />
      </svg>
      <svg
        className="stage-ridge stage-ridge-near"
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
      >
        <path d={near} />
      </svg>
    </div>
  );
}
