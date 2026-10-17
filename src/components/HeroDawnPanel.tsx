"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useReducedMotion } from "framer-motion";
import {
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoOrthographic,
  geoPath,
} from "d3-geo";
import { feature } from "topojson-client";
import worldTopo from "world-atlas/countries-110m.json";
import type { FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import type { Topology } from "topojson-specification";
import { fmtMin } from "@/domain/circadian";
import { nowMinOnDay } from "@/domain/today";
import { dawnLayers } from "@/domain/dawn-layers";
import { bodySubsolarPoint, isDaylight, subsolarPoint, terminatorCrossings, terminatorLat, wrapLon, type SubsolarPoint } from "@/domain/sun";
import type { Trip } from "@/domain/types";
import { DawnScrubber } from "@/components/DawnScrubber";

// The hero's left panel: the traveller's body-clock dawn against the
// destination's, drawn from the shared §3a primitives (see @/domain/dawn-layers
// — the crew lens draws the identical geometry) with the next light window on
// it. SVG only, no new deps.
//
// Interaction is layered on, never instead of: the caption under the disc states
// the same read in words, so reduced-motion, keyboard and screen-reader visitors
// lose nothing by never touching the globe. Three affordances, in cost order:
// hover a city for its clock and daylight, hover the gap for the residual,
// scrub time and shift to watch the two dawns close.

const W = 320;
const H = 320;
const R = 140;

const worldGeo = feature(
  worldTopo as unknown as Topology,
  (worldTopo as unknown as Topology).objects.countries,
) as FeatureCollection<Polygon | MultiPolygon, { name: string }>;

/** Degrees of rotation the traveller may drag the disc through before it
 *  springs home. Enough to feel like a globe, not enough to lose both cities. */
const DRAG_LNG = 40;
const DRAG_LAT = 28;

/** The only media query that enables disc dragging. See the gesture note. */
const FINE_POINTER = "(hover: hover) and (pointer: fine)";

export interface HeroDawnPanelProps {
  trip: Trip;
  /** Minutes of shift the body still owes the destination. Before a run this is
   *  what landing will still be short by; as days lock it closes toward 0 and
   *  the ghost curve slides onto the real one. */
  owedMin: number;
  /** The step to put on the curve — only a light step has a beam to land. */
  beam?: { dayIndex: number; startMin: number; endMin: number } | null;
  readinessPct: number;
}

/** Hours the two dawns are apart, rounded to the half hour the plan works in:
 *  90 minutes reads "1.5h", 60 reads "1h", a sliver reads in minutes. */
function gapPhrase(min: number): string {
  if (min < 5) return "";
  if (min < 45) return `${Math.round(min / 5) * 5} min`;
  const hours = Math.round(min / 6) / 10;
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

/** The same wall-clock instant, read at a chosen minute of the origin's day.
 *  Rolling the UTC day is harmless here — the sun moves 15° an hour and the
 *  roll is at most a day — but it is why this is a helper and not inline math. */
function atOriginMinute(base: Date, utcOffsetMin: number, minOfDay: number): Date {
  const d = new Date(base.getTime());
  const utcMin = (((minOfDay - utcOffsetMin) % 1440) + 1440) % 1440;
  d.setUTCHours(Math.floor(utcMin / 60), utcMin % 60, 0, 0);
  return d;
}

export function HeroDawnPanel({ trip, owedMin, beam, readinessPct }: HeroDawnPanelProps) {
  // Honest arrival headline: hours banked so far out of the whole shift, never
  // a "100%" claim. readinessPct is the locked share of the required shift.
  const requiredMin = Math.abs(trip.requiredShiftMin);
  const bankedH = Math.round((requiredMin * readinessPct) / 100 / 60 * 10) / 10;
  const shiftH = Math.round(requiredMin / 60);
  const reduce = useReducedMotion();

  // One minute hand, not a rAF loop: the live line only moves meaningfully
  // every couple of minutes, and the first paint of the page should not wait on
  // it. The globe only spins when the traveller drags it, so nothing here needs
  // a continuous loop.
  const [tick, setTick] = useState(-1);
  useEffect(() => {
    const init = setTimeout(() => setTick(0), 0);
    const t = setInterval(() => setTick((v) => v + 1), 60_000);
    return () => {
      clearTimeout(init);
      clearInterval(t);
    };
  }, []);
  const hydrated = tick >= 0;
  const live = hydrated ? new Date() : new Date(0);

  // --- interaction state ----------------------------------------------------
  // null means "live". The scrubbers only take over when actually moved, so an
  // untouched page is exactly the honest live read it was before.
  const [timeOverride, setTimeOverride] = useState<number | null>(null);
  const [owedOverride, setOwedOverride] = useState<number | null>(null);
  const [focus, setFocus] = useState<"origin" | "dest" | "gap" | null>(null);
  const [rot, setRot] = useState({ lng: 0, lat: 0 });
  const rotRef = useRef(rot);
  const setRotBoth = useCallback((next: { lng: number; lat: number }) => {
    rotRef.current = next;
    setRot(next);
  }, []);
  const drag = useRef({ active: false, x: 0, y: 0, fromLng: 0, fromLat: 0 });
  const rafRef = useRef<number | null>(null);

  const displayOwed = owedOverride ?? owedMin;
  const overridden = timeOverride !== null || owedOverride !== null;

  // Home-local minutes of day, from the live clock unless the lane was moved.
  const liveHomeMin = hydrated ? nowMinOnDay(trip, 0, live) : 0;
  const displayMin = timeOverride ?? liveHomeMin;
  const displayDate =
    timeOverride === null ? live : atOriginMinute(live, trip.origin.utcOffsetMin, timeOverride ?? 0);

  const reset = useCallback(() => {
    setTimeOverride(null);
    setOwedOverride(null);
  }, []);

  // --- projection -----------------------------------------------------------
  // Centre the disc between the two cities, so both sit on it and the distance
  // between their dawns is the thing you can see. Dragging offsets that centre.
  const centre = useMemo(
    () =>
      geoInterpolate(
        [trip.origin.lon, trip.origin.lat],
        [trip.destination.lon, trip.destination.lat],
      )(0.5) as [number, number],
    [trip],
  );
  const projection = useMemo(
    () =>
      geoOrthographic()
        .scale(R)
        .translate([W / 2, H / 2])
        .rotate([-(centre[0] + rot.lng), -(centre[1] + rot.lat)])
        .clipAngle(90),
    [centre, rot],
  );
  const gen = useMemo(() => geoPath(projection), [projection]);
  const land = useMemo(
    () =>
      worldGeo.features
        .map((f) => gen(f))
        .filter((d): d is string => Boolean(d))
        .join(" "),
    [gen],
  );

  // d3 rotates a point *into* the disc: the geographic coordinate that lands at
  // the centre is the negation of the rotate argument, so rotate(-centre) puts
  // +centre in the middle. Negating here too would test the far hemisphere and
  // silently drop both city pins off the disc.
  const viewCentre: [number, number] = [centre[0] + rot.lng, centre[1] + rot.lat];
  const onDisc = (lon: number, lat: number) =>
    geoDistance([lon, lat], viewCentre) <= Math.PI / 2;
  const xy = (lon: number, lat: number) => (onDisc(lon, lat) ? projection([lon, lat]) : null);

  // --- the shared dawn geometry --------------------------------------------
  const sub = subsolarPoint(displayDate);
  const { nightPath, twilightPath, terminatorPath, ghostPath } = dawnLayers(
    gen,
    sub,
    displayOwed,
    trip.requiredShiftMin,
  );

  // The next light step, marked where the sun crosses the latitude it stands
  // on. The dawn line rides west as the earth turns, so the step's window is
  // the track the beam covers while you are out in it.
  const beamTrack = (() => {
    if (!beam) return null;
    const place = beam.dayIndex <= trip.departureDayIndex ? trip.origin : trip.destination;
    const crossings = terminatorCrossings(place.lat, sub);
    if (!crossings.length) return null;
    const morning = beam.startMin < 720;
    const edge = morning ? crossings[0] : crossings[1];
    const end = beam.endMin < beam.startMin ? beam.endMin + 1440 : beam.endMin;
    const driftDeg = Math.max(10, end - beam.startMin) / 4;
    const steps = 9;
    const line: LineString = {
      type: "LineString",
      coordinates: Array.from({ length: steps }, (_, i) => [
        wrapLon(edge.lon - (driftDeg * i) / (steps - 1)),
        place.lat,
      ]),
    };
    return {
      d: gen(line) ?? undefined,
      head: xy(line.coordinates[0][0], place.lat),
      place,
      startMin: beam.startMin,
      endMin: beam.endMin,
    };
  })();

  const originXY = xy(trip.origin.lon, trip.origin.lat);
  const destXY = xy(trip.destination.lon, trip.destination.lat);
  const leg = geoInterpolate(
    [trip.origin.lon, trip.origin.lat],
    [trip.destination.lon, trip.destination.lat],
  );
  const arc = gen({
    type: "LineString",
    coordinates: Array.from({ length: 33 }, (_, i) => leg(i / 32)),
  });

  // --- labels on the curves, not a key under them --------------------------
  // A legend makes the reader map line-style to meaning. Printing the words on
  // the lines removes the mapping step, and it costs nothing in the layout.
  //
  // The anchor has to be "nearest the disc centre", not "at the disc-centre
  // latitude" or "on the centre meridian". The disc is centred between the two
  // cities, so both of those can easily land on the far hemisphere — at 02:20
  // London the terminator crosses nowhere near central Asia, and the labels
  // simply never appear. Sweeping the curve for its closest visible point is
  // the only placement that survives every time of day and every route.
  const curveLabels = (() => {
    if (!hydrated) return [];
    const body = bodySubsolarPoint(sub, displayOwed, trip.requiredShiftMin);

    const nearestVisible = (sun: SubsolarPoint): [number, number] | null => {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let i = 0; i < 120; i++) {
        const lon = -180 + (360 * i) / 120;
        const lat = terminatorLat(lon, sun);
        if (!Number.isFinite(lat) || Math.abs(lat) > 88) continue;
        const d = geoDistance([lon, lat], viewCentre);
        if (d > Math.PI / 2) continue;
        const p = projection([lon, lat]) as [number, number];
        // The disc is centred between the two cities, so "nearest the centre"
        // is very often "sitting on a pin". Step over a small exclusion around
        // each one and take the next best point along the curve.
        const clashes = [originXY, destXY].some(
          (pin) => pin && Math.hypot(pin[0] - p[0], pin[1] - p[1]) < 26,
        );
        if (clashes) continue;
        if (d < bestD) {
          bestD = d;
          best = [lon, lat];
        }
      }
      return best ? (projection(best) as [number, number]) : null;
    };

    const realXY = nearestVisible(sub);
    const ghostXY = ghostPath ? nearestVisible(body) : null;
    const out: { p: [number, number]; text: string; ghost: boolean }[] = [];
    if (realXY) out.push({ p: realXY, text: "the real dawn", ghost: false });
    // Only label the ghost when it will not collide with the real line's label.
    if (ghostXY && Math.abs(ghostXY[1] - (realXY?.[1] ?? 1e9)) > 15) {
      out.push({ p: ghostXY, text: "your body's dawn", ghost: true });
    }
    return out;
  })();

  // --- gestures -------------------------------------------------------------
  // Drag-to-recentre is pointer-gated. On touch, `touch-action` on a mid-page
  // card would steal the page scroll, which is a far worse bug than a globe
  // that doesn't spin on a phone.
  // Resolved through useSyncExternalStore rather than a mount effect: the
  // server snapshot is `false`, so the first paint and the hydration pass agree,
  // and plugging in a mouse mid-session still updates the cursor and the drag
  // binding without a re-render of the tree.
  const canDrag = useSyncExternalStore(
    useCallback((onChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mq = window.matchMedia(FINE_POINTER);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }, []),
    () =>
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia(FINE_POINTER).matches
        : false,
    () => false,
  );

  const cancelSpring = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  /** Spring the disc home. Reduced motion gets the destination immediately. */
  const springHome = useCallback(() => {
    cancelSpring();
    const from = rotRef.current;
    if (reduce || (Math.abs(from.lng) < 0.01 && Math.abs(from.lat) < 0.01)) {
      setRotBoth({ lng: 0, lat: 0 });
      return;
    }
    const t0 = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - t0) / 520);
      const e = 1 - Math.pow(1 - p, 3);
      setRotBoth({ lng: from.lng * (1 - e), lat: from.lat * (1 - e) });
      rafRef.current = p < 1 ? requestAnimationFrame(step) : null;
    };
    rafRef.current = requestAnimationFrame(step);
  }, [reduce, cancelSpring, setRotBoth]);

  useEffect(() => cancelSpring, [cancelSpring]);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canDrag) return;
    cancelSpring();
    drag.current = {
      active: true,
      x: e.clientX,
      y: e.clientY,
      fromLng: rotRef.current.lng,
      fromLat: rotRef.current.lat,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current.active) return;
    const k = e.currentTarget.getBoundingClientRect().width / W || 1;
    // ~180° of arc across the disc, which is what an orthographic sphere gives
    // at the centre; near the rim it over-rotates, so this is clamped hard.
    const degPerPx = 180 / (Math.PI * R);
    setRotBoth({
      lng: Math.max(-DRAG_LNG, Math.min(DRAG_LNG, drag.current.fromLng + (e.clientX - drag.current.x) / k * degPerPx)),
      lat: Math.max(-DRAG_LAT, Math.min(DRAG_LAT, drag.current.fromLat - (e.clientY - drag.current.y) / k * degPerPx)),
    });
  };

  const endDrag = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    springHome();
  };

  // --- caption --------------------------------------------------------------
  const gap = gapPhrase(displayOwed);
  const destName = trip.destination.name;
  const toward = trip.direction === "west" ? "ahead of" : "behind";

  /** Both cells read from the same instant the disc is drawing, so scrubbing
   *  the clock moves the terminator and the two city clocks together. */
  const cityClock = (dayIndex: number) =>
    hydrated ? fmtMin(nowMinOnDay(trip, dayIndex, displayDate)) : "--:--";

  const cityCell = (which: "origin" | "dest", place: typeof trip.origin, dayIndex: number) => {
    const on = focus === which;
    return (
      <button
        type="button"
        key={which}
        className={`city-cell${on ? " on" : ""}`}
        aria-pressed={on}
        onMouseEnter={() => setFocus(which)}
        onMouseLeave={() => setFocus((f) => (f === which ? null : f))}
        onFocus={() => setFocus(which)}
        onBlur={() => setFocus((f) => (f === which ? null : f))}
        onClick={() => setFocus((f) => (f === which ? null : which))}
      >
        <span className="city-name">{place.name}</span>
        <b>{cityClock(dayIndex)}</b>
        {hydrated && (
          <i className={isDaylight(place.lat, place.lon, displayDate) ? "day" : "night"}>
            {isDaylight(place.lat, place.lon, displayDate) ? "day" : "night"}
          </i>
        )}
      </button>
    );
  };

  return (
    <div className="hl">
      <div className="bg term" aria-hidden="true" />
      <div className="sc" />

      <div className="hl-stage">
        {hydrated && (
          <svg
            className={`dawn-map${canDrag ? " grab" : ""}`}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <circle cx={W / 2} cy={H / 2} r={R} fill="#0a1120" stroke="#1e2637" strokeWidth={1} />
            <path d={land || undefined} fill="#151f36" stroke="#22304f" strokeWidth={0.35} />
            <path
              d={gen(geoGraticule10()) ?? undefined}
              fill="none"
              stroke="var(--color-line)"
              strokeWidth={0.4}
              strokeDasharray="2 4"
              opacity={0.7}
            />
            {twilightPath && <path d={twilightPath} fill="var(--color-sun-dest)" opacity={0.1} />}
            {nightPath && <path d={nightPath} fill="#02040a" opacity={0.62} />}
            {terminatorPath && (
              <path
                d={terminatorPath}
                fill="none"
                stroke="var(--color-sun-home)"
                strokeWidth={focus === "gap" ? 2 : 1.2}
                opacity={0.8}
              />
            )}
            {ghostPath && (
              <>
                {/* A fat transparent copy of the ghost so the gap between the
                    two curves is a hover target you can actually hit. */}
                <path
                  d={ghostPath}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={18}
                  style={{ pointerEvents: "stroke" }}
                  onMouseEnter={() => setFocus("gap")}
                  onMouseLeave={() => setFocus((f) => (f === "gap" ? null : f))}
                />
                <path
                  d={ghostPath}
                  fill="none"
                  stroke="var(--color-ghost)"
                  strokeWidth={focus === "gap" ? 3 : 1.8}
                  strokeDasharray="6 4"
                  opacity={0.9}
                >
                  {!reduce && (
                    <animate
                      attributeName="stroke-dashoffset"
                      values="0;-20"
                      dur="1.4s"
                      repeatCount="indefinite"
                    />
                  )}
                </path>
              </>
            )}

            {arc && (
              <path
                d={arc}
                fill="none"
                stroke="var(--color-mist)"
                strokeWidth={0.9}
                strokeDasharray="3 4"
                opacity={0.55}
              />
            )}

            {beamTrack?.d && (
              <>
                <path
                  d={beamTrack.d}
                  fill="none"
                  stroke="var(--color-sun-dest)"
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={focus === "dest" ? 0.75 : 0.45}
                />
                {beamTrack.head && (
                  <circle
                    cx={beamTrack.head[0]}
                    cy={beamTrack.head[1]}
                    r={4}
                    fill="var(--color-sun-dest)"
                  />
                )}
              </>
            )}

            {curveLabels.map((l) => {
              const flip = l.p[0] > W / 2;
              return (
                <text
                  key={l.text}
                  x={l.p[0] + (flip ? -7 : 7)}
                  y={l.p[1] - 4}
                  textAnchor={flip ? "end" : "start"}
                  fill={l.ghost ? "var(--color-ghost)" : "var(--color-sun-home)"}
                  fontSize={8.5}
                  fontWeight={700}
                  letterSpacing="0.04em"
                  opacity={0.95}
                  /* A dark stroke behind the glyphs keeps the label readable
                     where it crosses a coastline or the graticule. */
                  stroke="#0a1120"
                  strokeWidth={2.5}
                  paintOrder="stroke"
                >
                  {l.text}
                </text>
              );
            })}

            {originXY && (
              <g
                transform={`translate(${originXY[0]} ${originXY[1]})`}
                className="pin"
                onMouseEnter={() => setFocus("origin")}
                onMouseLeave={() => setFocus((f) => (f === "origin" ? null : f))}
              >
                <circle r={13} fill="transparent" />
                {focus === "origin" && (
                  <circle r={11} fill="var(--color-sun-home)" opacity={0.18} />
                )}
                <circle
                  r={focus === "origin" ? 6.5 : 5}
                  fill="var(--color-sun-home)"
                  stroke="var(--color-paper)"
                  strokeWidth={1.3}
                />
                <text
                  x={originXY[0] > W - 70 ? -8 : 9}
                  y={4}
                  textAnchor={originXY[0] > W - 70 ? "end" : "start"}
                  fill="var(--color-sun-home)"
                  fontSize={12}
                  fontWeight={700}
                >
                  {trip.origin.code}
                </text>
              </g>
            )}
            {destXY && (
              <g
                transform={`translate(${destXY[0]} ${destXY[1]})`}
                className="pin"
                onMouseEnter={() => setFocus("dest")}
                onMouseLeave={() => setFocus((f) => (f === "dest" ? null : f))}
              >
                <circle r={14} fill="transparent" />
                {focus === "dest" && (
                  <circle r={12} fill="var(--color-sun-dest)" opacity={0.2} />
                )}
                <circle
                  r={focus === "dest" ? 7 : 5.5}
                  fill="var(--color-sun-dest)"
                  stroke="#fff3d6"
                  strokeWidth={1.3}
                />
                <text
                  x={destXY[0] > W - 70 ? -9 : 10}
                  y={4}
                  textAnchor={destXY[0] > W - 70 ? "end" : "start"}
                  fill="var(--color-sun-dest)"
                  fontSize={12}
                  fontWeight={700}
                >
                  {trip.destination.code}
                </text>
              </g>
            )}
          </svg>
        )}

        {hydrated && (
          <DawnScrubber
            timeMin={displayMin}
            onTimeChange={setTimeOverride}
            owedMin={displayOwed}
            requiredMin={requiredMin}
            onOwedChange={setOwedOverride}
            overridden={overridden}
            onReset={reset}
            homeLabel={trip.origin.name}
            destLabel={destName}
          />
        )}
      </div>

      {/* The same read the curve gives, in words — a reduced-motion, keyboard or
          screen-reader visitor gets the number as a label, never as an animation
          to infer. The city cells double as the keyboard/touch equivalent of
          hovering a pin on the disc. */}
      <div className="dawn-cap">
        <div className="dawn-cities">
          {cityCell("origin", trip.origin, 0)}
          {cityCell("dest", trip.destination, trip.departureDayIndex + 1)}
        </div>

        <p className={`dawn-gap${focus === "gap" ? " hot" : ""}`}>
          {gap ? (
            <>
              Your dawn is <b>{gap} {toward}</b> {destName}&apos;s — the crew is closing it.
            </>
          ) : (
            <>Your dawn is {destName}&apos;s already — the job now is keeping it.</>
          )}
        </p>

        {/* Before anything is locked, "banked ~0h" reads as failure against a
            brand that promises "land at 100%". Say what is still ahead instead. */}
        <p className="dawn-note">
          {bankedH > 0
            ? `Banked ~${bankedH}h of the ${shiftH}h shift; the rest lands in ${destName} daylight.`
            : `${shiftH}h of clock to shift, and nothing banked yet — the crew takes it day by day, and every locked day pulls your dawn closer.`}
        </p>
      </div>

      {/* Always populated. The old guard hid the only figure in this panel
          pre-run, which left a hole exactly where a first-time visitor looks. */}
      <div className="stats hl-stats">
        <div className="stat">
          <em>{shiftH}h</em>
          to shift
        </div>
        <div className="stat">
          <em>{readinessPct > 0 ? `${readinessPct}%` : `${bankedH}h`}</em>
          {readinessPct > 0 ? "of shift locked" : "banked so far"}
        </div>
      </div>
    </div>
  );
}