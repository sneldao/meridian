/**
 * One vocabulary for how the mascot sun and the crew agents show progress.
 * Both surfaces resolve their own state to one of four cues, so a user learns
 * one set of signals: arrive, work, done, fail.
 */

export type MotionCue = "arrive" | "work" | "done" | "fail";

/** Sun moods from `sun-self.ts`. */
export type SunCueMood =
  | "sleeping"
  | "drained"
  | "waiting"
  | "lifting"
  | "half-lit"
  | "adjusted";

/** Crew moods from `CrewFaces.tsx`. */
export type CrewCueMood =
  | "idle"
  | "working"
  | "searching"
  | "asking"
  | "worried"
  | "happy"
  | "settled";

export const SUN_CUE: Record<SunCueMood, MotionCue> = {
  sleeping: "arrive",
  waiting: "arrive",
  lifting: "work",
  "half-lit": "work",
  adjusted: "done",
  drained: "fail",
};

export const CREW_CUE: Record<CrewCueMood, MotionCue> = {
  idle: "arrive",
  working: "work",
  searching: "work",
  asking: "work",
  worried: "fail",
  happy: "done",
  settled: "done",
};
