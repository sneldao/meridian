import { fmtMin } from "./circadian";
import type {
  AdherenceProfile,
  CalendarEvent,
  CalendarMove,
  Citation,
  DayPlan,
  EvalResult,
  Intervention,
  Trip,
  WearableBaseline,
} from "./types";

/** Intervention kinds that own exclusive time — a movable event sitting on
 *  one is what earns a calendar-move suggestion. */
const PROTECTED_KINDS = new Set<Intervention["kind"]>([
  "light_exposure",
  "avoid_light",
  "sleep_window",
  "exercise",
]);

export type NudgeCategory =
  | "sunlight"
  | "run"
  | "nutrition"
  | "calendar"
  | "sleep"
  | "flight";

export interface TravelerNudge {
  id: string;
  dayIndex: number;
  dayLabel: string;
  category: NudgeCategory;
  /** The plan intervention this step renders, when it has one — what lets
   *  provenance say "solver's slot" versus "the planner moved it". */
  kind?: Intervention["kind"];
  title: string;
  timeWindow: string;
  startMin: number;
  /** Minutes since local midnight when the step's window ends. Wrap-aware:
   *  endMin < startMin means the window crosses midnight. */
  endMin: number;
  durationLabel: string;
  actionSummary: string;
  whyItHelps: string;
  citation?: Citation;
  /** Provenance chain — populated from the run's CrewEvents so "why" expands
   *  into real evidence. Absent means there is no evidence; never fabricate. */
  evidence?: {
    citationId?: string;
    evalVerdict?: { score: number; violations: string[] };
    memoryPath?: string;
    draftRejected?: boolean;
    /** Where this cue sits relative to the solver's draft — "kept" means the
     *  planner adopted the solver's slot; movedMin is the signed delta when
     *  the submission placed it elsewhere. Only present when the run carried
     *  a solverDraft to compare against. */
    placedBy?: "solver" | "planner";
    movedMin?: number;
  };
  calendarMove?: {
    eventTitle: string;
    fromTime: string;
    toTime: string;
    movable: boolean;
  };
}

export interface FlightOptionRecommendation {
  id: string;
  badge: "Best" | "Workable" | "Hardest";
  recommended: boolean;
  departsLocal: string;
  arrivesDest: string;
  /** The window as minutes — what the solver actually plans around. */
  departMin: number;
  arriveMin: number;
  /** One line — who this window suits, e.g. "Lands in morning daylight". */
  bestFor: string;
  cabinSleepWindow: string;
  whyChoose: string;
  firstNudgeOnLanding: string;
}

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;

/**
 * Generates 3 route-aware flight timing options so a traveler who has a choice
 * of flights knows exactly which departure/arrival window minimizes jet lag.
 */
