import { FUNNEL_STAGES, type FunnelStage } from "./funnel";

/* Round 22: the readable half of the funnel. Round 17 wrote the events;
 * nothing looked at them. This module turns raw rows into the numbers the
 * product decisions need — per-stage reach, trip-level conversion between
 * consecutive stages, and a day-by-day pulse. Pure function, no Supabase
 * import: the route fetches, this aggregates, tests feed it fixtures. */

export interface FunnelEventRow {
  stage: FunnelStage;
  trip: string | null;
  at: string;
}

export interface FunnelSummary {
  windowDays: number;
  stages: Record<FunnelStage, { events: number; trips: number }>;
  /** Trip-level conversion between consecutive stages: of the trips seen at
   *  stage N, how many reached stage N+1. Null when the earlier stage saw
   *  no trips — a ratio with an empty denominator is a lie. */
  conversion: Partial<Record<string, number | null>>;
  /** Last 7 days inside the window, oldest first. */
  recent: Array<Record<"day" | FunnelStage, string | number>>;
  totalEvents: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function aggregateFunnel(
  rows: FunnelEventRow[],
  opts: { now?: Date; windowDays?: number } = {},
): FunnelSummary {
  const now = opts.now ?? new Date();
  const windowDays = opts.windowDays ?? 30;
  const cutoff = now.getTime() - windowDays * DAY_MS;

  const stages = Object.fromEntries(
    FUNNEL_STAGES.map((s) => [s, { events: 0, trips: new Set<string>() }]),
  ) as Record<FunnelStage, { events: number; trips: Set<string> }>;

  const dayBuckets = new Map<string, Record<FunnelStage, number>>();

  let totalEvents = 0;
  for (const row of rows) {
    const at = Date.parse(row.at);
    if (!Number.isFinite(at) || at < cutoff || at > now.getTime() + DAY_MS) continue;
    if (!(row.stage in stages)) continue;
    totalEvents += 1;
    stages[row.stage].events += 1;
    if (row.trip) stages[row.stage].trips.add(row.trip);

    const day = new Date(at).toISOString().slice(0, 10);
    const bucket = dayBuckets.get(day) ?? Object.fromEntries(FUNNEL_STAGES.map((s) => [s, 0]));
    (bucket as Record<FunnelStage, number>)[row.stage] += 1;
    dayBuckets.set(day, bucket as Record<FunnelStage, number>);
  }

  const stagesOut = Object.fromEntries(
    FUNNEL_STAGES.map((s) => [s, { events: stages[s].events, trips: stages[s].trips.size }]),
  ) as FunnelSummary["stages"];

  const conversion: FunnelSummary["conversion"] = {};
  for (let i = 0; i < FUNNEL_STAGES.length - 1; i++) {
    const from = FUNNEL_STAGES[i];
    const to = FUNNEL_STAGES[i + 1];
    const fromTrips = stages[from].trips.size;
    conversion[`${from}->${to}`] =
      fromTrips === 0 ? null : stages[to].trips.size / fromTrips;
  }

  // The pulse: only days that saw at least one event, oldest first, capped
  // at the trailing week of the window.
  const recent = [...dayBuckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .slice(-7)
    .map(([day, counts]) => ({ day, ...counts }) as FunnelSummary["recent"][number]);

  return { windowDays, stages: stagesOut, conversion, recent, totalEvents };
}
