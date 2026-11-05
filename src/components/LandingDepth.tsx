"use client";

import { useEffect, useRef } from "react";
import { ridgePath, starPlane } from "@/domain/demo-depth";

/* The landing's ambient depth on the ink statement (Phase 1): two seeded
 * mote planes at different parallax rates, a warm sun-dest haze on the
 * horizon, ONE dark ridge holding it down, and a fine grain over the
 * whole field (src/domain/demo-depth.ts generates the geometry; carried
 * by an SVG turbulence filter instead of a shader).
 *
 * `--lp` is the page's descent, written imperatively per scroll frame (the
 * stage's scrub law — a transition would lag it): planes recede and
 * compress at different rates so the backdrop evolves continuously as the
 * visitor scrolls, never swapping per section. It is written on the root
 * element rather than this node so the day frame's own sky depth can lean
 * on the same scroll progress — the handoff's parallax shares one clock
 * and never shears. Deterministic seeds keep SSR, hydration and every
 * load on the same sky; the whole field is aria-hidden chrome — the
 * written sections carry the read. Reduced motion never writes the
 * variable: the layered sky simply sits. */

const MOTES_FAR = starPlane(11, 20, 62);
const MOTES_MID = starPlane(37, 14, 76);
const RIDGE_FAR = ridgePath(61, 9, 0.8);

/* The artwork only mounts on ink (design reset Phase 0/1): on the cream
 * landing the ridge art read as pastel clip-art under the type, so paper
 * renders nothing at all. On ink it is two seeded star planes, one dark
 * ridge, a warm haze on the horizon and grain — scroll parallax only, no
 * ambient loops. The hook rules are kept by a wrapper that returns null
 * before the inner component — hooks live inside, never conditional. */
export function LandingDepth({ tone = "paper" }: { tone?: "paper" | "ink" }) {
  if (tone !== "ink") return null;
  return <LandingDepthArtwork />;
}

function LandingDepthArtwork() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const write = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      doc.style.setProperty(
        "--lp",
        Math.min(1, Math.max(0, window.scrollY / max)).toFixed(4),
      );
    };
    write();
    window.addEventListener("scroll", write, { passive: true });
    window.addEventListener("resize", write);
    // The visitor's hand tilts the field the same way it tilts the stage's:
    // --px/--py drift the mote and ridge planes at their own depths — same
    // input vocabulary as the stage's depth-parallax, one --lp clock shared.
    const fine = window.matchMedia("(pointer: fine)");
    let raf = 0;
    const tilt = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const doc = document.documentElement;
        doc.style.setProperty("--px", ((e.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        doc.style.setProperty("--py", ((e.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      });
    };
    const rest = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        document.documentElement.style.setProperty("--px", "0");
        document.documentElement.style.setProperty("--py", "0");
      });
    };
    if (fine.matches) {
      window.addEventListener("pointermove", tilt, { passive: true });
      document.addEventListener("pointerleave", rest);
    }
    return () => {
      window.removeEventListener("scroll", write);
      window.removeEventListener("resize", write);
      cancelAnimationFrame(raf);
      if (fine.matches) {
        window.removeEventListener("pointermove", tilt);
        document.removeEventListener("pointerleave", rest);
      }
      document.documentElement.style.removeProperty("--lp");
      document.documentElement.style.removeProperty("--px");
      document.documentElement.style.removeProperty("--py");
    };
  }, []);

  return (
    <div className="landing-depth" ref={ref} aria-hidden="true">
      <div className="ld-sky" />
      <svg
        className="ld-motes ld-motes-far"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {MOTES_FAR.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
        ))}
      </svg>
      <svg
        className="ld-motes ld-motes-mid"
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
      >
        {MOTES_MID.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
        ))}
      </svg>
      <div className="ld-haze" />
      <svg className="ld-ridge ld-ridge-far" viewBox="0 0 100 40" preserveAspectRatio="none">
        <path d={RIDGE_FAR} />
      </svg>
      {/* Paper grain: monochrome turbulence at a whisper of alpha, so the
          field reads as textured paper, not a flat fill. */}
      <svg className="ld-grain">
        <filter id="ld-noise" x="0" y="0" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0"
          />
        </filter>
        <rect width="100%" height="100%" filter="url(#ld-noise)" />
      </svg>
    </div>
  );
}
