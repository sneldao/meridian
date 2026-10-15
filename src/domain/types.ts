// Domain types for Meridian.
// Shapes deliberately follow a longitudinal-care record model so the agent
// layer can port back into a larger health platform later
// (observation -> plan -> outcome loop).

export type CityCode = "LHR" | "HND" | "JFK" | "SFO" | "CDG" | "SIN";

export interface City {
  code: CityCode;
  name: string;
  /** UTC offset in minutes at the fixture date (DST ignored for the demo). */
  utcOffsetMin: number;
  lon: number; // for scene placement
  lat: number;
}

export interface Trip {
  origin: City;
  destination: City;
  /** Signed minutes the body clock must shift (destination - origin). */
  requiredShiftMin: number;
  departureDayIndex: number; // index into DayPlan.dayIndex where travel occurs
  direction: "east" | "west";
  days: DaySpec[];
}

export interface DaySpec {
  dayIndex: number; // 0 = first plan day
  label: string; // "D-3" | "D-2" | "D-1" | "Flight" | "D+1"
  date: string; // ISO date
}

export type InterventionKind =
  | "light_exposure"
  | "avoid_light"
  | "sleep_window"
  | "caffeine_cutoff"
  | "melatonin"
  | "exercise"
  | "meal_timing"
  | "nap";

export interface Intervention {
  kind: InterventionKind;
  /** Minutes since local midnight for time-bound interventions. */
  startMin: number;
  endMin?: number;
  note: string;
  /** Paper backing this intervention, if the researcher supplied one. */
  citationId?: string;
}

export interface DayPlan {
  dayIndex: number;
  label: string;
  /** Signed minutes of phase shift planned for this day. */
  shiftMin: number;
  targetBedtimeMin: number;
  targetWakeMin: number;
  interventions: Intervention[];
}

export interface ShiftPlan {
  tripSummary: string;
  days: DayPlan[];
  rationale: string;
}

export interface Citation {
  id: string; // W-number or local id
  title: string;
  year?: number;
  venue?: string;
  doi?: string;
  url: string;
  /** Where this citation came from. */
  source?: "live" | "verified-fallback";
}

export interface EvalViolation {
  code:
    | "SHIFT_TOO_FAST"
    | "SHIFT_DIRECTION_FLIP"
    | "CAFFEINE_TOO_LATE"
    | "LIGHT_WRONG_WINDOW"
    | "SLEEP_TOO_SHORT"
    | "CALENDAR_CONFLICT"
    | "ADHERENCE_RISK"
    | "MISSING_LIGHT_ANCHOR"
    | "DOSE_PRESCRIPTION"
    | "UNSAFE_CLAIM";
  message: string;
  dayIndex?: number;
}

export interface EvalResult {
  feasible: boolean;
  /** 0..1 — adherence-weighted quality. Gate is feasibility && score >= PASS_SCORE. */
  score: number;
  violations: EvalViolation[];
  notes: string[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  dayIndex: number;
  startMin: number;
  endMin: number;
  movable: boolean;
  /** Fixed events normally wall off interventions; set false for contextual
   * events (the flight itself) that interventions are meant to happen inside. */
  blocksInterventions?: boolean;
  /** Set by the negotiator when the event is relocated. */
  movedTo?: { dayIndex: number; startMin: number; endMin: number };
}

export interface CalendarMove {
  eventId: string;
  title: string;
  from: { dayIndex: number; startMin: number; endMin: number };
  to: { dayIndex: number; startMin: number; endMin: number };
  reason: string;
}

export interface WearableBaseline {
  wearer: string;
  source: string;
  avgBedtimeMin: number;
  avgWakeMin: number;
  avgSleepMin: number;
  hrvMs: number;
  hrvTrend: "rising" | "stable" | "falling";
  restingHr: number;
  chronotype: "early" | "neutral" | "late";
  nights: { date: string; bedtimeMin: number; wakeMin: number; sleepMin: number; hrvMs: number }[];
}

export interface AdherenceProfile {
  /** History-derived compliance hints used by the scorer. */
  ignoresInterventionsBeforeMin: number; // asks before this time get ignored
  strongAt: string[]; // e.g. ["evening actions", "calendar-driven"]
  weakAt: string[]; // e.g. ["early alarms", "self-directed naps"]
}

// --- Crew event stream (SSE payload union) ----------------------------------

export type AgentId = "analyst" | "researcher" | "planner" | "evaluator" | "negotiator";

export type CrewEvent =
  | { type: "run_start"; provider: string; trip: Trip; baseline: WearableBaseline; calendar: CalendarEvent[] }
  | { type: "agent_start"; agent: AgentId; title: string }
  | { type: "agent_token"; agent: AgentId; text: string }
  | { type: "agent_end"; agent: AgentId }
  | { type: "tool_call"; agent: AgentId; tool: string; detail: string }
  | { type: "tool_result"; agent: AgentId; tool: string; detail: string }
  | { type: "citation"; agent: AgentId; citation: Citation }
  | { type: "plan_candidate"; day: DayPlan }
  | { type: "eval_result"; result: EvalResult; attempt: number }
  | { type: "day_locked"; day: DayPlan; sunProgress: number }
  | { type: "calendar_move"; move: CalendarMove }
  | {
      type: "briefing";
      summary: string;
      ics: string;
      score: number;
      citations: Citation[];
      days: DayPlan[];
    }
  | { type: "error"; message: string; recoverable: boolean }
  | { type: "check_in"; checkIn: CheckIn }
  | { type: "replan"; droppedDays: number[]; reason: string }
  | { type: "done" };

export const PASS_SCORE = 0.75;

// --- Check-ins: what the wearer actually did --------------------------------
// The adherence loop. A night shift produces a plan; a morning shift ingests
// what really happened and replans the days that remain. Statuses mirror a
// mission lifecycle: accepted -> done, or pushed back (easier/later/skipped).

export type CheckInStatus = "done" | "partial" | "skipped" | "harder" | "easier";

export interface CheckIn {
  id: string;
  dayIndex: number;
  /** Which intervention this refers to (kind + optional startMin), or null for
   * a free-text check-in about the whole day. */
  kind?: InterventionKind;
  startMin?: number;
  status: CheckInStatus;
  /** Free text as spoken by the wearer ("couldn't face 5am light"). */
  text?: string;
  at: number; // epoch ms
}

/** POST body for /api/crew/checkin — free text or structured. */
export interface CheckInRequest {
  text?: string;
  dayIndex?: number;
  kind?: InterventionKind;
  status?: CheckInStatus;
}

/** Persisted cross-run memory: what the wearer did vs. what was planned. */
export interface CrewMemory {
  runs: {
    at: number;
    tripLabel: string;
    lockedDays: number;
    meanScore: number;
  }[];
  checkIns: CheckIn[];
  /** Learned adherence hints derived from check-in history. */
  learned: {
    earliestDoneMin?: number;
    skippedKinds: InterventionKind[];
    notes: string[];
  };
}
