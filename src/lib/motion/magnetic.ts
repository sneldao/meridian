/* Magnetic pointer recipe — ported from museum-of-motion
 * (github.com/johnpolacek/museum-of-motion, lib/motion/recipes/pointer-effects.ts, MIT).
 * The CTA follows the pointer a few pixels and settles back on leave.
 * hover:fine only; reduced motion and touch get the plain button.
 *
 * gsap arrives via a dynamic import, never the static bundle: this module is
 * imported by Today-surface components (NudgeFeedScreen, TripSetupScreen),
 * and the pull is progressive enhancement — the button works identically
 * while the effect chunk is still in flight. Callers that need the effect
 * synchronously should use the CSS-`translate` recipe in ui/Button instead. */

import { useEffect, useRef } from "react";
import type gsapInstance from "gsap";
type Gsap = typeof gsapInstance;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  const choice = document.documentElement.dataset.motion;
  if (choice === "reduced") return true;
  if (choice === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True when the primary input can hover precisely. */
function finePointer(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** Seconds a follower takes to catch the pointer. */
const FOLLOW = 0.45;
const FOLLOW_EASE = "power3.out";

export type Teardown = () => void;
type Register = (fn: () => void) => void;

/**
 * Runs setup in its own GSAP context and returns a once-only teardown that also rolls back a throw.
 * `dispose` stops writers and listeners before the context reverts; `after` restores after it.
 */
function own(gsap: Gsap, setup: (dispose: Register, after: Register) => void): Teardown {
  const ctx = gsap.context(() => {});
  const disposers: Array<() => void> = [];
  const restores: Array<() => void> = [];
  let done = false;
  const teardown = () => {
    if (done) return;
    done = true;
    let failure: unknown;
    const attempt = (fn: () => void) => {
      try {
        fn();
      } catch (error) {
        failure ??= error;
      }
    };
    disposers.splice(0).reverse().forEach(attempt);
    attempt(() => ctx.revert());
    restores.splice(0).reverse().forEach(attempt);
    if (failure) throw failure;
  };
  let failure: { error: unknown } | undefined;
  ctx.add(() => {
    try {
      setup((fn) => disposers.push(fn), (fn) => restores.push(fn));
    } catch (error) {
      failure = { error };
    }
  });
  if (failure) {
    teardown();
    throw failure.error;
  }
  return teardown;
}

/** Inline properties these effects write. */
const MOTION_PROPS = ["transform", "translate", "rotate", "scale", "opacity", "visibility"];

/**
 * Records inline properties and returns a restore. Reverting `quickTo` can leave its last
 * value inline, so restore after the context reverts. `clearProps` also resets GSAP's cache.
 */
function snapshotStyles(
  gsap: Gsap,
  elements: HTMLElement[],
  props = MOTION_PROPS,
): () => void {
  const saved = elements.map((element) =>
    props.map(
      (prop) =>
        [element.style.getPropertyValue(prop), element.style.getPropertyPriority(prop)] as const,
    ),
  );
  return () =>
    elements.forEach((element, i) => {
      gsap.set(element, { clearProps: props.filter((prop) => !prop.startsWith("--")).join(",") });
      props.forEach((prop, j) => {
        const [value, priority] = saved[i]?.[j] ?? ["", ""];
        if (value) element.style.setProperty(prop, value, priority);
        else element.style.removeProperty(prop);
      });
    });
}

/** Adds a listener and registers its removal. */
function listen<K extends keyof HTMLElementEventMap>(
  dispose: Register,
  target: HTMLElement | Document,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): void {
  target.addEventListener(type, handler as EventListener);
  dispose(() => target.removeEventListener(type, handler as EventListener));
}

export type MagneticOptions = {
  /** Share of the pointer's offset from center the target follows. */
  strength?: number;
  /** Extra share for the inner element, relative to the target. */
  inner?: number;
};

function startMagnetic(
  gsap: Gsap,
  target: HTMLElement,
  { strength = 0.3, inner = 0.5 }: MagneticOptions = {},
): Teardown {
  return own(gsap, (dispose, after) => {
    let center = { x: 0, y: 0 };
    // Measure once per visit; the target's own movement must not shift its center.
    const measure = () => {
      const rect = target.getBoundingClientRect();
      const x = Number(gsap.getProperty(target, "x"));
      const y = Number(gsap.getProperty(target, "y"));
      center = { x: rect.left - x + rect.width / 2, y: rect.top - y + rect.height / 2 };
    };
    const accepts = (event: PointerEvent) => event.pointerType === "mouse";
    const label = target.querySelector<HTMLElement>("[data-magnetic-inner]");
    after(snapshotStyles(gsap, label ? [target, label] : [target]));
    const to = (el: HTMLElement, prop: "x" | "y") =>
      gsap.quickTo(el, prop, { duration: FOLLOW, ease: FOLLOW_EASE });
    const xTo = to(target, "x");
    const yTo = to(target, "y");
    const innerX = label ? to(label, "x") : undefined;
    const innerY = label ? to(label, "y") : undefined;
    listen(dispose, target, "pointerenter", (event) => {
      if (accepts(event)) measure();
    });
    listen(dispose, target, "pointermove", (event) => {
      if (!accepts(event)) return;
      const dx = (event.clientX - center.x) * strength;
      const dy = (event.clientY - center.y) * strength;
      xTo(dx);
      yTo(dy);
      innerX?.(dx * inner);
      innerY?.(dy * inner);
    });
    listen(dispose, target, "pointerleave", () => {
      xTo(0);
      yTo(0);
      innerX?.(0);
      innerY?.(0);
    });
  });
}

export function magnetic(
  target: HTMLElement,
  options: MagneticOptions = {},
): Teardown {
  if (prefersReducedMotion() || !finePointer()) return () => {};
  let teardown: Teardown | null = null;
  let cancelled = false;
  import("gsap")
    .then(({ default: gsap }) => {
      if (cancelled) return;
      teardown = startMagnetic(gsap, target, options);
    })
    .catch(() => {
      /* the plain button stands */
    });
  return () => {
    cancelled = true;
    teardown?.();
  };
}

/** Attach a magnetic pull to an element. Returns a ref for the target. */
export function useMagnetic<T extends HTMLElement>(options?: MagneticOptions) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return magnetic(el, options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ref;
}
