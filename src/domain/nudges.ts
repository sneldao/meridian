import { fmtMin } from "./circadian";
import type {
  CalendarEvent,
  CalendarMove,
  Citation,
  DayPlan,
  EvalResult,
  Trip,
  WearableBaseline,
} from "./types";

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
  title: string;
  timeWindow: string;
  startMin: number;
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
  badge: "Best for Zero Jet Lag" | "Good Alternative" | "Hardest on Body Clock";
  recommended: boolean;
  flightNumberExample: string;
  departsLocal: string;
  arrivesDest: string;
  cabinSleepWindow: string;
  landingReadinessPct: number;
  headline: string;
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
  const orig = trip.origin.code;
  const dest = trip.destination.code;

  if (east) {
    return [
      {
        id: "midday-afternoon",
        badge: "Best for Zero Jet Lag",
        recommended: true,
        flightNumberExample: `${orig} → ${dest} · Late Morning / Midday`,
        departsLocal: "11:20",
        arrivesDest: "07:50 (+1)",
        cabinSleepWindow: "Sleep hrs 2–7 of flight (13:00–18:00 body time)",
        landingReadinessPct: 92,
        headline: "Land in morning daylight & lock in your new clock on Day 1",
        whyChoose: `Going ${shiftHours}h east requires advancing your clock. A midday departure lets you dim the cabin early, sleep during ${trip.destination.name}'s night, and step straight into morning sunlight on arrival.`,
        firstNudgeOnLanding:
          "No sunglasses at arrival — get 30 min of outdoor daylight + an easy 20-min shakeout jog before 10:30 local.",
      },
      {
        id: "evening-redeye",
        badge: "Good Alternative",
        recommended: false,
        flightNumberExample: `${orig} → ${dest} · Evening Departure`,
        departsLocal: "19:15",
        arrivesDest: "15:45 (+1)",
        cabinSleepWindow: "Sleep first 6h immediately after takeoff",
        landingReadinessPct: 78,
        headline: "Easier to fall asleep on board, but lands near dusk",
        whyChoose:
          "Your body naturally wants to sleep at 20:30, so boarding tired feels easy—but landing late afternoon gives you only ~90 minutes of daylight before your first local night.",
        firstNudgeOnLanding:
          "Drop bags and get outside before 17:00 for last-hour daylight, then eat a light protein dinner at 19:00.",
      },
      {
        id: "early-morning",
        badge: "Hardest on Body Clock",
        recommended: false,
        flightNumberExample: `${orig} → ${dest} · Early Morning`,
        departsLocal: "06:30",
        arrivesDest: "02:50 (+1)",
        cabinSleepWindow: "Hard to sleep — cabin aligns with peak daytime alertness",
        landingReadinessPct: 54,
        headline: "4:00 AM airport wake-up builds sleep debt before you even board",
        whyChoose:
          "Waking at 04:00 exposes you to bright airport light during your circadian dead-zone (which pushes your clock the wrong way) and lands you tired with a full day still ahead.",
        firstNudgeOnLanding:
          "Wear dark glasses until 07:00 local, take a 20-min recovery nap max, then anchor with outdoor light at 08:30.",
      },
    ];
  }

  // Westward travel (e.g. LHR -> JFK / SFO)
  return [
    {
      id: "afternoon-west",
      badge: "Best for Zero Jet Lag",
      recommended: true,
      flightNumberExample: `${orig} → ${dest} · Afternoon Departure`,
      departsLocal: "14:30",
      arrivesDest: "17:40 (same day)",
      cabinSleepWindow: "Stay awake whole flight · 25m power nap only",
      landingReadinessPct: 95,
      headline: "Arrive for dinner, get evening light, and sleep straight through the night",
      whyChoose: `Going ${shiftHours}h west means delaying your clock. An afternoon flight lands you in ${trip.destination.name} early evening: your built-up sleep drive carries you to a 22:00 local bedtime without waking at 03:00.`,
      firstNudgeOnLanding:
        "Get 25 min of late-afternoon sunlight on arrival, eat dinner at 19:30 local, and hold bedtime until at least 21:45.",
    },
    {
      id: "morning-west",
      badge: "Good Alternative",
      recommended: false,
      flightNumberExample: `${orig} → ${dest} · Morning Departure`,
      departsLocal: "09:15",
      arrivesDest: "12:25 (same day)",
      cabinSleepWindow: "No cabin sleep — stay hydrated & active",
      landingReadinessPct: 80,
      headline: "Gives you a half-day at destination, but watch the 17:00 crash",
      whyChoose:
        "Good if you have an afternoon meeting, provided you use timed afternoon outdoor light and an easy run at 16:30 to push past your home bedtime.",
      firstNudgeOnLanding:
        "Last coffee at 13:30 local, then a 25-min outdoor run at 16:30 to keep melatonin suppressed until evening.",
    },
    {
      id: "late-night-west",
      badge: "Hardest on Body Clock",
      recommended: false,
      flightNumberExample: `${orig} → ${dest} · Late Evening`,
      departsLocal: "20:45",
      arrivesDest: "23:55 (same day)",
      cabinSleepWindow: "Avoid deep sleep — 45m nap max on board",
      landingReadinessPct: 62,
      headline: "Sleeping on the plane steals the sleep drive you need at your hotel",
      whyChoose:
        "Because you board near your home bedtime, it's tempting to sleep 5 hours on the plane—which guarantees you'll wake up wide awake at 03:30 AM in your hotel.",
      firstNudgeOnLanding:
        "Go straight to bed on arrival with a blackout mask, and avoid bright morning light before 08:30 local.",
    },
  ];
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
}): TravelerNudge[] {
  const { trip, dayIndex, plan, baseline, calendarEvents, moves, citations, verdicts, dayRejected, memoryPath } = params;
  const spec = trip.days[dayIndex] ?? { dayIndex, label: `Day ${dayIndex + 1}`, date: "" };
  const east = trip.direction === "east";
  const isFlightDay = dayIndex === trip.departureDayIndex;
  const isArrivalDay = dayIndex > trip.departureDayIndex;
  const citationMap = new Map(citations.map((c) => [c.id, c]));

  // Derive realistic wake & bed targets even before the crew stream finishes
  const stepMin = (east ? -65 : 65) * (dayIndex + 1);
  const baseWake = baseline?.avgWakeMin ?? 6 * 60 + 45;
  const baseBed = baseline?.avgBedtimeMin ?? 23 * 60 + 30;
  const wakeMin = plan ? plan.targetWakeMin : wrap(baseWake + stepMin);
  const bedMin = plan ? plan.targetBedtimeMin : wrap(baseBed + stepMin);

  const nudges: TravelerNudge[] = [];

  // 1. SUNLIGHT ON YOUR FACE NUDGE
  const lightIv = plan?.interventions.find((iv) => iv.kind === "light_exposure");
  const lightStart = lightIv ? lightIv.startMin : east ? wrap(wakeMin + 15) : wrap(bedMin - 180);
  const lightEnd = lightIv?.endMin ?? wrap(lightStart + 35);
  nudges.push({
    id: `${spec.label}-sunlight`,
    dayIndex,
    dayLabel: spec.label,
    category: "sunlight",
    title: isFlightDay
      ? `Cabin & Arrival Light Anchor (${fmtMin(lightStart)})`
      : east
        ? "Get Direct Morning Sunlight on Your Face"
        : "Get Late-Afternoon Outdoor Sunlight",
    timeWindow: `${fmtMin(lightStart)} – ${fmtMin(lightEnd)}`,
    startMin: lightStart,
    durationLabel: "30 min outdoors · no sunglasses",
    actionSummary: isFlightDay
      ? `Turn cabin overhead light on & open window shade at ${fmtMin(lightStart)} — signals dawn in ${trip.destination.name}.`
      : east
        ? `Step outside within 20 min of waking (${fmtMin(lightStart)}). Get 30 min of natural sky light on your eyes—even overcast sky is 10x stronger than indoor bulbs.`
        : `Step outside at ${fmtMin(lightStart)} for 30 min of late-day sun on your face to push your melatonin onset later tonight.`,
    whyItHelps: east
      ? `Morning blue-spectrum light hits melanopsin receptors at your peak phase-advance window, pulling your clock ~65–90 min toward ${trip.destination.name}.`
      : `Evening light delays your master clock so you don't wake up at 04:00 AM in ${trip.destination.name}.`,
    citation: lightIv?.citationId ? citationMap.get(lightIv.citationId) : undefined,
  });

  // 2. RUN & WORKOUT PLANNING NUDGE
  const exerciseIv = plan?.interventions.find((iv) => iv.kind === "exercise");
  const runStart = exerciseIv
    ? exerciseIv.startMin
    : isFlightDay
      ? wrap(lightStart - 90)
      : east
        ? wrap(wakeMin + 45)
        : wrap(bedMin - 240);
  const runEnd = exerciseIv?.endMin ?? wrap(runStart + 40);
  nudges.push({
    id: `${spec.label}-run`,
    dayIndex,
    dayLabel: spec.label,
    category: "run",
    title: isFlightDay
      ? "Pre-Boarding Mobility & Terminal Walk"
      : isArrivalDay
        ? `Arrival Shakeout Run in ${trip.destination.name} Daylight`
        : east
          ? "Easy Outdoor Morning Run (Zone 2)"
          : "Late-Afternoon Tempo / Progression Run",
    timeWindow: `${fmtMin(runStart)} – ${fmtMin(runEnd)}`,
    startMin: runStart,
    durationLabel: isFlightDay ? "20 min brisk walk" : "35–45 min run",
    actionSummary: isFlightDay
      ? "Skip heavy evening lifting today. Do a 20-min brisk walk + calf/hip openers before boarding to boost circulation and sleep pressure."
      : isArrivalDay
        ? `Keep pace conversational (Zone 2, 35 min) outdoors at ${fmtMin(runStart)}. Doubles your outdoor light dose and clears travel stiffness.`
        : east
          ? `Move your run out of the evening to ${fmtMin(runStart)}. Running outdoors in morning light accelerates your circadian advance by ~1.4x vs. light alone.`
          : `Schedule your run at ${fmtMin(runStart)}. Raising core body temperature late afternoon helps delay evening drowsiness.`,
    whyItHelps:
      "Skeletal muscle has its own peripheral circadian clock—timed aerobic movement plus outdoor daylight locks in your new timezone without spiking late-night cortisol.",
    citation: exerciseIv?.citationId ? citationMap.get(exerciseIv.citationId) : undefined,
  });

  // 3. EAT, HYDRATE & CAFFEINE CUTOFF NUDGE
  const cafIv = plan?.interventions.find((iv) => iv.kind === "caffeine_cutoff");
  const mealIv = plan?.interventions.find((iv) => iv.kind === "meal_timing");
  const cafMin = cafIv ? cafIv.startMin : wrap(bedMin - 8 * 60 - 15);
  const dinnerMin = mealIv ? mealIv.startMin : wrap(bedMin - 3 * 60);
  nudges.push({
    id: `${spec.label}-nutrition`,
    dayIndex,
    dayLabel: spec.label,
    category: "nutrition",
    title: isFlightDay
      ? "In-Flight Hydration & Destination Meal Anchor"
      : `Hard Caffeine Cutoff (${fmtMin(cafMin)}) & Meal Timing`,
    timeWindow: isFlightDay ? `Cutoff ${fmtMin(cafMin)} · Hydrate 500ml/3h` : `Last coffee ${fmtMin(cafMin)} · Last meal ${fmtMin(dinnerMin)}`,
    startMin: cafMin,
    durationLabel: "Nutrition & caffeine nudge",
    actionSummary: isFlightDay
      ? `Drink 500ml water with electrolytes on boarding, skip cabin alcohol, and decline the first meal if it falls during ${trip.destination.name} night—eat a protein-rich breakfast when cabin lights come up.`
      : `Enjoy coffee after your morning light window, then cut all caffeine at ${fmtMin(cafMin)} (8h before bed). Eat a protein-rich breakfast within 60 min of waking and finish a lighter dinner by ${fmtMin(dinnerMin)}.`,
    whyItHelps:
      "Caffeine has a 5–6 hour half-life that blocks adenosine and flattens nocturnal melatonin; finishing dinner 3 hours before bed lets core temperature drop for deep slow-wave sleep.",
    citation: cafIv?.citationId ? citationMap.get(cafIv.citationId) : undefined,
  });

  // 4. CALENDAR TWEAKS NUDGE (what to move on your calendar)
  const dayMoves = moves.filter((m) => m.from.dayIndex === dayIndex || m.to.dayIndex === dayIndex);
  const movableEvents = calendarEvents.filter((e) => e.dayIndex === dayIndex && e.movable);

  if (dayMoves.length > 0) {
    const firstMove = dayMoves[0];
    nudges.push({
      id: `${spec.label}-calendar`,
      dayIndex,
      dayLabel: spec.label,
      category: "calendar",
      title: `Move "${firstMove.title}" to Protect Your Rhythm`,
      timeWindow: `${fmtMin(firstMove.from.startMin)} → ${fmtMin(firstMove.to.startMin)}`,
      startMin: firstMove.to.startMin,
      durationLabel: `${dayMoves.length} calendar ${dayMoves.length === 1 ? "tweak" : "tweaks"}`,
      actionSummary: `${firstMove.reason} Fixed meetings stay untouched.`,
      whyItHelps:
        "Shifting flexible 1:1s, deep work, and gym blocks out of your light & wind-down windows means you never have to choose between work and feeling 100%.",
      calendarMove: {
        eventTitle: firstMove.title,
        fromTime: fmtMin(firstMove.from.startMin),
        toTime: fmtMin(firstMove.to.startMin),
        movable: true,
      },
    });
  } else if (movableEvents.length > 0) {
    const ev = movableEvents[0];
    const suggestedStart = east ? wrap(wakeMin + 180) : wrap(wakeMin + 240);
    nudges.push({
      id: `${spec.label}-calendar`,
      dayIndex,
      dayLabel: spec.label,
      category: "calendar",
      title: `Keep "${ev.title}" inside Peak Alertness`,
      timeWindow: `${fmtMin(ev.startMin)} → ${fmtMin(suggestedStart)}`,
      startMin: ev.startMin,
      durationLabel: "Smart calendar nudge",
      actionSummary: isArrivalDay
        ? `Your client pitch is during ${trip.destination.name} afternoon—your pre-flight shift puts your body in its peak alertness zone.`
        : `Nudge "${ev.title}" from ${fmtMin(ev.startMin)} to ${fmtMin(suggestedStart)} so your morning sunlight + run and evening wind-down stay completely clear.`,
      whyItHelps:
        "Aligning deep work and flexible meetings with your shifted alertness peak prevents cognitive drag while your clock moves.",
      calendarMove: {
        eventTitle: ev.title,
        fromTime: fmtMin(ev.startMin),
        toTime: fmtMin(suggestedStart),
        movable: true,
      },
    });
  }

  // 5. WIND-DOWN & TARGET SLEEP WINDOW NUDGE
  const avoidIv = plan?.interventions.find((iv) => iv.kind === "avoid_light");
  const windDownMin = avoidIv ? avoidIv.startMin : wrap(bedMin - 60);
  nudges.push({
    id: `${spec.label}-sleep`,
    dayIndex,
    dayLabel: spec.label,
    category: "sleep",
    title: isFlightDay
      ? `Cabin Sleep Window (${fmtMin(bedMin)} – ${fmtMin(wakeMin)})`
      : `Dim Lights at ${fmtMin(windDownMin)} · Sleep by ${fmtMin(bedMin)}`,
    timeWindow: `${fmtMin(bedMin)} – ${fmtMin(wakeMin)}`,
    startMin: bedMin,
    durationLabel: isFlightDay ? "Eye mask + earplugs" : "Target sleep window",
    actionSummary: isFlightDay
      ? `Put your eye mask on at ${fmtMin(windDownMin)} and sleep ${fmtMin(bedMin)}–${fmtMin(wakeMin)} so your brain experiences a true night synced to ${trip.destination.name}.`
      : `Turn off overhead lights and screens at ${fmtMin(windDownMin)}, cool bedroom to 18°C (65°F), and target lights-out at ${fmtMin(bedMin)} until ${fmtMin(wakeMin)}.`,
    whyItHelps: `Shifts your sleep midpoint by ${Math.abs(plan?.shiftMin ?? 65)} min today without triggering circadian whiplash or losing REM sleep.`,
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

  return nudges
    .map((n) => ({
      ...n,
      ...(dayEvidence
        ? { evidence: { ...dayEvidence, ...(n.citation ? { citationId: n.citation.id } : {}) } }
        : {}),
    }))
    .sort((a, b) => a.startMin - b.startMin);
}