export function getFlightRecommendations(trip: Trip): FlightOptionRecommendation[] {
  const east = trip.direction === "east";
  const shiftHours = Math.max(1, Math.round(Math.abs(trip.requiredShiftMin) / 60));

  if (east) {
    return [
      {
        id: "midday-afternoon",
        badge: "Best",
        recommended: true,
        departsLocal: "11:20",
        arrivesDest: "07:50 (+1)",
        departMin: 11 * 60 + 20,
        arriveMin: 7 * 60 + 50,
        bestFor: "Lands in morning daylight — anchor day one outdoors",
        cabinSleepWindow: "Sleep hrs 2–7 of flight (13:00–18:00 body time)",
        whyChoose: `Going ${shiftHours}h east requires advancing your clock. A midday departure lets you dim the cabin early, sleep during ${trip.destination.name}'s night, and step straight into morning sunlight on arrival.`,
        firstNudgeOnLanding:
          "No sunglasses at arrival — get 30 min of outdoor daylight + an easy 20-min shakeout jog before 10:30 local.",
      },
      {
        id: "evening-redeye",
        badge: "Workable",
        recommended: false,
        departsLocal: "19:15",
        arrivesDest: "15:45 (+1)",
        departMin: 19 * 60 + 15,
        arriveMin: 15 * 60 + 45,
        bestFor: "Easier to sleep on board; lands near dusk",
        cabinSleepWindow: "Sleep first 6h immediately after takeoff",
        whyChoose:
          "Your body naturally wants to sleep at 20:30, so boarding tired feels easy—but landing late afternoon gives you only ~90 minutes of daylight before your first local night.",
        firstNudgeOnLanding:
          "Drop bags and get outside before 17:00 for last-hour daylight, then eat a light protein dinner at 19:00.",
      },
      {
        id: "early-morning",
        badge: "Hardest",
        recommended: false,
        departsLocal: "06:30",
        arrivesDest: "02:50 (+1)",
        departMin: 6 * 60 + 30,
        arriveMin: 2 * 60 + 50,
        bestFor: "Pre-dawn airport start; lands in the middle of the night",
        cabinSleepWindow: "Hard to sleep — cabin aligns with peak daytime alertness",
        whyChoose:
          "Waking at 04:00 exposes you to bright airport light in the hours your body most wants sleep (which pushes your clock the wrong way) and lands you tired with a full day still ahead.",
        firstNudgeOnLanding:
          "Wear dark glasses until 07:00 local, take a 20-min recovery nap max, then anchor with outdoor light at 08:30.",
      },
    ];
  }

  // Westward travel (e.g. LHR -> JFK / SFO)
  return [
    {
      id: "afternoon-west",
      badge: "Best",
      recommended: true,
      departsLocal: "14:30",
      arrivesDest: "17:40 (same day)",
      departMin: 14 * 60 + 30,
      arriveMin: 17 * 60 + 40,
      bestFor: "Arrive for dinner and sleep through your first night",
      cabinSleepWindow: "Stay awake whole flight · 25m power nap only",
      whyChoose: `Going ${shiftHours}h west means delaying your clock. An afternoon flight lands you in ${trip.destination.name} early evening: your built-up sleep drive carries you to a 22:00 local bedtime without waking at 03:00.`,
      firstNudgeOnLanding:
        "Get 25 min of late-afternoon sunlight on arrival, eat dinner at 19:30 local, and hold bedtime until at least 21:45.",
    },
    {
      id: "morning-west",
      badge: "Workable",
      recommended: false,
      departsLocal: "09:15",
      arrivesDest: "12:25 (same day)",
      departMin: 9 * 60 + 15,
      arriveMin: 12 * 60 + 25,
      bestFor: "Half a day at destination; watch the late-afternoon dip",
      cabinSleepWindow: "No cabin sleep — stay hydrated & active",
      whyChoose:
        "Good if you have an afternoon meeting, provided you use timed afternoon outdoor light and an easy run at 16:30 to push past your home bedtime.",
      firstNudgeOnLanding:
        "Last coffee at 13:30 local, then a 25-min outdoor run at 16:30 to keep melatonin suppressed until evening.",
    },
    {
      id: "late-night-west",
      badge: "Hardest",
      recommended: false,
      departsLocal: "20:45",
      arrivesDest: "23:55 (same day)",
      departMin: 20 * 60 + 45,
      arriveMin: 23 * 60 + 55,
      bestFor: "Boards near your bedtime; risks a 03:30 wake-up",
      cabinSleepWindow: "Avoid deep sleep — 45m nap max on board",
      whyChoose:
        "Because you board near your home bedtime, it's tempting to sleep 5 hours on the plane—which guarantees you'll wake up wide awake at 03:30 AM in your hotel.",
      firstNudgeOnLanding:
        "Go straight to bed on arrival with a blackout mask, and avoid bright morning light before 08:30 local.",
    },
  ];
}

/** Resolves a picker id against this trip's options — direction-scoped, so a
 *  west id on an eastbound trip (or a stale default like "midday-afternoon")
 *  returns null rather than silently planning around the wrong direction. */
export function flightWindowFor(trip: Trip, id: string | null | undefined): { departMin: number; arriveMin: number } | null {
  if (!id) return null;
  const rec = getFlightRecommendations(trip).find((r) => r.id === id);
  return rec ? { departMin: rec.departMin, arriveMin: rec.arriveMin } : null;
}

