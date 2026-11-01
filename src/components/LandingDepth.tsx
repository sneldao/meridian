"use client";

import { useEffect, useRef } from "react";
import { ridgePath, starPlane } from "@/domain/demo-depth";

/* The landing's ambient depth — the demo stage's depth system carried onto
 * the cream surface (src/domain/demo-depth.ts generates the geometry; the
 * layers here are its planes re-dressed for daylight). One warm sky band
 * hangs at the top of the page: two mote planes at different rates, a haze
 * on the horizon, two ridges holding it down, and a fine grain over the
 * whole field — the paper-shaders lesson, carried by an SVG turbulence
 * filter instead of a shader.
 *
 * `--lp` is the page's descent, written imperatively per scroll frame (the
 * stage's scrub law — a transition would lag it): planes recede and
 * compress at different rates so the backdrop evolves continuously as the
 * visitor scrolls, never swapping per section. Deterministic seeds keep
 * SSR, hydration and every load on the same sky; the whole field is
 * aria-hidden chrome — the written sections carry the read. Reduced motion
 * never writes the variable: the layered sky simply sits. */

const MOTES_FAR = starPlane(11, 20, 62);
const MOTES_MID = starPlane(37, 14, 76);
const RIDGE_FAR = ridgePath(61, 9, 0.8);
const RIDGE_NEAR = ridgePath(23, 5, 0.4);

export function LandingDepth() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const write = () => {
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      el.style.setProperty(
        "--lp",
        Math.min(1, Math.max(0, window.scrollY / max)).toFixed(4),
      );
    };
    write();
    window.addEventListener("scroll", write, { passive: true });
    window.addEventListener("resize", write);
    return () => {
      window.removeEventListener("scroll", write);
      window.removeEventListener("resize", write);
      el.style.removeProperty("--lp");
    };
  }, []);

  return (
    <div className="landing-depth" ref={ref} aria-hidden="true">
      <div className="ld-sky" />
      <div className="ld-glow" />
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
      <svg className="ld-ridge ld-ridge-near" viewBox="0 0 100 40" preserveAspectRatio="none">
        <path d={RIDGE_NEAR} />
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
