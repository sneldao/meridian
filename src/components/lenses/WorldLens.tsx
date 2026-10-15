"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  geoCircle,
  geoGraticule10,
  geoInterpolate,
  geoNaturalEarth1,
  geoPath,
} from "d3-geo";
import { feature } from "topojson-client";
import worldTopo from "world-atlas/countries-110m.json";
import { Minus, Plus } from "lucide-react";
import type { FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import type { Topology } from "topojson-specification";
import type { Trip } from "@/domain/types";
import { subsolarPoint, wrapLon } from "@/domain/sun";
import { utcOffsetMinOn } from "@/domain/timezones";
import { AIRPORTS } from "@/domain/airports";
import { clusterAirports, shouldSplit } from "@/domain/city-lights";

// World rendering follows the primitives in docs/design-vision.md §3a:
// real coastline polygons, the terminator as a geoCircle on the subsolar
// antipode, the ghost as the same circle shifted by the body-clock gap,
// depth as a layer stack, and clamped pan/zoom with inverse-scaled markers.
// The airport dots are grouped by cell (see @/domain/city-lights) so the world
// view reads as city lights and a metro separates into its airports on zoom.

interface Props {
  trip: Trip | null;
  progress: number;
  lockedLabels: Set<string>;
  activeLabel?: string;
  citationCount: number;
  running: boolean;
  ghostGap?: number;
}

const W = 1000;
const H = 520;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

const worldGeo = feature(
  worldTopo as unknown as Topology,
  (worldTopo as unknown as Topology).objects.countries,
) as FeatureCollection<Polygon | MultiPolygon, { name: string }>;

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** DaySpec index for a Board label ("D-3".."D+1", "Flight"). Unknown → null. */
function dayIndexForLabel(label: string): number | null {
  if (label === "Flight") return 3;
  const m = label.match(/^D([+-])(\d+)$/);
  if (!m) return null;
  return m[1] === "-" ? 3 - Number(m[2]) : 3 + Number(m[2]);
}

export function WorldLens({ trip, progress, citationCount, running, ghostGap = 0, activeLabel }: Props) {
  const reduce = useReducedMotion();
  const [now, setNow] = useState(() => new Date());
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const gesture = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  // The base projection is fitted once; zoom/pan live in a wrapper transform
  // so d3 keeps doing what it's good at (sphere math) while the <g> handles
  // viewport math.
  const projection = useMemo(() => {
    const p = geoNaturalEarth1().fitExtent(
      [
        [6, 6],
        [W - 6, H - 6],
      ],
      { type: "Sphere" },
    );
    return p.scale(p.scale() * 1.04); // slight overscan so edges bleed under slice crop
  }, []);
  const gen = useMemo(() => geoPath(projection), [projection]);

  const todayISO = now.toISOString().slice(0, 10);
  const localAt = (c?: { tz?: string }) => {
    if (!c?.tz) return "";
    const utc = now.getUTCHours() * 60 + now.getUTCMinutes();
    return hhmm(((utc + utcOffsetMinOn(c.tz, todayISO)) % 1440 + 1440) % 1440);
  };

  const sun = subsolarPoint(now);
  const antipode: [number, number] = [wrapLon(sun.lon + 180), -sun.lat];

  // Day/night: a 90° circle around the subsolar antipode. The 96° circle
  // underneath shows through as the twilight band on the day side.
  const nightPath = gen(geoCircle().center(antipode).radius(90).precision(1)());
  const twilightPath = gen(geoCircle().center(antipode).radius(96).precision(1)());
  const terminatorPath = gen(geoCircle().center(antipode).radius(90).precision(0.5)());

  // Ghost: the body's own terminator — same circle, sun longitude shifted by
  // the signed gap the plan still has to close. Eastward trips (negative
  // requiredShiftMin) leave the body's dawn behind (west of) the real one;
  // westbound trips put it ahead, so the sign matters.
  const signedGap = -ghostGap * Math.sign(trip?.requiredShiftMin ?? -1);
  const ghostPath = ghostGap
    ? gen(
        geoCircle()
          .center([wrapLon(sun.lon - signedGap + 180), -sun.lat])
          .radius(90)
          .precision(1)(),
      )
    : null;
  const ghostDawnXY = projection([wrapLon(sun.lon - 90 - signedGap), 0]);

  const graticulePath = gen(geoGraticule10());
  const countryPaths = useMemo(
    () => worldGeo.features.map((f) => gen(f)).filter((d): d is string => Boolean(d)),
    [gen],
  );
  const allLandPath = countryPaths.join(" ");

  // Projected once: every cluster's centre, plus every member so a split costs
  // no projection work. The lens's own pixels-per-degree follows from the fit.
  const dotClusters = useMemo(
    () =>
      clusterAirports(AIRPORTS)
        .map((c) => {
          const xy = projection([c.lon, c.lat]);
          if (!xy) return null;
          return {
            radiusDeg: c.radiusDeg,
            members: c.members,
            xy,
            membersXY: c.members
              .map((m) => projection([m.lon, m.lat]))
              .filter((p): p is [number, number] => Boolean(p)),
          };
        })
        .filter((c): c is NonNullable<typeof c> => Boolean(c)),
    [projection],
  );
  const pxPerDeg = (projection.scale() * Math.PI) / 180;

  // Great-circle flight arc — geoInterpolate takes the short way across the
  // antimeridian, and geoPath cuts it at the map edge, so no wrap hack.
  const flight = useMemo(() => {
    if (!trip) return null;
    const interp = geoInterpolate(
      [trip.origin.lon, trip.origin.lat],
      [trip.destination.lon, trip.destination.lat],
    );
    const line: LineString = {
      type: "LineString",
      coordinates: Array.from({ length: 65 }, (_, i) => interp(i / 64)),
    };
    return { d: gen(line), interp };
  }, [trip, gen]);

  const originXY = trip ? projection([trip.origin.lon, trip.origin.lat]) : null;
  const destXY = trip ? projection([trip.destination.lon, trip.destination.lat]) : null;
  const youXY = trip && flight ? projection(flight.interp(progress)) : null;

  // --- gestures -------------------------------------------------------------

  const clampView = (x: number, y: number, scale: number) => {
    const s = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
    const maxX = 40 * s + ((s - 1) * W) / 2;
    const maxY = 24 * s + ((s - 1) * H) / 2;
    return {
      scale: s,
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  /** Client px → SVG viewBox units, accounting for preserveAspectRatio slice. */
  const clientToSvg = (clientX: number, clientY: number) => {
    const el = svgRef.current;
    if (!el) return { sx: W / 2, sy: H / 2 };
    const rect = el.getBoundingClientRect();
    const sliceScale = Math.max(rect.width / W, rect.height / H) || 1;
    const offsetX = (rect.width - W * sliceScale) / 2;
    const offsetY = (rect.height - H * sliceScale) / 2;
    return {
      sx: (clientX - rect.left - offsetX) / sliceScale,
      sy: (clientY - rect.top - offsetY) / sliceScale,
    };
  };

  const zoomAround = (next: number, sx = W / 2, sy = H / 2) =>
    setView((prev) => {
      const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
      const ratio = scale / prev.scale;
      return clampView(
        sx - W / 2 - ratio * (sx - W / 2 - prev.x),
        sy - H / 2 - ratio * (sy - H / 2 - prev.y),
        scale,
      );
    });

  const resetView = () => setView({ scale: 1, x: 0, y: 0 });

  // Non-passive wheel listener — React's onWheel can't preventDefault.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { sx, sy } = clientToSvg(e.clientX, e.clientY);
      zoomAround(view.scale * (e.deltaY < 0 ? 1.18 : 0.85), sx, sy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    gesture.current.dragging = true;
    gesture.current.moved = false;
    gesture.current.startX = e.clientX;
    gesture.current.startY = e.clientY;
    gesture.current.origX = view.x;
    gesture.current.origY = view.y;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!gesture.current.dragging) return;
    const dx = e.clientX - gesture.current.startX;
    const dy = e.clientY - gesture.current.startY;
    if (Math.hypot(dx, dy) > 4) gesture.current.moved = true;
    const el = svgRef.current;
    const k = el ? Math.max(el.getBoundingClientRect().width / W, el.getBoundingClientRect().height / H) : 1;
    setView((prev) =>
      clampView(
        gesture.current.origX + dx / k,
        gesture.current.origY + dy / k,
        prev.scale,
      ),
    );
  };

  const endGesture = () => {
    gesture.current.dragging = false;
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (gesture.current.moved) return;
    if (view.scale >= 4) return resetView();
    const { sx, sy } = clientToSvg(e.clientX, e.clientY);
    zoomAround(view.scale * 2, sx, sy);
  };

  // Inverse scale: markers and labels stay readable from 1× to 8×.
  const invScale = 1 / Math.pow(Math.max(1, view.scale), 0.78);
  const zoomed = view.scale > 1.02 || Math.hypot(view.x, view.y) > 4;

  // The dot layer depends on zoom alone: panning moves the group's transform
  // and leaves all ~700–1,150 circles untouched, so a drag no longer rebuilds
  // them on every pointermove.
  const dotLayer = useMemo(() => {
    const ppd = pxPerDeg * view.scale;
    const memberR = 1.3 / view.scale; // a constant few px on screen at any zoom
    return dotClusters.map((c, i) => {
      if (shouldSplit(c.radiusDeg, ppd)) {
        return c.membersXY.map((p, j) => (
          <circle
            key={`${i}-${j}`}
            cx={p[0]}
            cy={p[1]}
            r={memberR}
            fill="var(--color-paper)"
            opacity={0.32}
          />
        ));
      }
      const extra = c.members.length - 1;
      return (
        <circle
          key={i}
          cx={c.xy[0]}
          cy={c.xy[1]}
          r={0.9 + Math.min(1.6, 0.34 * extra)}
          fill="var(--color-paper)"
          opacity={0.13 + Math.min(0.24, 0.055 * extra)}
        />
      );
    });
  }, [dotClusters, pxPerDeg, view.scale]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid slice"
        className="block h-full w-full cursor-grab touch-none active:cursor-grabbing"
        style={{ touchAction: "none" }}
        aria-label="World map with the real day/night terminator, your body-clock terminator, and the flight arc"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onDoubleClick={onDoubleClick}
      >
        <defs>
          {/* The ocean/land ramp, the coastal shelf and the night fill are the
              map's own paint: one gradient each, no other surface in the app
              uses them, so they stay literal instead of becoming tokens the
              design system would have to keep meaning something. Every colour
              the app *shares* — the two suns, the ghost, pass/fail, paper,
              line — is a token above. */}
          <radialGradient id="ocean" cx="46%" cy="42%" r="80%">
            <stop offset="0%" stopColor="#0d1526" />
            <stop offset="60%" stopColor="#080d1a" />
            <stop offset="100%" stopColor="#050812" />
          </radialGradient>
          {/* Land carries the same light as the sea: one gradient across the
              whole map (userSpaceOnUse, or every country would get its own
              private diagonal and the continents would read as patchwork). */}
          <linearGradient
            id="land"
            gradientUnits="userSpaceOnUse"
            x1={0}
            y1={0}
            x2={W}
            y2={H}
          >
            <stop offset="0%" stopColor="#1c2642" />
            <stop offset="55%" stopColor="#141d33" />
            <stop offset="100%" stopColor="#0e1526" />
          </linearGradient>
          <filter id="coastal-halo" x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="7" />
          </filter>
          <filter id="night-soft" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <rect width={W} height={H} fill="url(#ocean)" />

        <g
          transform={`translate(${W / 2 + view.x} ${H / 2 + view.y}) scale(${view.scale}) translate(${-W / 2} ${-H / 2})`}
        >
          {/* coastal shelf halo — land glows faintly where it meets water */}
          <path
            d={allLandPath}
            fill="none"
            stroke="#3d5a8f"
            strokeWidth={10}
            strokeLinejoin="round"
            filter="url(#coastal-halo)"
            opacity={0.5}
          />

          {/* graticule */}
          <path
            d={graticulePath ?? undefined}
            fill="none"
            stroke="var(--color-line)"
            strokeWidth={0.5}
            strokeDasharray="3 5"
            opacity={0.7}
          />

          {/* the world */}
          {countryPaths.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="url(#land)"
              stroke="#27324e"
              strokeWidth={0.5}
            />
          ))}

          {/* airport constellation — city lights: denser cities burn brighter,
              and a group separates into its airports once it has spread */}
          {dotLayer}

          {/* twilight band on the day side, then the soft-edged night */}
          {twilightPath && <path d={twilightPath} fill="var(--color-sun-dest)" opacity={0.09} />}
          {nightPath && (
            <path d={nightPath} fill="#02040a" opacity={0.62} filter="url(#night-soft)" />
          )}
          {terminatorPath && (
            <path
              d={terminatorPath}
              fill="none"
              stroke="var(--color-sun-home)"
              strokeWidth={1}
              opacity={0.35}
            />
          )}

          {/* the ghost terminator — where your body thinks the sun is.
              While the crew is working (running, gap still open) the dash
              marches — motion that says "working" without needing to read. */}
          {ghostPath && (
            <path
              d={ghostPath}
              fill="none"
              stroke="var(--color-ghost)"
              strokeWidth={1.6}
              strokeDasharray="7 5"
              opacity={0.85}
            >
              {!reduce && running && ghostGap > 0 && (
                <animate attributeName="stroke-dashoffset" values="0;-24" dur="1.1s" repeatCount="indefinite" />
              )}
            </path>
          )}

          {/* flight arc — true great circle */}
          {flight?.d && (
            <path
              d={flight.d}
              fill="none"
              stroke="var(--color-sun-dest)"
              strokeWidth={2 / Math.pow(view.scale, 0.4)}
              strokeDasharray="8 6"
              strokeLinecap="round"
              opacity={0.95}
            >
              {!reduce && (
                <animate attributeName="stroke-dashoffset" values="0;-28" dur="1.4s" repeatCount="indefinite" />
              )}
            </path>
          )}

          {/* origin / destination / you — inverse-scaled so zoom never eats them.
              While a day is being planned or judged, its endpoints pulse so a
              judge parked on World still sees where the work is happening. */}
          {trip && originXY && (
            <g transform={`translate(${originXY[0]} ${originXY[1]}) scale(${invScale})`}>
              {(() => {
                const dayIdx = activeLabel ? dayIndexForLabel(activeLabel) : null;
                const isOriginActive = running && dayIdx !== null && dayIdx <= trip.departureDayIndex;
                return (
                  <>
                    {!reduce && isOriginActive && (
                      <circle r={5} fill="none" stroke="var(--color-sun-home)" strokeWidth={1.2} opacity={0.7}>
                        <animate attributeName="r" values="5;11;5" dur="1.6s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.7;0.1;0.7" dur="1.6s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle r={5} fill="var(--color-sun-home)" stroke="var(--color-paper)" strokeWidth={1.4} />
                  </>
                );
              })()}
              <text
                y={18}
                textAnchor="middle"
                fill="var(--color-sun-home)"
                fontSize={12}
                fontWeight={600}
              >
                {trip.origin.code}
                {localAt(trip.origin) && ` · ${localAt(trip.origin)}`}
              </text>
            </g>
          )}
          {trip && destXY && (
            <g transform={`translate(${destXY[0]} ${destXY[1]}) scale(${invScale})`}>
              {(() => {
                const dayIdx = activeLabel ? dayIndexForLabel(activeLabel) : null;
                const isDestActive = running && dayIdx !== null && dayIdx > trip.departureDayIndex;
                return (
                  <>
                    {!reduce && isDestActive && (
                      <circle r={6.5} fill="none" stroke="var(--color-sun-dest)" strokeWidth={1.2} opacity={0.7}>
                        <animate attributeName="r" values="6.5;13;6.5" dur="1.6s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.7;0.1;0.7" dur="1.6s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle r={6.5} fill="var(--color-sun-dest)" stroke="#fff3d6" strokeWidth={1.4} />
                  </>
                );
              })()}
              <text
                y={21}
                textAnchor="middle"
                fill="var(--color-sun-dest)"
                fontSize={12}
                fontWeight={600}
              >
                {trip.destination.code}
                {localAt(trip.destination) && ` · ${localAt(trip.destination)}`}
              </text>
            </g>
          )}
          {trip && youXY && (
            <g transform={`translate(${youXY[0]} ${youXY[1]}) scale(${invScale})`}>
              {!reduce && (
                <circle r={9} fill="none" stroke="var(--color-ghost)" strokeWidth={1} opacity={0.6}>
                  <animate attributeName="r" values="9;17;9" dur="2.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0.05;0.6" dur="2.2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle r={6.5} fill="var(--color-ghost)" stroke="#fff3d6" strokeWidth={1.5} />
              <text
                y={-15}
                textAnchor="middle"
                fill="#fff3d6"
                fontSize={12}
                fontWeight={700}
                letterSpacing={2}
              >
                YOU
              </text>
            </g>
          )}
          {trip && ghostGap > 0 && ghostDawnXY && (
            <g transform={`translate(${ghostDawnXY[0]} ${ghostDawnXY[1]}) scale(${invScale})`}>
              <circle r={3} fill="var(--color-ghost)" />
              <text
                y={26}
                textAnchor="middle"
                fill="var(--color-ghost)"
                fontSize={12}
                fontWeight={700}
                letterSpacing={2}
              >
                YOUR DAWN
              </text>
            </g>
          )}

          {/* the sun, parked at the true subsolar point */}
          {(() => {
            const sxy = projection([sun.lon, sun.lat]);
            return sxy ? (
              <g transform={`translate(${sxy[0]} ${sxy[1]}) scale(${invScale})`}>
                <circle r={13} fill="var(--color-sun-dest)" opacity={0.18} />
                <circle r={4.5} fill="var(--color-sun-dest)" opacity={0.95} />
              </g>
            ) : null;
          })()}
        </g>
      </svg>

      {/* frosted status pill — floats on the world, no box inside a box */}
      <div className="pointer-events-none absolute left-4 top-4 rounded-full border border-white/10 bg-ink-2/80 px-3.5 py-1.5 font-mono2 text-[12px] backdrop-blur-md">
        <span className="text-sun-home">
          real terminator · UTC {String(now.getUTCHours()).padStart(2, "0")}:
          {String(now.getUTCMinutes()).padStart(2, "0")}
        </span>
        {ghostGap > 0 && (
          <span className="ml-3 text-ghost">
            ghost · body clock {Math.round(ghostGap)}° {trip?.direction === "west" ? "ahead" : "behind"}
          </span>
        )}
        {running && <span className="ml-3 text-progress">live · {citationCount} evidence stars</span>}
      </div>

      {/* zoom controls */}
      <div className="absolute right-4 top-4 flex items-center gap-1 rounded-full border border-white/10 bg-ink-2/80 p-1 backdrop-blur-md">
        <button
          type="button"
          aria-label="Zoom in"
          onClick={() => zoomAround(view.scale * 1.45)}
          className="flex h-7 w-7 items-center justify-center rounded-full text-mist transition-colors hover:bg-white/10 hover:text-paper"
        >
          <Plus size={13} strokeWidth={2.5} />
        </button>
        <button
          type="button"
          aria-label="Zoom out"
          onClick={() => (view.scale / 1.45 <= 1.05 ? resetView() : zoomAround(view.scale / 1.45))}
          className="flex h-7 w-7 items-center justify-center rounded-full text-mist transition-colors hover:bg-white/10 hover:text-paper"
        >
          <Minus size={13} strokeWidth={2.5} />
        </button>
        {zoomed && (
          <button
            type="button"
            aria-label="Reset map view"
            onClick={resetView}
            className="rounded-full bg-paper px-2 py-0.5 font-mono2 text-[12px] font-bold text-ink"
          >
            1x
          </button>
        )}
      </div>
    </div>
  );
}