/**
 * Builds a complete, consumer-friendly set of daily nudges for a given day of the trip.
 * Uses the AI crew's DayPlan when available, and enriches every day with concrete
 * Sunlight, Run/Workout, Meal/Hydration/Caffeine, Calendar Move, and Sleep nudges.
 */
export function buildDailyNudgesForDay(params: {
  trip: Trip;
  dayIndex: number;
  plan?: DayPlan;
  baseline?: WearableBaseline;
  calendarEvents: CalendarEvent[];
  moves: CalendarMove[];
  citations: Citation[];
  /** The day's scorer verdicts (latest = gate result) — powers the "why"
   *  expander's evidence row. Absent pre-run and in fixtures. */
  verdicts?: EvalResult[];
  /** The day was rejected at least once before locking. */
  dayRejected?: boolean;
  /** Latest graph-memory hop path the crew consulted this run — evidence that
   *  cross-run memory shaped the plan. Only set when a recall tool really ran. */
  memoryPath?: string;
  /** Compliance floor for placing asks; wired in a follow-up. */
  adherence?: AdherenceProfile;
  /** The solver's placement for this day, when the run carried it — the
   *  baseline per-cue provenance is diffed against. */
  solverDraft?: DayPlan;
}): TravelerNudge[] {
  const { trip, dayIndex, plan, calendarEvents, moves, citations, verdicts, dayRejected, memoryPath, adherence, solverDraft } = params;

  // No plan → no steps. The feed renders "not placed yet — personalise";
  // nothing here may invent times from a synthetic wake schedule.
  if (!plan) return [];

  const spec = trip.days[dayIndex] ?? { dayIndex, label: `Day ${dayIndex + 1}`, date: "" };
  const east = trip.direction === "east";
  const isFlightDay = dayIndex === trip.departureDayIndex;
  const isArrivalDay = dayIndex > trip.departureDayIndex;
  const citationMap = new Map(citations.map((c) => [c.id, c]));
  const floor = adherence?.ignoresInterventionsBeforeMin ?? 0;
  const wakeMin = plan.targetWakeMin;
  const bedMin = plan.targetBedtimeMin;

  // Placement helpers — every suggested ask dodges the day's blocking
  // calendar events and lands at/after the compliance floor.
  const blocking = calendarEvents.filter(
    (e) => e.dayIndex === dayIndex && e.blocksInterventions !== false,
  );
  const eventClash = (s: number, e: number, ignoreId?: string) =>
    blocking.some((ev) => ev.id !== ignoreId && s < ev.endMin && ev.startMin < e);
  /** First 15-minute-step slot of `duration` minutes starting at/after
   *  `earliest`, ending by `latestEnd`, overlapping no blocking event. */
  const freeSlot = (earliest: number, latestEnd: number, duration: number): number | null => {
    for (let s = earliest; s + duration <= latestEnd; s += 15) {
      if (!eventClash(s, s + duration)) return s;
    }
    return null;
  };
  const ivSpan = (iv: Intervention): { s: number; e: number } => {
    const e = iv.endMin ?? iv.startMin + 60;
    return { s: iv.startMin, e: e <= iv.startMin ? e + 1440 : e };
  };

  const nudges: TravelerNudge[] = [];

  // 1. OUTSIDE LIGHT — only when the plan carries a light block. Never fall
  // back to wakeMin: a step at the wake target reads as "get light at 05:15"
  // when the scorer actually placed it at the 07:00 floor.
  const lightIv = plan.interventions.find((iv) => iv.kind === "light_exposure");
  const lightStart = lightIv?.startMin;
  const lightEnd =
    lightIv !== undefined ? (lightIv.endMin ?? wrap(lightIv.startMin + 60)) : undefined;
  if (lightIv && lightStart !== undefined && lightEnd !== undefined) {
    nudges.push({
      id: `${spec.label}-sunlight`,
      dayIndex,
      dayLabel: spec.label,
      category: "sunlight",
      kind: "light_exposure",
      title: isFlightDay
        ? "Cabin light and arrival daylight"
        : east
          ? "Get outside light"
          : "Late-afternoon light outside",
      timeWindow: `${fmtMin(lightStart)} – ${fmtMin(lightEnd)}`,
      startMin: lightStart,
      endMin: lightEnd,
      durationLabel: "30 min outdoors · no sunglasses",
      actionSummary: isFlightDay
        ? `Open the shade and keep the cabin bright at ${fmtMin(lightStart)} — it reads as morning in ${trip.destination.name}.`
        : east
          ? `Outside by ${fmtMin(lightStart)} — even an overcast sky beats indoor light.`
          : `Outside at ${fmtMin(lightStart)} — late-day light is what keeps you up tonight.`,
      whyItHelps: east
        ? `Daylight at this time of morning pulls your body clock toward ${trip.destination.name} — the strongest lever you have.`
        : `Evening light pushes your body clock later so you don't wake at 04:00 in ${trip.destination.name}.`,
      citation: lightIv.citationId ? citationMap.get(lightIv.citationId) : undefined,
    });
  }

  // 2. RUN — the plan's exercise block if it has one. Otherwise the outdoor
  // run doubles as the light dose (paired at the light block), or the first
  // free slot at/after the floor. Flight day gets no run without an exercise
  // intervention.
  const exerciseIv = plan.interventions.find((iv) => iv.kind === "exercise");
  let runStart: number | null = null;
  let runEnd = 0;
  if (exerciseIv) {
    runStart = exerciseIv.startMin;
    runEnd = exerciseIv.endMin ?? wrap(runStart + 40);
  } else if (!isFlightDay) {
    if (east) {
      if (lightIv && lightIv.startMin >= floor && !eventClash(lightIv.startMin, lightIv.startMin + 40)) {
        runStart = lightIv.startMin;
        runEnd = wrap(lightIv.startMin + 40);
      } else {
        const s = freeSlot(Math.max(floor, lightEnd ?? floor), bedMin - 180, 40);
        if (s !== null) {
          runStart = s;
          runEnd = wrap(s + 40);
        }
      }
    } else {
      const s = freeSlot(wrap(bedMin - 240), bedMin - 180, 40);
      if (s !== null) {
        runStart = s;
        runEnd = wrap(s + 40);
      }
    }
  }
  if (runStart !== null) {
    // 5B4 — the run pairs with light by design (outdoor run doubles as the
    // light dose), so back-to-back 07:00 windows are intentional, not a
    // placement bug. Name the pairing when it fires so simultaneity reads
    // as deliberate: "Run + light together". No solver change — the
    // physiology wants them together.
    const pairedWithLight =
      east && !isFlightDay && !isArrivalDay && lightIv && runStart === lightIv.startMin;
    nudges.push({
      id: `${spec.label}-run`,
      dayIndex,
      dayLabel: spec.label,
      category: "run",
      kind: "exercise",
      title: isFlightDay
        ? "Pre-boarding walk"
        : isArrivalDay
          ? `Easy run outside in ${trip.destination.name}`
          : pairedWithLight
            ? "Run + light together"
            : east
              ? "Easy run outside"
              : "Afternoon run",
      timeWindow: `${fmtMin(runStart)} – ${fmtMin(runEnd)}`,
      startMin: runStart,
      endMin: runEnd,
      durationLabel: isFlightDay ? "20 min brisk walk" : "35–45 min easy",
      actionSummary: isFlightDay
        ? "A brisk 20-min walk and a few hip openers before boarding — save heavy training for after landing."
        : isArrivalDay
          ? `Conversational pace outside at ${fmtMin(runStart)} — doubles as your daylight dose.`
          : east
            ? `Run at ${fmtMin(runStart)} — outdoors, easy pace.`
            : `Run at ${fmtMin(runStart)} — an afternoon session helps you stay up to the new bedtime.`,
      whyItHelps:
        "Moving at the right time of day reinforces the new schedule — and an outdoor run counts toward your daylight.",
      citation: exerciseIv?.citationId ? citationMap.get(exerciseIv.citationId) : undefined,
    });
  }

  // 3. FOOD & CAFFEINE — cutoff from the plan; dinner anchor when the plan
  // carries one, else 3h before the plan's bedtime.
  const cafIv = plan.interventions.find((iv) => iv.kind === "caffeine_cutoff");
  const mealIv = plan.interventions.find((iv) => iv.kind === "meal_timing");
  if (cafIv) {
    const cafMin = cafIv.startMin;
    const dinnerMin = mealIv ? mealIv.startMin : wrap(bedMin - 3 * 60);
    nudges.push({
      id: `${spec.label}-nutrition`,
      dayIndex,
      dayLabel: spec.label,
      category: "nutrition",
      kind: "caffeine_cutoff",
      title: isFlightDay
        ? "In-flight food and water"
        : `Last coffee ${fmtMin(cafMin)} · dinner by ${fmtMin(dinnerMin)}`,
      timeWindow: isFlightDay
        ? `Cutoff ${fmtMin(cafMin)} · hydrate through the flight`
        : `Last coffee ${fmtMin(cafMin)} · dinner by ${fmtMin(dinnerMin)}`,
      startMin: cafMin,
      endMin: isFlightDay ? bedMin : dinnerMin,
      durationLabel: "Food and caffeine",
      actionSummary: isFlightDay
        ? `Water on boarding, skip the alcohol, and eat to ${trip.destination.name}'s morning — not the cabin's.`
        : `Coffee's fine after your light; stop at ${fmtMin(cafMin)}. Finish dinner by ${fmtMin(dinnerMin)}.`,
      whyItHelps:
        "Late caffeine lingers for hours and late eating keeps the body switched on — both fight tonight's bedtime.",
      citation: cafIv.citationId ? citationMap.get(cafIv.citationId) : undefined,
    });
  }

  // 4. CALENDAR — the crew's committed moves first; otherwise a suggestion,
  // but only for a movable event that actually sits on a protected block,
  // moved to a slot that's free of events, protected interventions and the
  // compliance floor.
  const dayMoves = moves.filter((m) => m.from.dayIndex === dayIndex || m.to.dayIndex === dayIndex);
  const movableEvents = calendarEvents.filter((e) => e.dayIndex === dayIndex && e.movable);

  if (dayMoves.length > 0) {
    const firstMove = dayMoves[0];
    nudges.push({
      id: `${spec.label}-calendar`,
      dayIndex,
      dayLabel: spec.label,
      category: "calendar",
      title: `Move "${firstMove.title}" to protect the plan`,
      timeWindow: `${fmtMin(firstMove.from.startMin)} → ${fmtMin(firstMove.to.startMin)}`,
      startMin: firstMove.to.startMin,
      endMin:
        firstMove.to.endMin ??
        wrap(firstMove.to.startMin + (firstMove.from.endMin - firstMove.from.startMin)),
      durationLabel: `${dayMoves.length} calendar ${dayMoves.length === 1 ? "move" : "moves"}`,
      actionSummary: `${firstMove.reason} Fixed meetings stay untouched.`,
      whyItHelps:
        "Moves keep the calendar out of your light and wind-down windows so you never have to choose between work and sleep.",
      calendarMove: {
        eventTitle: firstMove.title,
        fromTime: fmtMin(firstMove.from.startMin),
        toTime: fmtMin(firstMove.to.startMin),
        movable: true,
      },
    });
  } else {
    const protectedIvs = plan.interventions
      .filter((iv) => PROTECTED_KINDS.has(iv.kind))
      .map(ivSpan);
    const suggestion = movableEvents
      .filter((ev) => protectedIvs.some((p) => ev.startMin < p.e && p.s < ev.endMin))
      .map((ev) => {
        const dur = ev.endMin - ev.startMin;
        for (let s = Math.max(floor, lightEnd ?? floor); s + dur <= 17 * 60; s += 15) {
          const evClash = calendarEvents.some(
            (o) => o.dayIndex === dayIndex && o.id !== ev.id && s < o.endMin && o.startMin < s + dur,
          );
          const ivClash = protectedIvs.some((p) => s < p.e && p.s < s + dur);
          if (!evClash && !ivClash) return { ev, start: s };
        }
        return null;
      })
      .find((s) => s !== null);
    if (suggestion) {
      const { ev, start } = suggestion;
      nudges.push({
        id: `${spec.label}-calendar`,
        dayIndex,
        dayLabel: spec.label,
        category: "calendar",
        title: `Move "${ev.title}" off a protected block`,
        timeWindow: `${fmtMin(ev.startMin)} → ${fmtMin(start)}`,
        startMin: start,
        endMin: wrap(start + (ev.endMin - ev.startMin)),
        durationLabel: "Suggested move",
        actionSummary: `"${ev.title}" sits on a protected block — ${fmtMin(start)} keeps it clear of light, wind-down and sleep.`,
        whyItHelps:
          "Moves keep the calendar out of your light and wind-down windows so you never have to choose between work and sleep.",
        calendarMove: {
          eventTitle: ev.title,
          fromTime: fmtMin(ev.startMin),
          toTime: fmtMin(start),
          movable: true,
        },
      });
    }
  }

  // 5. SLEEP — the plan's bedtime and wake, plus the wind-down start.
  const avoidIv = plan.interventions.find((iv) => iv.kind === "avoid_light");
  const windDownMin = avoidIv ? avoidIv.startMin : wrap(bedMin - 60);
  nudges.push({
    id: `${spec.label}-sleep`,
    dayIndex,
    dayLabel: spec.label,
    category: "sleep",
    kind: "avoid_light",
    title: isFlightDay
      ? `Cabin sleep ${fmtMin(bedMin)}–${fmtMin(wakeMin)}`
      : `Lights down ${fmtMin(windDownMin)} · bed ${fmtMin(bedMin)}`,
    timeWindow: `${fmtMin(bedMin)} – ${fmtMin(wakeMin)}`,
    startMin: bedMin,
    endMin: wakeMin,
    durationLabel: isFlightDay ? "Eye mask + earplugs" : "Target sleep window",
    actionSummary: isFlightDay
      ? `Mask and earplugs at ${fmtMin(windDownMin)}; sleep ${fmtMin(bedMin)}–${fmtMin(wakeMin)} — that's night in ${trip.destination.name}.`
      : `Overheads and screens off at ${fmtMin(windDownMin)}; lights out ${fmtMin(bedMin)}, up ${fmtMin(wakeMin)}.`,
    whyItHelps:
      plan.shiftMin === 0
        ? "Holds tonight's schedule so the shift stays banked."
        : `Moves tonight ${Math.abs(plan.shiftMin)}min toward ${trip.destination.name} time without a heroic bedtime.`,
    citation: undefined,
  });

  // Evidence chain: the day's actual scorer verdicts — shared by every nudge
  // from this day. Only attached when the crew really evaluated the day.
  const latest = verdicts?.at(-1);
  const dayEvidence = latest || memoryPath
    ? {
        ...(latest
          ? { evalVerdict: { score: latest.score, violations: latest.violations.map((v) => v.message) } }
          : {}),
        ...(dayRejected ? { draftRejected: true } : {}),
        ...(memoryPath ? { memoryPath } : {}),
      }
    : undefined;

  // Per-cue provenance: where this step sits relative to the solver's
  // draft. "solver" = the planner kept the slot; "planner" + movedMin = the
  // submission placed it elsewhere. Only computed when both plans carry
  // the same kind — an absent draft or a cue the draft never had stays
  // silent rather than claiming a comparison that isn't there.
  const placementOf = (n: (typeof nudges)[number]) => {
    if (!solverDraft || !n.kind) return {};
    const draftIv = solverDraft.interventions.find((iv) => iv.kind === n.kind);
    const planIv = plan.interventions.find((iv) => iv.kind === n.kind);
    if (!draftIv || !planIv) return {};
    return draftIv.startMin === planIv.startMin
      ? { placedBy: "solver" as const }
      : { placedBy: "planner" as const, movedMin: planIv.startMin - draftIv.startMin };
  };

  return nudges
    .map((n) => ({
      ...n,
      ...(dayEvidence
        ? {
            evidence: {
              ...dayEvidence,
              ...placementOf(n),
              ...(n.citation ? { citationId: n.citation.id } : {}),
            },
          }
        : {}),
    }))
    .sort((a, b) => a.startMin - b.startMin);
}

