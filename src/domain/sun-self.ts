/* The Sun-self (round 23) — the traveller's body clock given a face.
 *
 * Brand law: this is not a pet to care for, it is the traveller's own
 * meridian stepped off the dial. The dial is a sun on a ring with twelve
 * ticks; the glyph is that same sun, with eyelids. Every feature of its
 * face is computed from the same numbers the plan and the passport carry,
 * so the glyph can never look better than the trip honestly is:
 *
 *   lid    ← residual debt          (tired, never ashamed — no guilt states)
 *   glow   ← delivered / required   (OWED 4.5h of 9h = half-lit, not radiant)
 *   tilt   ← direction              (east leans into tomorrow, west back)
 *   rays   ← days locked            (the crew ignites one ray per locked day)
 *
 * Finch's lesson, kept: immediate visible response to real progress, and
 * zero-guilt — a skipped window closes the lids gently, it never wilts. */

export const SUNSELF_RAY_COUNT = 12;

/** Debt at which the lids are as heavy as we ever draw them. Nine hours is
 *  a severe crossing; nothing beyond it makes the face more drained. */
export const SUNSELF_SEVERE_DEBT_MIN = 540;

/** The lids never fully close while awake — asleep is its own state. */
const MAX_AWAKE_LID = 0.85;

export type SunSelfMood =
  | "sleeping"
  | "drained"
  | "waiting"
  | "lifting"
  | "half-lit"
  | "adjusted";

export interface SunSelfInput {
  /** Minutes the body clock still owes local time. */
  owedMin: number;
  /** Minutes the plan has already banked. */
  deliveredMin: number;
  /** Minutes the route requires in total. */
  requiredMin: number;
  direction: "east" | "west";
  /** Locked plan days, when a run carries them — lights the rays. */
  daysLocked?: number;
}

export interface SunSelfRead {
  /** 0 = eyes open, 1 = closed. Awake reads cap below 1. */
  lid: number;
  /** 0..1 — how much of the required shift is banked. */
  glow: number;
  /** Signed degrees; east leans forward, west leans back. */
  tiltDeg: number;
  raysLit: number;
  rayCount: number;
  mood: SunSelfMood;
  /** The honest one-liner the face is allowed to say. */
  line: string;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const h1 = (min: number) => (Math.round((min / 60) * 10) / 10).toFixed(1);

export function sunSelfRead(input: SunSelfInput): SunSelfRead {
  const owed = Math.max(0, Math.round(input.owedMin));
  const required = Math.max(0, Math.round(input.requiredMin));
  const delivered = Math.max(0, Math.min(input.deliveredMin, required));

  // No shift to carry — the meridian is home. Never divide by zero.
  if (required === 0) {
    return {
      lid: 0,
      glow: 1,
      tiltDeg: 0,
      raysLit: SUNSELF_RAY_COUNT,
      rayCount: SUNSELF_RAY_COUNT,
      mood: "adjusted",
      line: "No shift to carry — body clock home.",
    };
  }

  const glow = clamp01(delivered / required);
  const lid = clamp01(owed / SUNSELF_SEVERE_DEBT_MIN) * MAX_AWAKE_LID;
  const tiltDeg = owed === 0 ? 0 : input.direction === "east" ? 7 : -7;
  const raysLit =
    input.daysLocked !== undefined
      ? Math.max(0, Math.min(SUNSELF_RAY_COUNT, Math.round(input.daysLocked)))
      : Math.round(glow * SUNSELF_RAY_COUNT);

  const mood: SunSelfMood =
    owed <= 45 && glow >= 0.95
      ? "adjusted"
      : glow >= 0.6
        ? "half-lit"
        : glow >= 0.25
          ? "lifting"
          : glow > 0
            ? "waiting"
            : "drained";

  const line =
    mood === "adjusted"
      ? "Body clock home."
      : mood === "drained"
        ? `${h1(owed)}h to carry — the plan starts before the flight.`
        : mood === "waiting"
          ? `${h1(delivered)}h banked, ${h1(owed)}h to go — the first rays are lit.`
          : mood === "lifting"
            ? `${h1(delivered)}h banked, ${h1(owed)}h to go — visibly lifting.`
            : `${h1(delivered)}h banked, ${h1(owed)}h still owed — honestly.`;

  return {
    lid,
    glow,
    tiltDeg,
    raysLit,
    rayCount: SUNSELF_RAY_COUNT,
    mood,
    line,
  };
}

/** The lids-close law, shared by every face in the family: debt maps to
 *  lid weight, capped — worse than nine hours is never a sadder face. */
export function sunSelfLidForDebt(owedMin: number): number {
  return clamp01(Math.max(0, owedMin) / SUNSELF_SEVERE_DEBT_MIN) * MAX_AWAKE_LID;
}

/** No route yet — the empty-state face. Asleep, not sad: a traveller
 *  without a trip owes nothing. Kept for the surfaces that genuinely have
 *  nobody standing in front of them (CrewFeed's dozing state, the
 *  lookbook's sleeping window); the landing instrument now reads the
 *  visitor's own clock instead — see `sunSelfVisitor`. */
export function sunSelfSleeping(): SunSelfRead {
  return {
    lid: 1,
    glow: 0.08,
    tiltDeg: 0,
    raysLit: 0,
    rayCount: SUNSELF_RAY_COUNT,
    mood: "sleeping",
    line: "No route yet — the sun rises when the trip does.",
  };
}

/** The visitor read — no route yet, but a person is standing here. The
 *  face is the home face, honestly: eyes open, meridian fully lit — a body
 *  on its own clock carries no shift. The line is the one signal we
 *  already hold without asking: their timezone and their minute. */
export function sunSelfVisitor(cityLabel: string, timeLabel: string): SunSelfRead {
  const city = cityLabel.trim() || "local";
  return {
    lid: 0,
    glow: 1,
    tiltDeg: 0,
    raysLit: SUNSELF_RAY_COUNT,
    rayCount: SUNSELF_RAY_COUNT,
    mood: "adjusted",
    line: `Your body is on ${city} time — it thinks it's ${timeLabel}.`,
  };
}

/** The mood as a word a traveller would use — aria labels and captions. */
export function sunSelfMoodWord(mood: SunSelfMood): string {
  switch (mood) {
    case "adjusted":
      return "adjusted";
    case "half-lit":
      return "half-lit";
    case "lifting":
      return "lifting";
    case "waiting":
      return "warming up";
    case "drained":
      return "drained";
    case "sleeping":
      return "asleep";
  }
}
