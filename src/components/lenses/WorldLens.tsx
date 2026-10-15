"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  geoCircle,
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
} from "d3-geo";
import { feature } from "topojson-client";
import worldTopo from "world-atlas/countries-110m.json";
import { Globe2, Map as MapIcon, Minus, Plus } from "lucide-react";
import type { FeatureCollection, LineString, MultiPolygon, Polygon } from "geojson";
import type { Topology } from "topojson-specification";
import type { Trip } from "@/domain/types";
import { solarZenithDeg, subsolarPoint, wrapLon } from "@/domain/sun";
import { utcOffsetMinOn } from "@/domain/timezones";
import { AIRPORTS, findAirport } from "@/domain/airports";
import { clusterAirports, shouldSplit } from "@/domain/city-lights";

// World rendering follows the primitives in docs/design-vision.md §3a:
// real coastline polygons, the terminator as a geoCircle on the subsolar
// antipode, the ghost as the same circle shifted by the body-clock gap,
// depth as a layer stack, and clamped pan/zoom with inverse-scaled markers.
// The airport dots are grouped by cell (see @/domain/city-lights) so the world
// view reads as city lights and a metro separates into its airports on zoom.
// Two modes share one geometry: "map" is the working instrument, "globe" is
// the stage (Tier-1 Orbit without WebGL) — same circles, same arc.

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
const GLOBE_R = Math.round(H * 0.46);

const worldGeo = feature(
  worldTopo as unknown as Topology,
  (worldTopo as unknown as Topology).objects.countries,
) as FeatureCollection<Polygon | MultiPolygon, { name: string }>;

/** Other people's crossings — the sky is inhabited. Codes resolved from the
 * real airport table; a pair that fails to resolve is simply skipped. */
const AMBIENT_ROUTES: [string, string][] = [
  ["JFK", "CDG"],
  ["SIN", "SFO"],
  ["DXB", "LHR"],
  ["SYD", "LAX"],
  ["GRU", "JNB"],
  ["YYZ", "NRT"],
];

const ambientLegs = AMBIENT_ROUTES.flatMap(([a, b]) => {
  const pa = findAirport(a);
  const pb = findAirport(b);
  return pa && pb ? [{ interp: geoInterpolate([pa.lon, pa.lat], [pb.lon, pb.lat]) }] : [];
});

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** DaySpec index for a Board label ("D-3".."D+1", "Flight"), relative to the
    trip's departure day. Unknown → null. */
function dayIndexForLabel(label: string, departureIndex: number): number | null {
  if (label === "Flight") return departureIndex;
  const m = label.match(/^D([+-])(\d+)$/);
  if (!m) return null;
  return m[1] === "-" ? departureIndex - Number(m[2]) : departureIndex + Number(m[2]);
}

const clampX = (x: number, pad = 64) => Math.min(Math.max(x, pad), W - pad);
const buzz = (ms = 5) => {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
};

