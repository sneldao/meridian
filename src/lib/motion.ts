import type { Transition, Variants } from "framer-motion";

export const easeSmoothOut = [0.22, 1, 0.36, 1] as const;

export const transitionFast: Transition = {
  duration: 0.25,
  ease: easeSmoothOut,
};

export const transitionBase: Transition = {
  duration: 0.35,
  ease: easeSmoothOut,
};

/** The day-lock spring — the product's core moment, snappy and final. */
export const springLock: Transition = { type: "spring", stiffness: 380, damping: 18 };

/** Calendar event moves — deliberate, weighty. */
export const springCalendar: Transition = { type: "spring", stiffness: 160, damping: 22 };

/** Panel/card entrances — soft landing. */
export const springEnter: Transition = { type: "spring", stiffness: 90, damping: 16 };

export const feedItemVariants: Variants = {
  hidden: { opacity: 0, x: -8, scale: 0.99 },
  visible: { opacity: 1, x: 0, scale: 1 },
};

export const lensSwitchVariants: Variants = {
  initial: { opacity: 0, x: 16 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -16 },
};

export const panelEnterVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
};
