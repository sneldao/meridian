"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { RoutePicker } from "@/components/RoutePicker";
import { isValidHomeRoute, type HomeRoute } from "@/lib/home-entry";
import { ADHERENCE_PROFILE, buildTrip, GARMIN_BASELINE } from "@/domain/fixtures";
import { previewPlan, type SolvedDay } from "@/domain/solver";
import { routeGapLine, routeGapRead, type RouteGapRead } from "@/domain/route-gap";
import { coverageOf, fmtMin } from "@/domain/circadian";
import { paymentsConfigured, readPrice } from "@/lib/escrow";
import type { CityCode, Trip } from "@/domain/types";

function planPreview(route: HomeRoute): { lightStart?: number; covPct: number } | null {
  try {
    const t: Trip = buildTrip(route.origin.toUpperCase() as CityCode, route.dest.toUpperCase() as CityCode, route.date);
    // Same demo baseline as the example day below: a preview the solver can
    // actually place, computed the moment the route resolves.
    const solved = previewPlan({ trip: t, calendar: [], adherence: ADHERENCE_PROFILE, baseline: GARMIN_BASELINE });
    const days = [...solved.values()].filter((s): s is SolvedDay => !!s).map((s) => s.plan);
    if (!days.length) return null;
    const light = days.flatMap((d) => d.interventions).find((i) => i.kind === "light_exposure");
    return {
      lightStart: light?.startMin,
      covPct: Math.round(coverageOf(t, days).ratio * 100),
    };
  } catch {
    return null; // airports outside the registry — no preview, never a fake
  }
}

export interface TripEntryScreenProps {
  initialDate: string;
  onContinue: (route: HomeRoute) => void;
  onExploreExample: () => void;
  /** Deprecated on this surface: the sample-journey tiles moved out of the
   *  form to after the example instrument (Phase 1). Kept so existing
   *  callers typecheck — nothing is rendered from it here. */
  onExploreScenario?: (id: import("@/domain/demo-scenarios").DemoScenarioId) => void;
  initialRoute?: HomeRoute | null;
  /** The resolved gap + solver coverage for the draft, reported as it
   *  changes — the landing headline above adopts it. Null gap = the draft
   *  hasn't resolved. Callers should pass a stable callback (useCallback);
   *  the report effect re-runs whenever its identity changes. */
  onGapChange?: (gap: RouteGapRead | null, covPct: number | null) => void;
}

/* Design reset Phase 1 — the form is the hero's action: no intro column,
 * no mascot, no sample tiles inside the form (they live below the example
 * day now). The response to typing is the headline above it changing via
 * onGapChange, plus the preview line under the CTA. */
export function TripEntryScreen({ initialDate, onContinue, onExploreExample, initialRoute, onGapChange }: TripEntryScreenProps) {
  const [draft, setDraft] = useState<HomeRoute>(
    initialRoute && isValidHomeRoute(initialRoute) ? initialRoute : { origin: "", dest: "", date: initialDate },
  );
  // Price disclosed at intent, read live from the contract — a stale number
  // in copy is worse than none, so the line only renders once the read lands.
  const [priceUsdc, setPriceUsdc] = useState<string | null>(null);
  useEffect(() => {
    if (!paymentsConfigured()) return;
    let on = true;
    readPrice()
      .then((p) => on && setPriceUsdc(`${(Number(p) / 1e6).toFixed(2)}`))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  const valid = isValidHomeRoute(draft);
  const sameAirports =
    !!draft.origin && !!draft.dest && draft.origin.toUpperCase() === draft.dest.toUpperCase();
  const preview = useMemo(() => (valid ? planPreview(draft) : null), [draft, valid]);
  const gap = useMemo(() => (valid ? routeGapRead(draft) : null), [draft, valid]);
  // Report the resolved read upward — the landing headline adopts it.
  useEffect(() => {
    onGapChange?.(gap, preview?.covPct ?? null);
  }, [gap, preview, onGapChange]);

  return (
    <section className="entry" id="trip-entry" role="group" aria-labelledby="entry-heading">
      <div className="entry-planner">
        <h2 id="entry-heading">Where are you headed?</h2>
        <p className="entry-planner-note">Choose airports from the suggestions, then a departure date.</p>
        <form
          className="entry-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) {
              onContinue({
                origin: draft.origin.toUpperCase(),
                dest: draft.dest.toUpperCase(),
                date: draft.date,
              });
            }
          }}
        >
          <RoutePicker
            origin={draft.origin}
            dest={draft.dest}
            date={draft.date}
            surface="landing"
            onChange={(next) =>
              setDraft({ origin: next.origin, dest: next.dest, date: next.date })
            }
          />
          {/* The helper only speaks when there's an actual error — the
              suggestion instruction lives in the note above the fields. */}
          {sameAirports && (
            <p role="alert" className="entry-error">Choose different departure and destination airports.</p>
          )}
          <button type="submit" className="entry-cta" disabled={!valid}>
            See my trip plan <ArrowRight size={18} aria-hidden="true" />
          </button>
          {/* Live solver preview — computed as the route resolves. It is a
              model preview of coverage, never a promise of alertness. */}
          {(preview || gap) && (
            <p className="entry-preview" aria-live="polite">
              {gap && (
                <>
                  {routeGapLine(gap)}
                  {preview ? " · " : ""}
                </>
              )}
              {preview && (
                <>
                  Model preview — estimated shift coverage {preview.covPct}% using example sleep timing
                  {preview.lightStart !== undefined && ` · first light ${fmtMin(preview.lightStart)}`}
                </>
              )}
            </p>
          )}
        </form>
        <div className="entry-example-row">
          <span>Just looking around?</span>
          <button type="button" className="entry-example" onClick={onExploreExample}>Explore an example</button>
        </div>
        <p className="entry-privacy">
          No account needed to get started.{" "}
          <Link href="/privacy" className="underline">Privacy &amp; support</Link>
        </p>
        {priceUsdc !== null && (
          <p className="entry-privacy mt-1">
            Day one is free. The full week is {priceUsdc} USDC, held on Arc and
            released only if the plan passes our checks — refunded if it doesn&apos;t.
          </p>
        )}
      </div>
    </section>
  );
}
