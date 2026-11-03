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

/** Crew avatar poses from `CrewAvatar.tsx`. Every avatar derives its cue
 *  from its pose, so an agent drawn outside the live crew row still gets the
 *  shared beat — this table is the only place that mapping lives. */
export type CrewCueState =
  | "resting"
  | "attentive"
  | "working"
  | "explaining"
  | "concerned"
  | "complete";

export const CREW_STATE_CUE: Record<CrewCueState, MotionCue> = {
  resting: "arrive",
  attentive: "work",
  working: "work",
  explaining: "work",
  concerned: "fail",
  complete: "done",
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
