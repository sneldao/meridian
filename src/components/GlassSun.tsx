"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SUN_CUE } from "@/domain/motion-cues";
import { sunSelfMoodWord, type SunSelfRead } from "@/domain/sun-self";
import { glassSunSvgGroup } from "@/lib/glass-sun-svg";
import type { GlassRenderer } from "@/lib/glass-sun-webgl";

/* The glass sun (design reset Phase 2): the SunSelf read rendered as a
 * refractive lenticular solar medallion — thin prismatic rim, attenuated
 * core, warped horizon, caustic ticks. The SVG is always the SSR +
 * fallback body; the WebGL1 lens is an enhancement for large glyphs, and
 * its environment is procedural — it never samples the DOM.
 *
 * Lifecycle contract: one renderer in a ref, created only while visible
 * AND size>=96 AND motion is allowed AND !saveData; `update(read)` feeds
 * every new read; context loss and reduced-motion return the SVG fallback,
 * while off-screen rendering pauses. `data-renderer` says which body draws;
 * `data-tone`/`data-mood` on the wrapper carry the palette the GPU
 * re-reads per draw. The wrapper holds the accessible label so AT gets
 * the read under either backend (both bodies are aria-hidden). */

export interface SunSelfProps {
  read: SunSelfRead;
  size?: number;
  /** paper = cream surfaces; ink = the stage's night sky. */
  tone?: "paper" | "ink";
  /** Change the key to replay the one-shot glow pulse / glint pass. */
  pulseKey?: string | number | null;
  className?: string;
  /** One per page — the shared element that carries the sun between routes. */
  vt?: boolean;
  /** The lens highlights the area under the pointer, inside this surface. */
  follow?: boolean;
  /** A tap plays the ripple and lifts the read's one-liner for a beat. */
  speak?: boolean;
  /** Play the small arrival — used where the sun should notice you came back. */
  wake?: boolean;
}

const GLASS_PAL = {
  rim: "var(--glass-edge)",
  rimHi: "var(--glass-spec)",
  core: "var(--glass-tint)",
  coreSoft: "var(--glass-tint)",
  halo: "var(--glass-tint)",
  rayLit: "var(--m-accent)",
  rayDim: "var(--m-faint)",
  horizon: "var(--glass-tint)",
};

