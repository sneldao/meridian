import { buildIcs } from "./ics";
import { getFeedRef, syncFeed } from "./feed";
import type { CalendarEvent, DayPlan, EvalResult, Trip } from "@/domain/types";
import { planVersion } from "@/domain/plan-edit";

/* The plan storage seam (milestone 4). The interactive day proposes edits;
 * the store owns what is saved. Every write is optimistic-concurrency: the
 * caller proves which version it edited, and a mismatch leaves the stored
 * plans untouched — a stale apply never clobbers a newer plan. */

export interface PlanStore {
  read(): { plans: DayPlan[]; version: string };
  write(
    plans: DayPlan[],
    expectedVersion: string,
    meta?: { result?: EvalResult },
  ): { ok: true; version: string; sync?: "synced" | "no-feed" | "no-calendar" } | { ok: false; reason: "stale" | "failed" };
}

/** In-memory store — the dev surface and tests. `simulateExternalEdit`
 *  perturbs the stored plan the way another writer would, so the stale
 *  path can be exercised on demand. */
export function memoryPlanStore(
  initial: DayPlan[],
  opts?: { failNextWrite?: () => boolean },
): PlanStore & { simulateExternalEdit(): void } {
  let stored = initial;
  let version = planVersion(stored);
  return {
    read: () => ({ plans: stored, version }),
    write(plans, expectedVersion, _meta = undefined) {
      void _meta;
      if (expectedVersion !== version) return { ok: false, reason: "stale" };
      if (opts?.failNextWrite?.()) return { ok: false, reason: "failed" };
      stored = plans;
      version = planVersion(stored);
      return { ok: true, version };
    },
    simulateExternalEdit() {
      // A benign but real change: bump the first day label so the version
      // genuinely differs without inventing fake interventions.
      stored = stored.map((d, i) => (i === 0 ? { ...d, label: `${d.label} ` } : d));
      version = planVersion(stored);
    },
  };
}

/* Real persistence (milestone 5): the plan the crew locked, in
 * localStorage under `meridian:lastPlan` — the same key every surface
 * reads (restore-plan, arrival, PlanReview, the assistant link). The route
 * check is restorePlan's: wrong trip on file means nothing here applies. */

const PLAN_KEY = "meridian:lastPlan";
const TRIP_KEY = "meridian:lastTrip";

export function localPlanStore({
  route,
}: {
  route: { origin: string; dest: string; date: string };
}): PlanStore {
  const readRaw = (): Record<string, unknown> | null => {
    try {
      const plan = JSON.parse(localStorage.getItem(PLAN_KEY) || "null");
      const trip = JSON.parse(localStorage.getItem(TRIP_KEY) || "null");
      if (!plan || !Array.isArray(plan.days)) return null;
      if (
        trip?.origin?.code !== route.origin ||
        trip?.destination?.code !== route.dest
      ) return null;
      const depDay = Array.isArray(trip.days)
        ? trip.days.find(
            (d: { dayIndex?: number }) => d.dayIndex === trip.departureDayIndex,
          )
        : null;
      if (!depDay || depDay.date !== route.date) return null;
      return plan as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  return {
    read() {
      const plan = readRaw();
      if (!plan) return { plans: [], version: planVersion([]) };
      const plans = (plan.days as DayPlan[])
        .slice()
        .sort((a, b) => a.dayIndex - b.dayIndex);
      return { plans, version: planVersion(plans) };
    },
    write(plans, expectedVersion, meta) {
      const plan = readRaw();
      if (!plan) return { ok: false, reason: "failed" };
      const stored = (plan.days as DayPlan[])
        .slice()
        .sort((a, b) => a.dayIndex - b.dayIndex);
      if (planVersion(stored) !== expectedVersion) {
        return { ok: false, reason: "stale" };
      }
      // Every other field is preserved verbatim. Derived-from-days fields
      // are dropped rather than left stale: `coverage`/`score`/`ics`/`lines`
      // all describe the old times and are recomputed the next time the
      // crew runs (arrival already handles a missing promise honestly).
      const rest = { ...plan };
      // `ics`/`lines` describe the old times — dropped. `score`/`coverage`
      // are refreshed from the gate's own verdict when the caller has one;
      // without it they are dropped too, never left stale.
      delete rest.lines;
      if (meta?.result) {
        rest.score = meta.result.score;
        rest.coverage = meta.result.coverage;
      } else {
        delete rest.coverage;
        delete rest.score;
      }
      // Rebuild the calendar feed the server wrote: same builder, same
      // inputs (the calendar persisted at lock, moves applied — read back
      // from lastPlan rather than trusting memory). Old plans without a
      // stored calendar can't rebuild honestly — drop ics and skip sync.
      let trip: Trip | null = null;
      try {
        trip = JSON.parse(localStorage.getItem(TRIP_KEY) || "null");
      } catch { trip = null; }
      const storedCal = Array.isArray(plan.calendar) ? (plan.calendar as CalendarEvent[]) : null;
      let sync: "synced" | "no-feed" | "no-calendar" = "no-calendar";
      if (trip && storedCal) {
        const ics = buildIcs(storedCal, trip, plans);
        rest.ics = ics;
        if (getFeedRef()) {
          syncFeed({ ics, trip, days: plans });
          sync = "synced";
        } else {
          sync = "no-feed";
        }
      } else {
        delete rest.ics;
      }
      try {
        localStorage.setItem(
          PLAN_KEY,
          JSON.stringify({ ...rest, days: plans, editedAt: new Date().toISOString() }),
        );
      } catch {
        return { ok: false, reason: "failed" };
      }
      return { ok: true, version: planVersion(plans), sync };
    },
  };
}
