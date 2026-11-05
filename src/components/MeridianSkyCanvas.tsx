"use client";

import { useEffect, useRef } from "react";
import { meridianSkyRenderer, type MeridianSkyRenderer, type MeridianSkyState } from "@/lib/meridian-sky-webgl";

/* The stage's world (docs/FLIGHT.md). A single canvas behind the DOM
 *  instruments — the scene is aria-hidden; every read stays a word in DOM.
 *  The parent hands a state factory so sun/arc positions can be computed
 *  against the real box at paint time, or drives the renderer imperatively
 *  through `onRenderer` (FeedWorld's scroll playhead). Reduced motion never
 *  constructs the renderer: the CSS stack stays the honest fallback. When
 *  GL paints, the parent adds `sky-gl` and the DOM depth layers stand down. */
export function MeridianSkyCanvas({
  state,
  onLive,
  onRenderer,
}: {
  /** The world as a function of the box. Optional when the parent paints
   *  imperatively via the renderer handed to `onRenderer`. */
  state?: (w: number, h: number) => MeridianSkyState;
  onLive?: (live: boolean) => void;
  /** The live renderer, for parents that own the playhead (FeedWorld). */
  onRenderer?: (r: MeridianSkyRenderer | null) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rr = useRef<MeridianSkyRenderer | null>(null);
  const stateRef = useRef(state);
  const liveCb = useRef(onLive);
  const rendererCb = useRef(onRenderer);
  useEffect(() => {
    stateRef.current = state;
    liveCb.current = onLive;
    rendererCb.current = onRenderer;
  });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = meridianSkyRenderer(canvas, {
      onContextLost: () => liveCb.current?.(false),
    });
    rr.current = r;
    rendererCb.current?.(r);
    if (!r) return;
    liveCb.current?.(true);
    const el = canvas.parentElement;
    const fine = window.matchMedia("(pointer: fine)");
    const move = (e: PointerEvent) => {
      if (!el) return;
      const b = el.getBoundingClientRect();
      r.pan(
        ((e.clientX - b.left) / Math.max(1, b.width)) * 2 - 1,
        ((e.clientY - b.top) / Math.max(1, b.height)) * 2 - 1,
      );
    };
    if (el && fine.matches) el.addEventListener("pointermove", move, { passive: true });
    return () => {
      if (el && fine.matches) el.removeEventListener("pointermove", move);
      r.dispose();
      rr.current = null;
      rendererCb.current?.(null);
      liveCb.current?.(false);
    };
  }, []);

  useEffect(() => {
    const r = rr.current;
    const c = ref.current;
    if (!r || !c || !state) return;
    r.paint(stateRef.current!(c.clientWidth || 2, c.clientHeight || 2));
  }, [state]);

  return <canvas ref={ref} className="meridian-sky" aria-hidden="true" />;
}
