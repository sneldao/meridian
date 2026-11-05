import {
  coverageOf,
  effectiveCalendar,
  evaluatePlan,
  fmtMin,
} from "./circadian";
import { buildTrip } from "./fixtures";
import { insightFlagCount } from "./insights";
import { previewPlan } from "./solver";
import type {
  AdherenceProfile,
  AgentId,
  CalendarEvent,
  DayPlan,
  DaySpec,
  Intervention,
  InterventionKind,
  Trip,
} from "./types";

/* The addressability layer's deterministic lane (docs/plan/agent-native.md
 * §4a): `crewAnswer` turns a typed question into one specialist's answer,
 * composed from the same state the feed already shows — the solver's plan
 * set, coverage math, the gate's scan, the roster's real counts. Nothing is
 * templated and nothing is invented: every number comes out of previewPlan,
 * coverageOf or evaluatePlan, and an intent the parser can't resolve gets
 * one honest fallback rather than a guessed answer. No LLM lives here —
 * open questions are the secondary lane's job, not this module's.
 *
 * The surfaces package what they already compute as `CrewFacts` (the same
 * set insights.ts consumes, plus the attached context — the nudge a bare
 * "why" was opened on, the job row an "Ask {owner}" sits inside). */

export interface CrewAnswerContext {
  /** What "it" refers to, named — "the 07:00 Seek light step". */
  about: string;
  /** The surface's own explanation, quoted — the nudge's whyItHelps, the
   *  job row's first step. */
  detail: string;
  owner: string;
  agent: AgentId | null;
  /** Where the detail came from, when the surface can name it. */
  provenance?: string;
}

export interface CrewAnswer {
  owner: string;
  /** The avatar id behind the name; Scout is a tool, not a person — null. */
  agent: AgentId | null;
  /** The one-line answer, composed from real state. */
  answer: string;
  /** Optional supporting lines — the window's own note, the delta math. */
  detail?: string[];
  /** Which signal computed this — quoted in the UI like the chips. */
  provenance: string;
}

export interface CrewFacts {
  trip: Trip | null;
  /** Minutes still owed at landing — the feed's dawnOwedMin. */
  owedMin: number;
  /** The best plan set the surface has: locked days first, else the
   *  solver's preview — the same set the hero and scene read. */
  plans: readonly DayPlan[];
  plansArePreview: boolean;
  /** The day the surface is showing — "why 07:00" scopes to it first. */
  activeDaySpec?: DaySpec | null;
  calendar: readonly CalendarEvent[];
  adherence: AdherenceProfile;
  baseline?: { avgBedtimeMin: number; avgWakeMin: number };
  /** What a bare "why" points at — the card the ask is attached to. */
  context?: CrewAnswerContext | null;
  /** The trip's marked event, when one exists. */
  moment?: {
    title: string;
    localMin: number;
    bodyMin: number;
    dayLabel: string;
  } | null;
  /** Roster facts behind each "who" answer — real counts only. */
  baselineFacts?: {
    chronotype: string;
    bedMin: number;
    wakeMin: number;
    sleepMin?: number;
  } | null;
  places?: { matched: number; provenance: string } | null;
  citations?: number;
  moves?: number;
}

const FALLBACK =
  "Ask me about timing — try 'why is light at 07:00?' or 'what if I land a day later?'";

const hourLabel = (min: number) =>
  (Math.abs(min) / 60).toFixed(1).replace(/\.0$/, "");

const wrap = (m: number) => ((m % 1440) + 1440) % 1440;

const ivEnd = (iv: Intervention) => {
  const end = iv.endMin ?? iv.startMin + 30;
  return end <= iv.startMin ? end + 1440 : end;
};

const KIND_NAME: Record<InterventionKind, string> = {
  light_exposure: "seek-light window",
  avoid_light: "wind-down",
  sleep_window: "sleep window",
  caffeine_cutoff: "caffeine cutoff",
  melatonin: "melatonin cue",
  exercise: "exercise block",
  meal_timing: "meal window",
  nap: "nap",
};