/**
 * Rough minutes of the day's scorer-verified shift that a given step
 * carries. Honest attribution only: the scorer validates shiftMin for the
 * whole day — light + sleep do the bulk of the work, the rest share the
 * remainder. Returns 0 on hold days; Dev 2's feed copy ("~20 min closer")
 * uses this so it never invents precision the model doesn't have.
 */
// --- Taste strip ---------------------------------------------------------------
// "Spend your daylight here": venues Qloo's taste graph ranks for the
// destination, shown on the arrival day so the plan feels personal. Notes
// only — never feeds the scorer or timing (same boundary as Otto's tool).
// Null when there is nothing worth naming: no key, no places, or the wrong
// day. The renderer shows nothing rather than a filler card.

export interface TastePlace {
  name: string;
  categories: string[];
}

export interface TasteStrip {
  destination: string;
  places: TastePlace[];
}

/** Shape the surface needs — duck-typed so it composes with the Qloo
 *  `destinationTaste()` rows without depending on the tools module. */
export interface TasteSource {
  destination?: string;
  places?: { name?: string; categories?: string[] }[] | null;
  note?: string;
}

/** Arrival day only, max five, named venues with at least a name. Anything
 *  else is null — the strip never renders filler. */
export function tasteStrip(
  source: TasteSource | null | undefined,
  dayIndex: number,
  departureDayIndex: number,
  destinationName: string,
  limit = 5,
): TasteStrip | null {
  if (!source || dayIndex <= departureDayIndex) return null;
  const places = (source.places ?? [])
    .filter((p): p is TastePlace => typeof p?.name === "string" && p.name.length > 0)
    .map((p) => ({ name: p.name, categories: (p.categories ?? []).filter(Boolean).slice(0, 3) }))
    .slice(0, limit);
  if (!places.length) return null;
  return { destination: source.destination || destinationName, places };
}

