/** The journey as five measurable stages: entry → run → handoff → arrival →
 *  outcome. Every stage records once per trip into a localStorage ring and
 *  fire-and-forgets to `/api/funnel`, which persists to Supabase when
 *  configured. Instrumentation is a metric, never a dependency: nothing here
 *  may block, throw into, or re-render the UI. */

export const FUNNEL_STAGES = [
  "entry",
  "run",
  "handoff",
  "arrival",
  "outcome",
] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export interface FunnelEvent {
  stage: FunnelStage;
  /** `ORIGIN-DEST-DATE` — the same key shape the share feature uses. */
  trip: string | null;
  at: string; // ISO timestamp
}

export const FUNNEL_KEY = "meridian:funnel";
/** Ring cap — enough for forty journeys, small enough to stay trivial. */
const CAP = 200;

export function funnelKey(origin: string, dest: string, date: string): string {
  return `${origin}-${dest}-${date}`;
}

/** Pure record: append the event unless that stage was already recorded for
 *  that trip. Returns the new log plus the recorded event, or a null event
 *  when deduplicated. Split from the browser wrapper so the contract is
 *  testable without storage. */
export function recordInto(
  log: FunnelEvent[],
  stage: FunnelStage,
  trip: string | null,
  at: string,
): { log: FunnelEvent[]; event: FunnelEvent | null } {
  if (log.some((e) => e.stage === stage && e.trip === trip)) {
    return { log, event: null };
  }
  const event: FunnelEvent = { stage, trip, at };
  return { log: [...log, event].slice(-CAP), event };
}

/** Browser-side record. Silent on the server, safe without storage. */
export function recordFunnel(stage: FunnelStage, trip?: string | null): void {
  if (typeof window === "undefined") return;
  let log: FunnelEvent[] = [];
  try {
    const raw = localStorage.getItem(FUNNEL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) log = parsed as FunnelEvent[];
  } catch {
    log = [];
  }
  const { log: next, event } = recordInto(log, stage, trip ?? null, new Date().toISOString());
  if (!event) return;
  try {
    localStorage.setItem(FUNNEL_KEY, JSON.stringify(next));
  } catch {
    /* best effort — the ring is a cache of what the server already got */
  }
  try {
    fetch("/api/funnel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never block the UI for a metric */
  }
}