const KIND_WORDS: [RegExp, InterventionKind][] = [
  [/seek|bright|sun|outside|light(?!s low)/, "light_exposure"],
  [/wind.?down|dim|dark|shade|glasses|avoid/, "avoid_light"],
  [/sleep|bed|wake|rest/, "sleep_window"],
  [/caffeine|coffee|curfew|cut ?off/, "caffeine_cutoff"],
  [/melatonin/, "melatonin"],
  [/exercise|run|gym|workout/, "exercise"],
  [/meal|food|eat|dinner|lunch|breakfast/, "meal_timing"],
  [/nap/, "nap"],
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const planProv = (facts: CrewFacts) =>
  facts.plansArePreview ? "solver preview" : "solver · locked days";

function noTrip(): CrewAnswer {
  return {
    owner: "Otto",
    agent: "planner",
    answer:
      "No trip on the table yet — make a plan and the crew can answer for it.",
    provenance: "intent parser",
  };
}

function fallback(): CrewAnswer {
  return {
    owner: "Otto",
    agent: "planner",
    answer: FALLBACK,
    provenance: "intent parser · no solver run",
  };
}

// --- the why/when window lookup ---------------------------------------------

function parseTime(rest: string): number | null {
  const m = rest.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mins = m[2] ? parseInt(m[2], 10) : 0;
  const mer = m[3]?.replace(/[\s.]/g, "").toLowerCase();
  if (h > 24 || mins > 59) return null;
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  // A bare hour with no meridian reads as clock time — 21 is 21:00.
  return h * 60 + mins;
}

function kindMentioned(rest: string): InterventionKind | null {
  for (const [re, kind] of KIND_WORDS) if (re.test(rest)) return kind;
  return null;
}

function windowRole(
  iv: Intervention,
  day: DayPlan,
): { title: string; role: string } {
  const s = fmtMin(iv.startMin);
  const e = fmtMin(ivEnd(iv) % 1440);
  const title =
    iv.endMin == null
      ? `${cap(KIND_NAME[iv.kind])} at ${s}`
      : `${cap(KIND_NAME[iv.kind])} ${s}–${e}`;
  switch (iv.kind) {
    case "light_exposure": {
      const next = day.interventions.find(
        (x) => x.kind === "avoid_light" && x.startMin > iv.startMin,
      );
      return {
        title,
        role: next
          ? `the last light window before the ${fmtMin(next.startMin)} wind-down`
          : "the day's light anchor",
      };
    }
    case "avoid_light":
      return {
        title,
        role: `the wind-down into the ${fmtMin(day.targetBedtimeMin)} bedtime`,
      };
    case "sleep_window":
      return {
        title,
        role: `the night's sleep target — bed ${s}, up ${e}`,
      };
    case "caffeine_cutoff":
      return {
        title,
        role: `${hourLabel(wrap(day.targetBedtimeMin - iv.startMin))}h of clear runway before the ${fmtMin(day.targetBedtimeMin)} bedtime`,
      };
    case "melatonin":
      return {
        title,
        role: `timed ahead of the ${fmtMin(day.targetBedtimeMin)} bedtime`,
      };
    case "exercise":
      return { title, role: "a support cue for the day's shift" };
    default:
      return { title, role: "part of the day's shift plan" };
  }
}

function windowAnswer(
  iv: Intervention,
  day: DayPlan,
  facts: CrewFacts,
): CrewAnswer {
  const trip = facts.trip!;
  const { title, role } = windowRole(iv, day);
  const gap = hourLabel(trip.requiredShiftMin);
  const dir = trip.direction === "east" ? "eastward" : "westward";
  return {
    owner: "Otto",
    agent: "planner",
    answer: `${title} on ${day.label} — ${role}, set against the ${gap}h ${dir} shift.`,
    detail: [
      iv.note,
      `${day.label} banks ${Math.abs(day.shiftMin)}min of the ${gap}h move${
        facts.plansArePreview ? " — the solver's preview" : " — locked"
      }`,
    ],
    provenance: planProv(facts),
  };
}

/** The window a time question lands on. Containment beats kind: "why is
 *  light at 21:40" is the wind-down question, not the light block's. The
 *  active day is searched first, then every other planned day in order. */
function findWindow(
  facts: CrewFacts,
  t: number | null,
  kind: InterventionKind | null,
): { iv: Intervention; day: DayPlan } | null {
  const activeIdx = facts.activeDaySpec?.dayIndex;
  const ordered = [
    ...facts.plans.filter((d) => d.dayIndex === activeIdx),
    ...facts.plans.filter((d) => d.dayIndex !== activeIdx),
  ];
  for (const day of ordered) {
    let hit: Intervention | undefined;
    if (t !== null) {
      hit = day.interventions.find((iv) => {
        const end = ivEnd(iv);
        return (
          (iv.startMin <= t && t < end) ||
          (end > 1440 && t + 1440 >= iv.startMin && t + 1440 < end) ||
          Math.abs(iv.startMin - t) <= 15
        );
      });
      if (!hit && kind) hit = day.interventions.find((iv) => iv.kind === kind);
    } else if (kind) {
      hit = day.interventions.find((iv) => iv.kind === kind);
    }
    if (hit) return { iv: hit, day };
  }
  return null;
}

/** The nearest window to `t` on the active day (or across the plan set) —
 *  the honest "nothing sits there" half of the answer. */
function nearestWindow(
  facts: CrewFacts,
  t: number,
): { iv: Intervention; day: DayPlan } | null {
  const active = facts.plans.find(
    (d) => d.dayIndex === facts.activeDaySpec?.dayIndex,
  );
  const days = active ? [active] : facts.plans;
  let best: { iv: Intervention; day: DayPlan; dist: number } | null = null;
  for (const day of days) {
    for (const iv of day.interventions) {
      const d = Math.min(
        Math.abs(iv.startMin - t),
        1440 - Math.abs(iv.startMin - t),
      );
      if (!best || d < best.dist) best = { iv, day, dist: d };
    }
  }
  return best;
}

function timeAnswer(
  facts: CrewFacts,
  rest: string,
  t: number,
): CrewAnswer {
  const dayLabel =
    facts.plans.find((d) => d.dayIndex === facts.activeDaySpec?.dayIndex)
      ?.label ??
    facts.activeDaySpec?.label ??
    facts.plans[0]?.label ??
    "the day";
  const hit = findWindow(facts, t, kindMentioned(rest));
  if (hit) return windowAnswer(hit.iv, hit.day, facts);
  if (facts.plans.length === 0) {
    return {
      owner: "Otto",
      agent: "planner",
      answer: `Nothing's planned for ${dayLabel} yet — make the plan and the windows land here.`,
      provenance: "intent parser",
    };
  }
  const near = nearestWindow(facts, t);
  return {
    owner: "Otto",
    agent: "planner",
    answer: `Nothing sits at ${fmtMin(t)} on ${dayLabel}${
      near
        ? ` — the nearest window is the ${KIND_NAME[near.iv.kind]} at ${fmtMin(near.iv.startMin)}`
        : ""
    }.`,
    provenance: planProv(facts),
  };
}

// --- what-if ------------------------------------------------------------------

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const dayFmt = new Intl.DateTimeFormat("en", {
  weekday: "long",
  timeZone: "UTC",
});
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const numWord = (w: string) =>
  ({ a: 1, an: 1, one: 1, two: 2, three: 3 })[w] ?? parseInt(w, 10);

/** The departure shift a "land later/earlier/on X" asks for — bounded to a
 *  couple of days each way so the re-run stays a real plan, not a new trip. */
function parseLandDelta(q: string, flightIso: string): number | null {
  const rel = q.match(/(\d+|a|an|one|two|three)\s+days?\s+(later|earlier)/);
  if (rel) {
    const n = numWord(rel[1]);
    if (!Number.isFinite(n)) return null;
    return rel[2] === "later" ? Math.min(2, n) : -Math.min(2, n);
  }
  if (/\bday later\b/.test(q)) return 1;
  if (/\bday earlier\b/.test(q)) return -1;
  const wd = q.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/,
  );
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[1]);
    const flightWd = new Date(`${flightIso}T00:00:00Z`).getUTCDay();
    let d = target - flightWd;
    if (d > 3) d -= 7;
    if (d < -3) d += 7;
    return Math.max(-2, Math.min(2, d));
  }
  if (/\blater\b/.test(q)) return 1;
  if (/\bearlier\b/.test(q)) return -1;
  return null;
}

