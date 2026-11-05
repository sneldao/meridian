import { seedFromText, starPlane } from "@/domain/demo-depth";

/* The stage's star plane — the same deterministic two-plane field the demo
 *  hangs (demo-depth), opacity riding the modeled `--stage-star-o` that
 *  stageSkyVars writes from the body sun's altitude (starFade: full below
 *  −10°, gone by +6°). Static SVG: a read, not a loop — the stars are the
 *  sky's darkness made visible, so they never twinkle and never cover words.
 *
 *  Seeded per destination so a trip keeps one sky from hero to stage to
 *  arrival, and so server and client renders hang the same stars. */
export function StageStars({ seed }: { seed: string }) {
  const s = seedFromText(seed);
  const far = starPlane(s, 26, 52);
  const mid = starPlane(s ^ 0x9e3779b9, 14, 68);
  return (
    <div className="stage-stars" aria-hidden="true">
      <svg
        className="stage-stars-svg stage-stars-far"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {far.map((st, i) => (
          <circle key={i} cx={st.x} cy={st.y} r={st.r} opacity={st.o} />
        ))}
      </svg>
      <svg
        className="stage-stars-svg stage-stars-mid"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {mid.map((st, i) => (
          <circle key={i} cx={st.x} cy={st.y} r={st.r} opacity={st.o} />
        ))}
      </svg>
    </div>
  );
}
