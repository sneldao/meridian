import { sunSelfForBeat } from "./demo-beats";
import type { DemoJourney } from "./demo-beats";
import { demoJourney } from "./demo-beats";
import { sunSelfRead, sunSelfSleeping, sunSelfMoodWord, type SunSelfRead } from "./sun-self";

/* The lookbook of states (round 29).
 *
 *  A grid of windows, each holding one state of the traveller's meridian —
 *  asleep, drained, lifting, half-lit, adjusted. The lookbook is a portrait
 *  gallery of what the body clock can be, and the honesty law of the whole
 *  round applies: every face here is *computed* by the same functions the
 *  beats, the stage and the passport trust, never authored. A window's state
 *  word is `sunSelfMoodWord` of its read; the caption is the read's own line.
 *
 *  The four journey states ride the demo journey's beats (stakes = drained,
 *  crew = lifting, payoff = half-lit). Asleep and adjusted are the two ends
 *  of the family that no trip in between produces: asleep is the empty entry
 *  (no route yet, nothing owed), adjusted is the same-timezone read (no shift
 *  to carry). Both are computed by their own domain functions, so the
 *  lookbook can only ever show faces the model says exist. */

export interface LookbookWindow {
  id: string;
  /** The hour or moment this state belongs to — the window's label. */
  when: string;
  /** The state as a word the traveller would use. */
  state: string;
  /** The computed face the takeover reveals. */
  read: SunSelfRead;
}

/** Asleep: no route yet. The empty-entry face, unchanged. */
function sleepingWindow(): LookbookWindow {
  const read = sunSelfSleeping();
  return { id: "asleep", when: "No trip yet", state: sunSelfMoodWord(read.mood), read };
}

/** Adjusted: a route with no shift to carry — the body clock at home. */
function adjustedWindow(journey: DemoJourney): LookbookWindow {
  const required = Math.abs(journey.trip.requiredShiftMin) || 60;
  const read = sunSelfRead({
    owedMin: 0,
    deliveredMin: required,
    requiredMin: required,
    direction: journey.trip.direction,
    daysLocked: 0,
  });
  return { id: "adjusted", when: "Home time, arrived", state: sunSelfMoodWord(read.mood), read };
}

/** The lookbook for a journey, in the order the trip lives them. */
export function lookbookWindows(journey: DemoJourney): LookbookWindow[] {
  return [
    sleepingWindow(),
    {
      id: "drained",
      when: "The night before",
      state: sunSelfMoodWord(sunSelfForBeat(journey, "stakes").mood),
      read: sunSelfForBeat(journey, "stakes"),
    },
    {
      id: "lifting",
      when: "Mid-crossing",
      state: sunSelfMoodWord(sunSelfForBeat(journey, "crew").mood),
      read: sunSelfForBeat(journey, "crew"),
    },
    {
      id: "half-lit",
      when: "The first morning",
      state: sunSelfMoodWord(sunSelfForBeat(journey, "payoff").mood),
      read: sunSelfForBeat(journey, "payoff"),
    },
    adjustedWindow(journey),
  ];
}

/** The lookbook built from the canonical demo journey. */
export function demoLookbook(): LookbookWindow[] {
  return lookbookWindows(demoJourney("miles"));
}