function whatIfLand(delta: number, facts: CrewFacts): CrewAnswer {
  const trip = facts.trip!;
  const dep = trip.departureDayIndex;
  const post = trip.days.length - 1 - dep;
  const flightIso = trip.days[dep].date;
  const weekday = dayFmt.format(
    new Date(`${addDays(flightIso, delta)}T00:00:00Z`),
  );

  if (delta === 0) {
    return {
      owner: "Otto",
      agent: "planner",
      answer: `That's the flight you have — ${weekday} already is the plan's departure.`,
      provenance: "route",
    };
  }
  if (dep + delta < 1) {
    return {
      owner: "Otto",
      agent: "planner",
      answer:
        "Can't land earlier — the flight day already opens this plan, with no prep day left to give up.",
      provenance: "route",
    };
  }

  // Rebuild the trip with the departure moved: a later flight means one more
  // prep day at home (pre+delta), an earlier one spends it. Calendar events
  // stay attached to their labelled day — that's the only anchor they have.
  const newTrip = buildTrip(
    trip.origin.code,
    trip.destination.code,
    addDays(flightIso, delta),
    { preFlightDays: dep + delta, postFlightDays: post },
  );
  const idxByLabel = new Map(newTrip.days.map((d) => [d.label, d.dayIndex]));
  const newCalendar = facts.calendar.flatMap((e) => {
    const label = trip.days[e.dayIndex]?.label;
    const idx = label !== undefined ? idxByLabel.get(label) : undefined;
    return idx === undefined ? [] : [{ ...e, dayIndex: idx }];
  });
  const solved = previewPlan({
    trip: newTrip,
    calendar: newCalendar,
    adherence: facts.adherence,
    baseline: facts.baseline,
  });
  const newPlans = [...solved.values()].flatMap((s) => (s ? [s.plan] : []));
  const oldCov = coverageOf(trip, [...facts.plans]);
  const newCov = coverageOf(newTrip, newPlans);

  const diff = newCov.residualMin - oldCov.residualMin;
  const direction =
    diff === 0 ? "about the same" : `${hourLabel(diff)}h ${diff < 0 ? "better" : "worse"}`;
  const desc =
    Math.abs(delta) === 1
      ? `a day ${delta > 0 ? "later" : "earlier"}`
      : `${Math.abs(delta)} days ${delta > 0 ? "later" : "earlier"}`;
  return {
    owner: "Otto",
    agent: "planner",
    answer: `Landing ${desc} (${weekday}) — arrival lands ${direction}, ${newCov.daysTotal} days to cover it.`,
    detail: [
      `${hourLabel(oldCov.residualMin)}h owed on arrival now → ${hourLabel(newCov.residualMin)}h with ${dep + delta} prep ${dep + delta === 1 ? "day" : "days"}`,
      `${hourLabel(newCov.achievedMin)}h of the ${hourLabel(newCov.requiredMin)}h shift banked on the re-run`,
    ],
    provenance: "previewPlan re-run · coverageOf",
  };
}

