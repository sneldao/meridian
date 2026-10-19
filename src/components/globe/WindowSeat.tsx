"use client";

import { useMemo } from "react";
import { bodySubsolarPoint, solarZenithDeg, subsolarPoint, type SubsolarPoint } from "@/domain/sun";
import { skyGradient, skyBand, SKY_BAND_LABEL, type SkyBand } from "@/domain/sky";
import type { City, Trip } from "@/domain/types";

/**
 * World C — the Window Seat. The ending.
 *
 * Two windows, side by side: the sky your *body* thinks you are under at the
 * destination, and the sky actually there. Both are the same function
 * (`@/domain/sky`) of two solar altitudes, so as the plan banks its shift the
 * two converge — and the convergence is the product thesis rendered as light
 * rather than stated in a caption.
 *
 * Cheap by design: two CSS gradients and an aeroplane window frame. No WebGL,
 * because nothing here needs a shader and the ending should not be the thing
 * that fails on someone else's laptop.
 *
 * The honesty rule applies with more force here than anywhere else in the app.
 * These skies are a single-scattering approximation, not a forecast, so the
 * component prints what it is and what it is not. A traveller deciding whether
 * to take the light dose does not need the colour to be right — they need to
 * know it is not a measurement.
 */

/** Sun altitude above the horizon at a place, from the shared solar model. */
function altitudeAt(place: City, sub: SubsolarPoint): number {
  return 90 - solarZenithDeg(place.lat, place.lon, sub);
}

const BAND_COPY = SKY_BAND_LABEL;

export interface WindowSeatProps {
  trip: Trip;
  /** The instant the two skies are read at. `null` before the client clock is
   *  available — these panes are a function of the current instant, so a server
   *  render and a hydration render would disagree by however long the round trip
   *  took, and React would throw away the tree. Until then the panes render
   *  neutral rather than the section vanishing, so nothing shifts. */
  date: Date | null;
  /** Minutes of shift the plan still owes. Drives the body's sky. */
  owedMin: number;
  className?: string;
}

/** Before the client clock exists there is no honest sky to draw, so the panes
 *  hold a neutral slate rather than guessing one. */
const NEUTRAL_GRADIENT = "linear-gradient(to top, #2a2621 0%, #1c1915 100%)";

/** The aeroplane window: a rounded-rectangle aperture with a frame. */
function Pane({
  label,
  sublabel,
  gradient,
  band,
  altitude,
  caption,
}: {
  label: string;
  sublabel: string;
  gradient: string;
  band: SkyBand | null;
  altitude: number | null;
  caption: string;
}) {
  return (
    <figure
      className="m-0 flex-1"
      role="img"
      aria-label={`${label} — ${band === null || altitude === null ? "no reading yet" : `${BAND_COPY[band]}, sun ${altitude >= 0 ? "+" : "−"}${Math.abs(altitude).toFixed(1)}°`}`}
    >
      <figcaption className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="font-mono2 text-[10px] font-bold uppercase tracking-[0.14em] text-clay-2">
          {label}
        </span>
        <span className="font-mono2 text-[10px] text-clay-3">{sublabel}</span>
      </figcaption>
      {/* The aperture. The frame is a thick inset border with the gradient
          showing through, which is what makes it read as a window rather than
          a colour swatch. */}
      <div
        className="relative overflow-hidden rounded-[42%_42%_46%_46%/34%_34%_52%_52%] border-[10px] border-[#2b2621] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.06)]"
        style={{ background: gradient, aspectRatio: "3 / 4" }}
      >
        {/* A hint of the pane's own glass so the gradient does not read as a
            flat fill. Deliberately faint — it is a window, not a sunrise
            photograph. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(115deg, rgba(255,255,255,0.13) 0%, rgba(255,255,255,0) 42%)",
          }}
        />
      </div>
      <div className="mt-2 font-mono2 text-[11px] text-clay">
        {band === null || altitude === null
          ? "—"
          : `${BAND_COPY[band]} · sun ${altitude >= 0 ? "+" : "−"}${Math.abs(altitude).toFixed(1)}°`}
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-clay-2">{caption}</p>
    </figure>
  );
}

export function WindowSeat({ trip, date, owedMin, className }: WindowSeatProps) {
  const real = useMemo(() => (date ? subsolarPoint(date) : null), [date]);
  const body = useMemo(
    () => (real ? bodySubsolarPoint(real, owedMin, trip.requiredShiftMin) : null),
    [real, owedMin, trip.requiredShiftMin],
  );

  const mineAlt = body ? altitudeAt(trip.destination, body) : null;
  const realAlt = real ? altitudeAt(trip.destination, real) : null;
  const converged = mineAlt !== null && realAlt !== null && Math.abs(mineAlt - realAlt) < 0.5;

  // The residual in hours, which is the unit the product speaks in.
  const owedH = Math.abs(owedMin) / 60;

  return (
    <section className={className} aria-label="Window seat">
      <header className="mb-3">
        <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-clay-2">
          the window seat
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-clay">
          {!date
            ? "Reading the sky…"
            : converged
              ? "Your dawn and the real one are the same light. Nothing is owed."
              : `Your dawn is ${owedH < 1 ? `${Math.round(owedMin)}m` : `${owedH.toFixed(1)}h`} behind ${trip.destination.name}'s. The crew closes it a locked day at a time.`}
        </p>
      </header>

      <div className="flex gap-4 sm:gap-6">
        <Pane
          label="your body's dawn"
          sublabel="what your clock says"
          gradient={mineAlt === null ? NEUTRAL_GRADIENT : skyGradient(mineAlt)}
          band={mineAlt === null ? null : skyBand(mineAlt)}
          altitude={mineAlt}
          caption={
            mineAlt === null
              ? "—"
              : converged
                ? "Arrived."
                : `Sun ${mineAlt >= 0 ? "+" : "−"}${Math.abs(mineAlt).toFixed(1)}° here — still ${BAND_COPY[skyBand(mineAlt)]}.`
          }
        />
        <Pane
          label="the real sky"
          sublabel={`${trip.destination.code} · now`}
          gradient={realAlt === null ? NEUTRAL_GRADIENT : skyGradient(realAlt)}
          band={realAlt === null ? null : skyBand(realAlt)}
          altitude={realAlt}
          caption={
            realAlt === null
              ? "—"
              : `Sun ${realAlt >= 0 ? "+" : "−"}${Math.abs(realAlt).toFixed(1)}° — ${BAND_COPY[skyBand(realAlt)]} in ${trip.destination.name}.`
          }
        />
      </div>

      <p className="mt-3 max-w-2xl text-[11px] leading-relaxed text-clay-2">
        Both skies come from the same solar model as the terminator on the globe, evaluated at two
        different subsolar points. The colour is a single-scattering approximation — it gets the
        order and the progression of a real sky right and it is continuous across the horizon, but
        it is not a forecast and not a measurement. The{" "}
        <span className="font-mono2">altitude</span> and the{" "}
        <span className="font-mono2">band</span> above each pane are the computed facts.
      </p>
    </section>
  );
}