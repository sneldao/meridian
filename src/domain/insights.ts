import {
  PROTECTED_KINDS,
  effectiveCalendar,
  evaluatePlan,
  fmtMin,
} from "./circadian";
import { ASSUMED_MORNING_MIN } from "./route-gap";
import { bodyClockMin } from "./readiness";
import type { HeroMeeting } from "./hero";
import type {
  AdherenceProfile,
  CalendarEvent,
  DayPlan,
  EvalResult,
  Trip,
} from "./types";

/* InsightCards (docs/plan/agent-native.md step 6) — the crew's findings as
 * "one prose line → one mini visual → one action pill", paged inside the
 * `next` room's slab. This module is the honesty layer:
 *
 * - Every number is read from state the feed already computes — the residual
 *   the body still owes, previewPlan/coverage for the shift curve,
 *   evaluatePlan's own scan for the conflict, the resolved day pin for the
 *   crate match. Nothing is invented to fill the carousel; a card exists
 *   only where its fact exists, and 1–3 cards is the expected range.
 * - Modeled numbers keep the provenance vocabulary the chips established:
 *   "estimated" for computed body time, "Preview"/"Example" tags when the
 *   plan underneath is the solver's or the fixture's, never "your alertness".
 */

export interface InsightStripWindow {
  startMin: number;
  /** May exceed 1440 — the overnight convention the strips already use. */
  endMin: number;
}

export type InsightViz =
  | {
      type: "shift-curve";
      /** Cumulative shift banked after each planned day — the coverage
       *  math the provenance step already uses, drawn as a polyline. */
      points: readonly { dayIndex: number; bankedMin: number }[];
      /** The shift the trip owes (the dashed line the curve grows toward). */
      requiredMin: number;
      /** The trip's day count — the curve's x axis. */
      days: number;
    }
  | {
      type: "day-strip";
      /** The flagged day's intervention windows, in plan order. */
      windows: readonly InsightStripWindow[];
      /** The conflicting window — hatched on the strip. */
      flag?: InsightStripWindow;
    }
  | {
      type: "pin";
      /** The quiet line under the pin glyph — the feed-pin's own wording. */
      label: string;
    };

export interface InsightCardModel {
  id: "gap" | "conflict" | "place";
  /** The finding in one prose line. */
  prose: string;
  viz: InsightViz;
  /** The action is real or absent — the day-selection affordance the feed
   *  already owns; a card with no honest action carries no pill. */
  action?: { label: string; dayLabel: string };
  /** The disclosure tag for fixture/preview facts — the chips' vocabulary,
   *  not a new hedge. */
  tag?: string;
}

export interface InsightFacts {
  trip: Trip | null;
  /** Minutes the body still owes the destination — the same residual the
   *  stage and the feed's body-clock line already show. */
  owedMin: number;
  /** The best plan set the surface has: locked days when they exist, else
   *  the solver's preview — the same set the hero and scene read. */
  plans: readonly DayPlan[];
  /** True when `plans` is the solver's preview rather than locked output. */
  plansArePreview: boolean;
  /** The trip's marked event (performanceMoment) when one exists. */
  moment: HeroMeeting | null;
  calendar: readonly CalendarEvent[];
  adherence: AdherenceProfile;
  baseline?: { avgBedtimeMin: number; avgWakeMin: number };
  /** A resolved day pin (dayPlacePin) when a real one exists — the crate
   *  match card's only source. */
  pin?: {
    placeName: string;
    category?: string;
    startMin: number;
    endMin: number;
    dayLabel: string;
    kept: boolean;
  } | null;
  /** The feed's stamped example state — tags the card rather than hiding
   *  inside the prose. */
  example?: boolean;
  /** The pin's provenance — recorded/imagined samples say so. */
  pinSample?: "recorded" | "imagined" | null;
}

const overlaps = (aS: number, aE: number, bS: number, bE: number) =>
  aS < bE && bS < aE;
const spaced = (kind: string) => kind.replace(/_/g, " ");
const hourLabel = (min: number) =>
  (Math.abs(min) / 60).toFixed(1).replace(/\.0$/, "");

const ivWindow = (iv: DayPlan["interventions"][number]): InsightStripWindow => {
  let end = iv.endMin ?? iv.startMin + 30;
  if (end <= iv.startMin) end += 1440;
  return { startMin: iv.startMin, endMin: end };
};

/** The flag count the crew's own rows report — every gate violation plus
 *  the movable-event overlaps it only notes (the account and Iris's TaskRow
 *  share this formula). */