function whatIfSkip(spec: DaySpec, facts: CrewFacts): CrewAnswer {
  const trip = facts.trip!;
  const day = facts.plans.find((d) => d.dayIndex === spec.dayIndex);
  if (!day) {
    return {
      owner: "Otto",
      agent: "planner",
      answer: `There's no plan on ${spec.label} to skip — that day gets planned later.`,
      provenance: planProv(facts),
    };
  }
  const minus = facts.plans.map((d) =>
    d.dayIndex === spec.dayIndex
      ? { ...d, shiftMin: 0, interventions: [] }
      : d,
  );
  // The gate's own read on the thinned plan — the residual and any new flag
  // it names are the real consequence, not a paraphrase.
  const verdict = evaluatePlan({
    trip,
    days: [...minus],
    calendar: effectiveCalendar([...facts.calendar]),
    adherence: facts.adherence,
    baseline: facts.baseline,
  });
  const oldCov = coverageOf(trip, [...facts.plans]);
  const cov = verdict.coverage;
  if (Math.abs(day.shiftMin) === 0 || cov.residualMin === oldCov.residualMin) {
    return {
      owner: "Otto",
      agent: "planner",
      answer: `Skipping ${spec.label} changes nothing — it banks no shift, so the ${hourLabel(oldCov.residualMin)}h residual stays.`,
      provenance: "evaluatePlan · coverageOf",
    };
  }
  return {
    owner: "Otto",
    agent: "planner",
    answer: `${spec.label} un-covered — residual goes to ${hourLabel(cov.residualMin)}h.`,
    detail: [
      `the day's ${Math.abs(day.shiftMin)}min shift is unbanked — ${hourLabel(cov.achievedMin)}h of ${hourLabel(cov.requiredMin)}h still covered`,
      ...verdict.violations.slice(0, 1).map((v) => `Iris would flag: ${v.message}`),
    ],
    provenance: "evaluatePlan · coverageOf",
  };
}

// --- who / routing ------------------------------------------------------------