export function stepImpactMin(plan: DayPlan, category: NudgeCategory): number {
  const shift = Math.abs(plan.shiftMin);
  if (shift === 0) return 0;
  const has = (kind: string) => plan.interventions.some((iv) => iv.kind === kind);
  const W: [NudgeCategory, number][] = [
    ["sunlight", has("light_exposure") ? 0.5 : 0],
    ["sleep", has("sleep_window") ? 0.3 : 0],
    ["run", has("exercise") ? 0.1 : 0],
    ["nutrition", has("caffeine_cutoff") || has("meal_timing") ? 0.1 : 0],
    ["calendar", 0],
  ];
  const w = W.find(([c]) => c === category)?.[1] ?? 0;
  const total = W.reduce((s, [, x]) => s + x, 0);
  if (total === 0 || w === 0) return 0;
  return Math.round((shift * (w / total)) / 5) * 5;
}

/** Non-punitive, circadian-grounded adaptive guidance when a traveler misses or skips an intervention. */
export function recoveryTip(category: NudgeCategory, title?: string): string {
  const t = title?.toLowerCase() ?? "";
  const isAvoid = t.includes("avoid") || t.includes("dim") || t.includes("dark");
  const isCaffeine = t.includes("caffeine") || t.includes("coffee");
  if (category === "sunlight") {
    if (isAvoid) {
      return "Wear sunglasses outdoors and set device screens to minimum brightness with night shift active.";
    }
    return "Aim for 20m of natural outdoor daylight around midday, and keep evening lighting extra dim to compensate.";
  }
  if (category === "nutrition") {
    if (isCaffeine) {
      return "Cut off caffeine now, switch to water or herbal tea, and move target bedtime back 20–30m.";
    }
    return "Keep your next meal light and aligned with destination meal times.";
  }
  if (category === "sleep") {
    return "Protect your target wake time to anchor your circadian rhythm; limit any daytime naps to under 20m.";
  }
  if (category === "run") {
    return "Swap intense workouts for gentle stretching or a light walk to keep core body temperature calm.";
  }
  if (category === "calendar") {
    return "Protect at least 30m of quiet downtime before your next scheduled window.";
  }
  return "Stay well hydrated and align closely with your next planned window.";
}