export function insightFlagCount(result: EvalResult): number {
  return (
    result.violations.length +
    result.notes.filter((n) => n.includes("overlaps movable")).length
  );
}

/** The first (event, intervention) overlap on a day — evaluatePlan's own
 *  scan order (events outer, interventions inner), so the triple the card
 *  names is the one the gate actually wrote. `movable` selects which event
 *  kind counts: a fixed collision is a violation, a movable one is a note. */
function firstOverlap(
  day: DayPlan,
  events: readonly CalendarEvent[],
  movable: boolean,
): { iv: DayPlan["interventions"][number]; ev: CalendarEvent } | null {
  for (const ev of events) {
    if (ev.dayIndex !== day.dayIndex || ev.blocksInterventions === false) continue;
    if (ev.movable !== movable) continue;
    for (const iv of day.interventions) {
      if (!PROTECTED_KINDS.has(iv.kind)) continue;
      const w = ivWindow(iv);
      if (overlaps(w.startMin, w.endMin, ev.startMin, ev.endMin)) return { iv, ev };
    }
  }
  return null;
}

/** A fixed event that swallows the whole post-wake light window is the
 *  gate's other calendar violation — no protected-kind overlap, so it gets
 *  its own probe, the same shape evaluatePlan uses. */
function lightBlocker(
  day: DayPlan,
  events: readonly CalendarEvent[],
): CalendarEvent | null {
  const hasLight = day.interventions.some((iv) => iv.kind === "light_exposure");
  if (!hasLight || day.shiftMin >= 0) return null;
  for (const ev of events) {
    if (ev.dayIndex !== day.dayIndex || ev.blocksInterventions === false) continue;
    if (ev.startMin <= day.targetWakeMin && ev.endMin >= day.targetWakeMin + 120) {
      return ev;
    }
  }
  return null;
}

/** The intervention a non-calendar violation is about, when the message
 *  implicates one — matched by the kind the gate named, not guessed. */
function implicatedWindow(
  day: DayPlan,
  code: string,
  message: string,
): InsightStripWindow | undefined {
  const quoted = message.match(/"([a-z_ ]+)"/)?.[1];
  const byKind =
    quoted !== undefined
      ? day.interventions.find((iv) => spaced(iv.kind) === quoted)
      : undefined;
  const KIND_BY_CODE: Record<string, string> = {
    SLEEP_TOO_SHORT: "sleep_window",
    CAFFEINE_TOO_LATE: "caffeine_cutoff",
    LIGHT_WRONG_WINDOW: "light_exposure",
    MISSING_LIGHT_ANCHOR: "light_exposure",
  };
  const iv =
    byKind ??
    (KIND_BY_CODE[code]
      ? day.interventions.find((x) => x.kind === KIND_BY_CODE[code])
      : undefined);
  return iv ? ivWindow(iv) : undefined;
}