function irisAnswer(facts: CrewFacts): CrewAnswer {
  if (facts.plans.length === 0) {
    return {
      owner: "Iris",
      agent: "evaluator",
      answer:
        "Iris watches for conflicts — nothing to grade yet, so the calendar is clear by default.",
      provenance: "evaluatePlan",
    };
  }
  const verdict = evaluatePlan({
    trip: facts.trip!,
    days: [...facts.plans],
    calendar: effectiveCalendar([...facts.calendar]),
    adherence: facts.adherence,
    baseline: facts.baseline,
  });
  const flags = insightFlagCount(verdict);
  return {
    owner: "Iris",
    agent: "evaluator",
    answer: `Iris watches for conflicts — she scanned ${facts.plans.length} ${facts.plans.length === 1 ? "day" : "days"}: ${
      flags === 0 ? "nothing flagged" : `${flags} flag${flags === 1 ? "" : "s"}`
    }.`,
    detail: verdict.violations.slice(0, 1).map((v) => v.message),
    provenance: "evaluatePlan",
  };
}

function scoutAnswer(facts: CrewFacts): CrewAnswer {
  const p = facts.places;
  return {
    owner: "Scout",
    agent: null,
    answer: p
      ? `Scout matches places to your crate — ${p.matched === 0 ? "none matched yet" : `${p.matched} ${p.matched === 1 ? "place" : "places"} matched`} — ${p.provenance}.`
      : "Scout matches places to your crate — no crate packed, so there's nothing to match.",
    provenance: p?.provenance ?? "crate",
  };
}

function maraAnswer(facts: CrewFacts): CrewAnswer {
  const b = facts.baselineFacts;
  return {
    owner: "Mara",
    agent: "analyst",
    answer: b
      ? `Mara reads the baseline — yours says ${b.chronotype} · bed ${fmtMin(b.bedMin)} · wake ${fmtMin(b.wakeMin)}.`
      : "Mara reads the baseline — there's none on file yet.",
    provenance: "wearable baseline",
  };
}

function rexAnswer(facts: CrewFacts): CrewAnswer {
  const movable = facts.calendar.filter((e) => e.movable).length;
  const fixed = facts.calendar.length - movable;
  const moved = facts.moves ?? 0;
  const moment = facts.moment;
  return {
    owner: "Rex",
    agent: "negotiator",
    answer: `Rex makes the calendar fit — ${
      moved > 0
        ? `${moved} ${moved === 1 ? "event" : "events"} moved`
        : `${movable} movable, ${fixed} fixed on file`
    }${moment ? ` — "${moment.title}" lands ${fmtMin(moment.localMin)} local, ${fmtMin(moment.bodyMin)} estimated body` : ""}.`,
    provenance: "calendar",
  };
}

function junAnswer(facts: CrewFacts): CrewAnswer {
  const n = facts.citations ?? 0;
  return {
    owner: "Jun",
    agent: "researcher",
    answer: `Jun pulls the science — ${
      n > 0
        ? `${n} ${n === 1 ? "paper" : "papers"} kept for this plan`
        : "no papers on file yet; he works inside a crew run"
    }.`,
    provenance: "citation set",
  };
}

function ottoAnswer(facts: CrewFacts): CrewAnswer {
  const trip = facts.trip!;
  const cov = coverageOf(trip, [...facts.plans]);
  return {
    owner: "Otto",
    agent: "planner",
    answer: `Otto builds the shift plan — ${hourLabel(cov.achievedMin)}h of the ${hourLabel(cov.requiredMin)}h move scheduled across ${cov.daysPlanned} ${cov.daysPlanned === 1 ? "day" : "days"}${facts.plansArePreview ? " on the solver's preview" : ""}.`,
    provenance: `coverageOf · ${facts.plansArePreview ? "previewPlan" : "locked days"}`,
  };
}

const OWNER_ROUTES: [RegExp, (f: CrewFacts) => CrewAnswer][] = [
  [/\b(scout|place|places|crate|restaurant|venue|gallery|museum|café|cafe|bar|spot)\b/, scoutAnswer],
  [/\b(iris|conflict|clash|collision|overlap|flag|violation|watch|grade|verdict)\b/, irisAnswer],
  [/\b(mara|baseline|chronotype|wearable|hrv|sleep pattern|physio)\b/, maraAnswer],
  [/\b(rex|calendar|meeting|event|move|negotiat)/, rexAnswer],
  [/\b(jun|science|research|paper|stud|evidence|citation)\b/, junAnswer],
  [/\b(otto|plan|timing|light|window|shift|schedule|jet ?lag)\b/, ottoAnswer],
];

