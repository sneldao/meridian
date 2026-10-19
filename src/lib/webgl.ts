"use client";

import { useSyncExternalStore } from "react";

// One WebGL probe for the whole app. Both the globe spike and the hero panel
// ask the same question — "can this browser hand us a GL context?" — and they
// must agree, or the fallback story differs by surface.
//
// Probing needs `document`, so it cannot happen during SSR. Resolved through
// useSyncExternalStore rather than a mount effect: the server snapshot is
// `false`, so the first paint and the hydration pass agree instead of a
// canvas popping in a frame later.

function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

let webglCache: boolean | null = null;
const noopSubscribe = () => () => {};
const webglStore = {
  subscribe: noopSubscribe,
  getSnapshot: () => (webglCache ??= webglAvailable()),
  getServerSnapshot: () => false,
};

/** True when this browser can render the WebGL dawn globe. False on the
 *  server and until the first client probe — callers treat false as
 *  "render the SVG surface", which is also the right thing for browsers
 *  that genuinely have no WebGL. */
export function useWebGLAvailable(): boolean {
  return useSyncExternalStore(
    webglStore.subscribe,
    webglStore.getSnapshot,
    webglStore.getServerSnapshot,
  );
}