export function insightCards(facts: InsightFacts): InsightCardModel[] {
  const { trip } = facts;
  if (!trip) return [];
  const cards: InsightCardModel[] = [];
  const tag = facts.example
    ? "Example plan"
    : facts.plansArePreview
      ? "Preview"
      : undefined;

  /* 1 — the body-clock gap. The gap is the residual the stage shows;
   *  the event half comes from the trip's marked event when one exists,
   *  else the assumed first-07:00 morning — the route-gap read's own
   *  convention. Both halves are modeled, and the prose says so. */
  if (facts.owedMin > 0) {
    const gap = hourLabel(facts.owedMin);
    const rel = trip.direction === "east" ? "behind" : "ahead";
    const prose = facts.moment
      ? `Your body is ${gap}h ${rel} ${trip.destination.name} — the ${facts.moment.title} lands at ${fmtMin(facts.moment.localMin)} local, an estimated ${fmtMin(facts.moment.bodyMin)} body time.`
      : `Your body is ${gap}h ${rel} ${trip.destination.name} — a ${fmtMin(ASSUMED_MORNING_MIN)} morning there lands at an estimated ${fmtMin(
          bodyClockMin(ASSUMED_MORNING_MIN, facts.owedMin, trip.direction),
        )} body time.`;
    const sign = trip.direction === "east" ? -1 : 1;
    let acc = 0;
    cards.push({
      id: "gap",
      prose,
      viz: {
        type: "shift-curve",
        points: facts.plans.map((d) => ({
          dayIndex: d.dayIndex,
          bankedMin: Math.max(0, (acc += sign * d.shiftMin)),
        })),
        requiredMin: Math.abs(trip.requiredShiftMin),
        days: trip.days.length,
      },
      action: facts.moment
        ? { label: "See the day", dayLabel: facts.moment.dayLabel }
        : undefined,
      tag,
    });
  }

  /* 2 — the conflict flag. The same scan Iris's row counts: evaluatePlan
   *  over the best plan set against the calendar as it will actually be
   *  (moves folded). No flags, no card — the card is the flag's existence. */
  if (facts.plans.length > 0) {
    let verdict: EvalResult | null = null;
    try {
      verdict = evaluatePlan({
        trip,
        days: [...facts.plans],
        calendar: effectiveCalendar([...facts.calendar]),
        adherence: facts.adherence,
        baseline: facts.baseline,
      });
    } catch {
      verdict = null; // the gate disagreeing is not a flag — leave the card off
    }
    if (verdict && insightFlagCount(verdict) > 0) {
      const events = effectiveCalendar([...facts.calendar]);
      const v0 = verdict.violations[0];
      const day = facts.plans.find((d) => d.dayIndex === (v0?.dayIndex ?? -1));
      let prose: string | null = null;
      let flagDay = day;
      let flagWindow: InsightStripWindow | undefined;
      if (v0 && !day) {
        // The gate flagged a day the surface doesn't hold a plan for — the
        // message still names the day itself, so quote it whole.
        prose = `Iris flagged a day — ${v0.message}`;
      } else if (v0 && day) {
        if (v0.code === "CALENDAR_CONFLICT") {
          const hit = firstOverlap(day, events, false);
          const blocker = hit ? null : lightBlocker(day, events);
          if (hit) {
            flagWindow = { startMin: hit.ev.startMin, endMin: hit.ev.endMin };
            prose = `Iris flagged "${hit.ev.title}" on ${day.label} — it collides with your ${spaced(
              hit.iv.kind,
            )} window (${fmtMin(hit.ev.startMin)}–${fmtMin(hit.ev.endMin)}).`;
          } else if (blocker) {
            flagWindow = { startMin: blocker.startMin, endMin: blocker.endMin };
            prose = `Iris flagged "${blocker.title}" on ${day.label} — it blocks the morning light window (${fmtMin(blocker.startMin)}–${fmtMin(blocker.endMin)}).`;
          } else {
            // A calendar violation whose pair no longer overlaps — quote the
            // gate's own message rather than reconstruct a window.
            flagWindow = undefined;
            prose = `Iris flagged ${day.label} — ${v0.message.slice(day.label.length + 2)}`;
          }
        } else {
          flagWindow = implicatedWindow(day, v0.code, v0.message);
          prose = `Iris flagged ${day.label} — ${v0.message.slice(day.label.length + 2)}`;
        }
      } else {
        // No violation — the flag is a movable overlap the gate only noted.
        for (const d of facts.plans) {
          const hit = firstOverlap(d, events, true);
          if (hit) {
            flagDay = d;
            flagWindow = { startMin: hit.ev.startMin, endMin: hit.ev.endMin };
            prose = `Iris flagged "${hit.ev.title}" on ${d.label} — it overlaps your ${spaced(
              hit.iv.kind,
            )} window; the negotiator can move it.`;
            break;
          }
        }
      }
      if (prose && flagDay) {
        cards.push({
          id: "conflict",
          prose,
          viz: {
            type: "day-strip",
            windows: flagDay.interventions.map(ivWindow),
            flag: flagWindow,
          },
          action: { label: "See the day", dayLabel: flagDay.label },
          tag,
        });
      }
    }
  }

  /* 3 — the crate match. A real resolved pin on a real day; sample-sourced
   *  itineraries keep their provenance on the tag. */
  if (facts.pin) {
    const cat = facts.pin.category ? ` — ${facts.pin.category}` : "";
    cards.push({
      id: "place",
      prose: `Scout found ${facts.pin.placeName}${cat} — it sits inside your ${fmtMin(
        facts.pin.startMin,
      )}–${fmtMin(facts.pin.endMin)} window on ${facts.pin.dayLabel}.`,
      viz: {
        type: "pin",
        label: `from your crate${facts.pin.kept ? " · kept" : ""}`,
      },
      action: { label: "See this day", dayLabel: facts.pin.dayLabel },
      tag: facts.pinSample ? "Example schedule" : undefined,
    });
  }

  return cards;
}