export function WorldLens({ trip, progress, citationCount, running, ghostGap = 0, activeLabel }: Props) {
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<"map" | "globe">("map");
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  // Globe rotation in degrees ([lng, lat] feed projection.rotate()).
  const [rot, setRot] = useState({ lng: -30, lat: -18 });
  // Continuous time + ambient traffic: one rAF drives everything that moves.
  // `tick` re-renders each frame; the sun recomputes from Date.now() inside it.
  const [tick, setTick] = useState(0);
  const t0 = useRef(0);
  const gesture = useRef({
    dragging: false,
    moved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    origLng: 0,
    origLat: 0,
  });

  useEffect(() => {
    if (reduce) return;
    let raf = 0;
    let hidden = false;
    const loop = (t: number) => {
      if (!t0.current) t0.current = t;
      setTick((t - t0.current) / 1000);
      if (mode === "globe" && !gesture.current.dragging) {
        setRot((r) => ({ ...r, lng: r.lng + 0.018 })); // slow stage turn
      }
      raf = requestAnimationFrame(loop);
    };
    const onVis = () => {
      hidden = document.visibilityState === "hidden";
      if (!hidden && !raf) raf = requestAnimationFrame(loop);
      if (hidden && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    document.addEventListener("visibilitychange", onVis);
    if (!hidden) raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); };
  }, [reduce, mode]);

  // Static clock for reduced-motion: still true, just not animated.
  useEffect(() => {
    if (!reduce) return;
    const t = setInterval(() => setTick((v) => v + 1), 30_000);
    return () => clearInterval(t);
  }, [reduce]);

  void tick; // every frame is a render — sun, clocks and planes read Date.now() fresh
  const now = new Date();

  // --- projections ---------------------------------------------------------
  // Map: fitted Natural Earth; zoom/pan live in a wrapper <g>. Globe:
  // orthographic disc; drag rotates, the wrapper stays at identity.

  const projection = useMemo(() => {
    if (mode === "globe") {
      return geoOrthographic()
        .scale(GLOBE_R)
        .translate([W / 2, H / 2])
        .rotate([rot.lng, rot.lat])
        .clipAngle(90);
    }
    const p = geoNaturalEarth1().fitExtent(
      [
        [6, 6],
        [W - 6, H - 6],
      ],
      { type: "Sphere" },
    );
    return p.scale(p.scale() * 1.04); // slight overscan so edges bleed under slice crop
  }, [mode, rot]);
  const gen = useMemo(() => geoPath(projection), [projection]);
  const isGlobe = mode === "globe";
  const viewCenter: [number, number] = [-rot.lng, -rot.lat];

  /** On the globe, points on the far hemisphere are still project()able — hide
   * them by angular distance from the view centre instead. On the map every
   * point is visible. */
  const visible = (lon: number, lat: number) =>
    !isGlobe || geoDistance([lon, lat], viewCenter) <= Math.PI / 2;
  const projectVis = (lon: number, lat: number) =>
    visible(lon, lat) ? projection([lon, lat]) : null;

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
  const ghostDawnXY = projectVis(wrapLon(sun.lon - 90 - signedGap), 0);

  const graticulePath = gen(geoGraticule10());
  const spherePath = gen({ type: "Sphere" });
  const countryPaths = useMemo(
    () => worldGeo.features.map((f) => gen(f)).filter((d): d is string => Boolean(d)),
    [gen],
  );
  const allLandPath = countryPaths.join(" ");

  // Projected once: every cluster's centre, plus every member so a split costs
  // no projection work. The lens's own pixels-per-degree follows from the fit.
  // City light brightness keys on the solar zenith at each dot — off in
  // daylight, ramping through twilight, fully lit at night. The rAF tick
  // re-renders every frame anyway, so this stays a plain computation: a memo
  // keyed on time would never hit.
  const { lon: sunLon, lat: sunLat } = sun;
  const lightAt = (lat: number, lon: number) =>
    Math.min(1, Math.max(0, (solarZenithDeg(lat, lon, { lon: sunLon, lat: sunLat }) - 90) / 12));
  const dotClusters = clusterAirports(AIRPORTS)
    .map((c) => ({
      radiusDeg: c.radiusDeg,
      members: c.members,
      xy: projection([c.lon, c.lat]),
      membersLit: c.members
        .map((m) => ({ p: projection([m.lon, m.lat]), l: lightAt(m.lat, m.lon) }))
        .filter((m): m is { p: [number, number]; l: number } => Boolean(m.p)),
      lit: lightAt(c.lat, c.lon),
    }))
    .filter((c) => Boolean(c.xy));
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

  // Ambient arcs are static per projection; only the planes move.
  const ambientArcs = useMemo(
    () =>
      ambientLegs.map((leg, i) => ({
        d: gen({
          type: "LineString",
          coordinates: Array.from({ length: 33 }, (_, j) => leg.interp(j / 32)),
        }),
        phase: i / ambientLegs.length,
      })),
    [gen],
  );

  const originXY = trip ? projectVis(trip.origin.lon, trip.origin.lat) : null;
  const destXY = trip ? projectVis(trip.destination.lon, trip.destination.lat) : null;
  const youXY = trip && flight ? projectVis(...(flight.interp(progress) as [number, number])) : null;
  const wakeXY = trip && flight ? projectVis(...(flight.interp(Math.max(0, progress - 0.045)) as [number, number])) : null;
  const sunXY = projectVis(sun.lon, sun.lat);

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
      if (isGlobe) return; // the globe spins, it doesn't zoom
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
    gesture.current.origLng = rot.lng;
    gesture.current.origLat = rot.lat;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!gesture.current.dragging) return;
    const dx = e.clientX - gesture.current.startX;
    const dy = e.clientY - gesture.current.startY;
    if (Math.hypot(dx, dy) > 4) gesture.current.moved = true;
    if (isGlobe) {
      const el = svgRef.current;
      const k = el ? Math.max(el.getBoundingClientRect().width / W, el.getBoundingClientRect().height / H) : 1;
      setRot({
        lng: gesture.current.origLng + (dx / k) * 0.5,
        lat: Math.max(-60, Math.min(60, gesture.current.origLat - (dy / k) * 0.5)),
      });
      return;
    }
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
    if (gesture.current.moved || isGlobe) return;
    if (view.scale >= 4) return resetView();
    const { sx, sy } = clientToSvg(e.clientX, e.clientY);
    zoomAround(view.scale * 2, sx, sy);
  };

  // Inverse scale: markers and labels stay readable from 1× to 8×.
  const invScale = isGlobe ? 1 : 1 / Math.pow(Math.max(1, view.scale), 0.78);
  const zoomed = view.scale > 1.02 || Math.hypot(view.x, view.y) > 4;

  // The dot layer depends on zoom alone: panning moves the group's transform
  // and leaves all ~700–1,150 circles untouched. On the globe the dots sit out
  // entirely — the stage doesn't need them and a rotating sphere shouldn't
  // re-diff ~700 nodes per frame. Plain computation: the rAF tick re-renders
  // every frame regardless, so a memo keyed on these values would never hit.
  const dotLayer = (() => {
    if (isGlobe) return null;
    const ppd = pxPerDeg * view.scale;
    const memberR = 1.3 / view.scale; // a constant few px on screen at any zoom
    return dotClusters.map((c, i) => {
      if (shouldSplit(c.radiusDeg, ppd)) {
        return c.membersLit.map((m, j) => (
          <circle
            key={`${i}-${j}`}
            cx={m.p[0]}
            cy={m.p[1]}
            r={memberR}
            fill="var(--color-paper)"
            opacity={0.05 + m.l * 0.3}
          />
        ));
      }
      const extra = c.members.length - 1;
      return (
        <circle
          key={i}
          cx={c.xy![0]}
          cy={c.xy![1]}
          r={0.9 + Math.min(1.6, 0.34 * extra)}
          fill="var(--color-paper)"
          opacity={0.04 + c.lit * (0.12 + Math.min(0.24, 0.055 * extra))}
        />
      );
    });
  })();

  const markerLabel = (x: number) => clampX(x) - x; // label shift, keeps text in frame

  return (
    <div className="relative h-full w-full overflow-hidden bg-ink select-none">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={mode}
          className="h-full w-full"
          initial={reduce ? false : { opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={reduce ? undefined : { opacity: 0, scale: 1.03 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
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
              {/* globe sphere + rim: the Orbit stage, same ocean ramp lit from
                  above-left and an atmosphere bleed just outside the limb */}
              <radialGradient id="sphere" cx="38%" cy="32%" r="72%">
                <stop offset="0%" stopColor="#16233f" />
                <stop offset="70%" stopColor="#0a1120" />
                <stop offset="100%" stopColor="#070c18" />
              </radialGradient>
              <radialGradient id="atmo" cx="50%" cy="50%" r="50%">
                <stop offset="80%" stopColor="#9db8ff" stopOpacity="0" />
                <stop offset="100%" stopColor="#9db8ff" stopOpacity="0.22" />
              </radialGradient>
              <filter id="coastal-halo" x="-15%" y="-15%" width="130%" height="130%">
                <feGaussianBlur stdDeviation="7" />
              </filter>
              <filter id="night-soft" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" />
              </filter>
            </defs>

            <rect width={W} height={H} fill="url(#ocean)" />

            {isGlobe && (
              <>
                <circle cx={W / 2} cy={H / 2} r={GLOBE_R + 10} fill="url(#atmo)" />
                <circle cx={W / 2} cy={H / 2} r={GLOBE_R} fill="url(#sphere)" />
              </>
            )}

            <g
              transform={
                isGlobe
                  ? undefined
                  : `translate(${W / 2 + view.x} ${H / 2 + view.y}) scale(${view.scale}) translate(${-W / 2} ${-H / 2})`
              }
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
                  fill={isGlobe ? "#141d33" : "url(#land)"}
                  stroke="#27324e"
                  strokeWidth={0.5}
                />
              ))}

              {/* airport constellation — city lights that only burn on the
                  night side, denser cities brighter, and a group separates
                  into its airports once it has spread (map mode only) */}
              {dotLayer}

              {/* ambient traffic — faint crossings that never sleep */}
              {!reduce &&
                ambientArcs.map((a, i) => {
                  const t = (tick * 0.03 + a.phase) % 1;
                  const ll = ambientLegs[i].interp(t);
                  const xy = projectVis(ll[0], ll[1]);
                  return (
                    <g key={i}>
                      <path
                        d={a.d ?? undefined}
                        fill="none"
                        stroke="var(--color-mist)"
                        strokeWidth={0.8}
                        opacity={0.14}
                      />
                      {xy && <circle cx={xy[0]} cy={xy[1]} r={1.6} fill="var(--color-paper)" opacity={0.55} />}
                    </g>
                  );
                })}

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
                  strokeWidth={2 / Math.pow(isGlobe ? 1 : view.scale, 0.4)}
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                  opacity={0.95}
                >
                  {!reduce && (
                    <animate attributeName="stroke-dashoffset" values="0;-28" dur="1.4s" repeatCount="indefinite" />
                  )}
                </path>
              )}

              {/* you — riding the arc, with a short wake where you just were */}
              {trip && wakeXY && (
                <circle cx={wakeXY[0]} cy={wakeXY[1]} r={3} fill="var(--color-ghost)" opacity={0.4} />
              )}

              {/* origin / destination / you — inverse-scaled so zoom never eats them.
                  While a day is being planned or judged, its endpoints pulse so a
                  judge parked on World still sees where the work is happening. */}
              {trip && originXY && (
                <g transform={`translate(${originXY[0]} ${originXY[1]}) scale(${invScale})`}>
                  {(() => {
                    const dayIdx = activeLabel ? dayIndexForLabel(activeLabel, trip.departureDayIndex) : null;
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
                    x={markerLabel(originXY[0])}
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
                    const dayIdx = activeLabel ? dayIndexForLabel(activeLabel, trip.departureDayIndex) : null;
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
                    x={markerLabel(destXY[0])}
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
                <g transform={`translate(${clampX(ghostDawnXY[0])} ${ghostDawnXY[1]}) scale(${invScale})`}>
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
              {sunXY && (
                <g transform={`translate(${sunXY[0]} ${sunXY[1]}) scale(${invScale})`}>
                  <circle r={13} fill="var(--color-sun-dest)" opacity={0.18} />
                  <circle r={4.5} fill="var(--color-sun-dest)" opacity={0.95} />
                </g>
              )}
            </g>

            {/* globe limb — a clean rim over the spinning world */}
            {isGlobe && spherePath && (
              <circle
                cx={W / 2}
                cy={H / 2}
                r={GLOBE_R}
                fill="none"
                stroke="var(--color-paper)"
                strokeWidth={1.2}
                opacity={0.35}
              />
            )}
          </svg>
        </motion.div>
      </AnimatePresence>

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

      {/* mode + zoom controls */}
      <div className="absolute right-4 top-4 flex items-center gap-1">
        <div className="flex items-center rounded-full border border-white/10 bg-ink-2/80 p-1 backdrop-blur-md">
          <button
            type="button"
            aria-pressed={mode === "map"}
            aria-label="Flat map view"
            onClick={() => { buzz(4); setMode("map"); }}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              mode === "map" ? "bg-paper text-ink" : "text-mist hover:text-paper"
            }`}
          >
            <MapIcon size={13} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            aria-pressed={mode === "globe"}
            aria-label="Globe view"
            onClick={() => { buzz(4); setMode("globe"); }}
            className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
              mode === "globe" ? "bg-paper text-ink" : "text-mist hover:text-paper"
            }`}
          >
            <Globe2 size={13} strokeWidth={2.5} />
          </button>
        </div>
        {!isGlobe && (
          <div className="flex items-center gap-1 rounded-full border border-white/10 bg-ink-2/80 p-1 backdrop-blur-md">
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => { buzz(4); zoomAround(view.scale * 1.45); }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-mist transition-colors hover:bg-white/10 hover:text-paper"
            >
              <Plus size={13} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => {
                buzz(4);
                if (view.scale / 1.45 <= 1.05) resetView();
                else zoomAround(view.scale / 1.45);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-mist transition-colors hover:bg-white/10 hover:text-paper"
            >
              <Minus size={13} strokeWidth={2.5} />
            </button>
            {zoomed && (
              <button
                type="button"
                aria-label="Reset map view"
                onClick={() => { buzz(4); resetView(); }}
                className="rounded-full bg-paper px-2 py-0.5 font-mono2 text-[12px] font-bold text-ink"
              >
                1x
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