export function GlassSun({
  read,
  size = 96,
  tone = "paper",
  pulseKey = null,
  className = "",
  vt = false,
  follow = false,
  speak = false,
  wake = false,
}: SunSelfProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<GlassRenderer | null>(null);
  const latestRead = useRef(read);
  const followPt = useRef<{ x: number; y: number } | null>(null);
  const lineTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gen = useRef(0); // generation counter: stale async imports die here
  const pendingGl = useRef(false); // at most one in-flight context creation
  const [rendererKind, setRendererKind] = useState<"svg" | "webgl">("svg");
  const [showLine, setShowLine] = useState(false);
  const [ripple, setRipple] = useState(0);
  const uid = useId();
  const label = `Your meridian — ${sunSelfMoodWord(read.mood)} — ${read.line}`;
  useEffect(() => { latestRead.current = read; }, [read]);

  // The shared glass body — one geometry, centred into the 120-box.
  const body = `<g transform="translate(60 60)">${glassSunSvgGroup(read, {
    r: 42,
    palette: GLASS_PAL,
    prefix: `gs${uid}`,
  })}</g>`;

  /* ── GPU lens lifecycle ─────────────────────────────────────────────── */
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (size < 96 || !wrap || !canvas || typeof IntersectionObserver === "undefined") return;
    const mm = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!mm || saveData) return;

    const my = ++gen.current;
    let cancelled = false;
    let visible = false;
    const allowed = () => !mm.matches && !saveData;

    const destroy = () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      setRendererKind("svg");
    };

    const maybeCreate = () => {
      if (cancelled || gen.current !== my || !allowed() || !visible || document.hidden) return;
      if (rendererRef.current || pendingGl.current) return; // one context only
      pendingGl.current = true;
      import("@/lib/glass-sun-webgl")
        .then((m) => {
          pendingGl.current = false;
          if (cancelled || gen.current !== my || !allowed() || !visible || document.hidden || !canvasRef.current) return;
          if (rendererRef.current) return; // another resolution beat us
          const r = m.glassSunRenderer(canvasRef.current, latestRead.current, wrap, {
            onContextLost: () => {
              // The context is gone for good — dispose and stay on the
              // SVG body rather than resurrect a dead renderer.
              rendererRef.current?.dispose();
              rendererRef.current = null;
              setRendererKind("svg");
            },
            onFirstDraw: () => setRendererKind("webgl"),
          });
          if (!r) return;
          rendererRef.current = r;
          r.update(latestRead.current);
          if (wake) r.pulse();
          if (followPt.current) r.pointer(followPt.current);
        })
        .catch(() => { pendingGl.current = false; });
    };

    const io = new IntersectionObserver(
      ([e]) => {
        visible = Boolean(e?.isIntersecting);
        rendererRef.current?.setVisible(visible && !document.hidden);
        if (visible) maybeCreate();
      },
      { threshold: 0.05 },
    );
    io.observe(wrap);

    const onMm = () => {
      if (allowed()) maybeCreate();
      else destroy();
    };
    mm.addEventListener("change", onMm);
    const onVis = () => {
      rendererRef.current?.setVisible(visible && !document.hidden);
      if (!document.hidden) maybeCreate();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      io.disconnect();
      mm.removeEventListener("change", onMm);
      document.removeEventListener("visibilitychange", onVis);
      destroy();
    };
  }, [size, wake]);

  /* Feed every new read (and pointer) into the live renderer. */
  useEffect(() => {
    rendererRef.current?.update(read);
  }, [read]);

  /* pulseKey / wake replay: when the caller changes the key the lens
     plays its one-shot glint (respecting reduced motion — the pulse is
     motion by definition). */
  const mmNow = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (pulseKey === null || mmNow()) return;
    rendererRef.current?.pulse();
  }, [pulseKey]);
  useEffect(() => {
    if (!wake || mmNow()) return;
    rendererRef.current?.pulse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Pointer follow — GPU local highlight, only inside this surface,
     never under reduced motion (the static body has no claimed follow). */
  useEffect(() => {
    if (!follow || mmNow()) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onMove = (e: PointerEvent) => {
      if (mmNow()) return;
      const r = wrap.getBoundingClientRect();
      followPt.current = {
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top) / r.height,
      };
      rendererRef.current?.pointer(followPt.current);
    };
    const onLeave = () => {
      followPt.current = null;
      rendererRef.current?.pointer(null);
    };
    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    return () => {
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, [follow]);

  const rippleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Tap: finite one-shot ring (keyed element re-fires CSS) + GPU pulse.
     The ring element is removed when its 260ms animation ends — a finite
     effect must leave the settled surface pixel-identical. */
  const fire = () => {
    setRipple((n) => n + 1);
    if (rippleTimer.current) clearTimeout(rippleTimer.current);
    rippleTimer.current = setTimeout(() => setRipple(0), 280);
    if (!mmNow()) rendererRef.current?.pulse();
  };

  const speakTap = () => {
    fire();
    setShowLine(true);
    if (lineTimer.current) clearTimeout(lineTimer.current);
    lineTimer.current = setTimeout(() => setShowLine(false), 2600);
  };
  useEffect(() => () => {
    if (lineTimer.current) clearTimeout(lineTimer.current);
    if (rippleTimer.current) clearTimeout(rippleTimer.current);
  }, []);

  const cls = `sunself-wrap${speak ? " speaks" : ""}${vt ? " sunself-vt" : ""}${follow ? " follows" : ""}${className ? ` ${className}` : ""}`;
  const inner = (
    <>
      <canvas ref={canvasRef} className="sunself-gl" aria-hidden="true" />
      <svg
        key={`${pulseKey ?? "x"}-${ripple}`}
        viewBox="0 0 120 120"
        width={size}
        height={size}
        aria-hidden="true"
        focusable="false"
        className={`sunself sunself-${tone} glass${pulseKey !== null || ripple > 0 ? " enter" : ""}${wake ? " wake" : ""}`}
        dangerouslySetInnerHTML={{ __html: body }}
      />
      {ripple > 0 && (
        <span key={ripple} className="sunself-ripple" aria-hidden="true" />
      )}
      {speak && showLine && <span className="sunself-line">{read.line}</span>}
    </>
  );

  const shared = {
    "data-cue": SUN_CUE[read.mood],
    "data-renderer": rendererKind,
    "data-tone": tone,
    "data-mood": read.mood,
    className: cls,
  } as const;

  return speak ? (
    <button
      type="button"
      ref={wrapRef as React.RefObject<HTMLButtonElement>}
      onClick={speakTap}
      aria-label={label}
      {...shared}
    >
      {inner}
    </button>
  ) : (
    <span ref={wrapRef} role="img" aria-label={label} {...shared}>
      {inner}
    </span>
  );
}