function route(q: string, facts: CrewFacts): CrewAnswer | null {
  for (const [re, fn] of OWNER_ROUTES) if (re.test(q)) return fn(facts);
  return null;
}

// --- entry point ----------------------------------------------------------------

export function crewAnswer(question: string, facts: CrewFacts): CrewAnswer {
  const q = question.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return fallback();

  // A trip-less surface can still answer for its attached context.
  if (!facts.trip) {
    if (/^why\b/.test(q) && facts.context) {
      const c = facts.context;
      return {
        owner: c.owner,
        agent: c.agent,
        answer: `${c.about} — ${c.detail}`,
        provenance: c.provenance ?? "the card it sits on",
      };
    }
    return noTrip();
  }
  const trip = facts.trip;

  // --- what if -----------------------------------------------------------
  if (/^what\b/.test(q)) {
    const flightIso = trip.days[trip.departureDayIndex].date;
    if (/\b(land|lands|landing|depart|departs|departing|leave|leaves|fly|flies|arrive|arrives)\b/.test(q)) {
      const delta = parseLandDelta(q, flightIso);
      if (delta !== null) return whatIfLand(delta, facts);
    }
    const skip = q.match(
      /\bskip(?:ping)?\s+(?:the\s+|on\s+|day\s+)?([a-z0-9+\-]+)/,
    );
    if (skip) {
      const tok = skip[1];
      let spec: DaySpec | undefined;
      if (tok === "flight") spec = trip.days.find((d) => d.label === "Flight");
      else if (tok === "today") spec = facts.activeDaySpec ?? undefined;
      else if (/^d[-+]\d+$/.test(tok))
        spec = trip.days.find((d) => d.label.toLowerCase() === tok);
      else if (/^\d+$/.test(tok))
        spec = trip.days.find((d) => d.dayIndex === parseInt(tok, 10));
      else if (WEEKDAYS.includes(tok)) {
        const wd = WEEKDAYS.indexOf(tok);
        spec = trip.days.find(
          (d) => new Date(`${d.date}T00:00:00Z`).getUTCDay() === wd,
        );
      }
      if (spec) return whatIfSkip(spec, facts);
      return fallback();
    }
    return fallback();
  }

  // --- who ----------------------------------------------------------------
  if (/^(who|whos|who's)\b/.test(q)) {
    return route(q, facts) ?? irisAnswer(facts);
  }

  // --- why -----------------------------------------------------------------
  if (/^why\b/.test(q)) {
    const rest = q.replace(/^why\s*/, "");
    if (!rest || /^(this|it|that|is (this|it|that)|'s it)\??$/.test(rest)) {
      const c = facts.context;
      if (c) {
        return {
          owner: c.owner,
          agent: c.agent,
          answer: `${c.about} — ${c.detail}`,
          provenance: c.provenance ?? "the card it sits on",
        };
      }
      return fallback();
    }
    const t = parseTime(rest);
    if (t !== null) return timeAnswer(facts, rest, t);
    const kind = kindMentioned(rest);
    if (kind) {
      const hit = findWindow(facts, null, kind);
      if (hit) return windowAnswer(hit.iv, hit.day, facts);
    }
    const routed = route(rest, facts);
    if (routed) return routed;
    if (facts.context) {
      const c = facts.context;
      return {
        owner: c.owner,
        agent: c.agent,
        answer: `${c.about} — ${c.detail}`,
        provenance: c.provenance ?? "the card it sits on",
      };
    }
    return fallback();
  }

  // --- when ------------------------------------------------------------------
  if (/^when\b/.test(q)) {
    const rest = q.replace(/^when\s*/, "");
    const kind = kindMentioned(rest);
    if (kind) {
      const hit = findWindow(facts, null, kind);
      if (hit) return windowAnswer(hit.iv, hit.day, facts);
      return {
        owner: "Otto",
        agent: "planner",
        answer: `No ${KIND_NAME[kind]} sits in the plan yet.`,
        provenance: planProv(facts),
      };
    }
    return fallback();
  }

  // --- keyword routing — "any conflicts?" still lands on Iris ---------------
  const routed = route(q, facts);
  if (routed) return routed;
  return fallback();
}
