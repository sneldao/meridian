"use client";

import { useEffect, useSyncExternalStore } from "react";

import { safeStorageSet } from "@/lib/local-data";

/* Ambient motion has a switch. The stage loops (the example day's haze, the
 * demo's star planes) already pause off-screen and on a hidden tab; this is
 * the traveller's own control, and it is the one WCAG 2.2.2 asks for —
 * motion that starts by itself and runs longer than five seconds beside other
 * content needs a way to stop. It is a preference, not a setting: stored
 * locally, applied to <html> so it holds across surfaces, and it never
 * touches reduced-motion, which still stands every loop down on its own. */

export const MOTION_PAUSE_KEY = "meridian:motion-paused";

/** The attribute is `data-motion-pause`, not `data-motion` — `.iday` already
 *  uses `data-motion` for its momentum mode, and the two must not collide. */
const ATTR = "motion-pause";
const EVENT = "meridian:motion";

export function setMotionPaused(paused: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (paused) root.dataset[ATTR] = "1";
  else delete root.dataset[ATTR];
  safeStorageSet(() => {
    if (paused) localStorage.setItem(MOTION_PAUSE_KEY, "1");
    else localStorage.removeItem(MOTION_PAUSE_KEY);
  }, "motion preference");
  window.dispatchEvent(new Event(EVENT));
}

/** The DOM attribute is the store: the server has no preference, the client
 *  reads what the effect below applied, and the event keeps every mounted
 *  switch in step. */
const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
};
const pausedNow = () =>
  typeof document !== "undefined" && document.documentElement.dataset.motionPause === "1";
const pausedOnServer = () => false;

export function MotionPause({ className }: { className?: string }) {
  const paused = useSyncExternalStore(subscribe, pausedNow, pausedOnServer);

  // Apply the stored preference once, after mount — the switch is a DOM
  // write, and the subscription re-renders the label from it.
  useEffect(() => {
    let stored = false;
    try {
      stored = localStorage.getItem(MOTION_PAUSE_KEY) === "1";
    } catch {
      stored = false;
    }
    if (stored) setMotionPaused(true);
  }, []);

  return (
    <button
      type="button"
      aria-pressed={paused}
      className={className}
      onClick={() => setMotionPaused(!paused)}
    >
      {paused ? "Resume drifting" : "Pause drifting"}
    </button>
  );
}
