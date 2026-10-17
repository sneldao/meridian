"use client";

import { useEffect, useMemo, useState } from "react";
import { useReducedMotion } from "framer-motion";
import {
  geoCircle,
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
import {
  bodySubsolarPoint,
  subsolarPoint,
  terminatorCrossings,
  wrapLon,
} from "@/domain/sun";
import type { Trip } from "@/domain/types";

// The hero's left panel: the traveller's body-clock dawn against the
// destination's, drawn from the same §3a primitives as the world lens
// (docs/plan/design-vision.md) — a geoCircle on the subsolar antipode for the
// real line, the same circle on the body's shifted sun for the ghost. One disc,
// two cities, the residual the plan still owes, and the next light window
// marked where the beam lands. SVG only, no new deps.

const W = 320;
const H = 320;
const R = 140;

const worldGeo = feature(
  worldTopo as unknown as Topology,
  (worldTopo as unknown as Topology).objects.countries,
) as FeatureCollection<Polygon | MultiPolygon, { name: string }>;

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

export function HeroDawnPanel({ trip, owedMin, beam, readinessPct }: HeroDawnPanelProps) {
  // Honest arrival headline: hours banked so far out of the whole shift, never
  // a "100%" claim. readinessPct is the locked share of the required shift.
  const requiredMin = Math.abs(trip.requiredShiftMin);
  const bankedH = Math.round((requiredMin * readinessPct) / 100 / 60 * 10) / 10;
  const shiftH = Math.round(requiredMin / 60);
  const reduce = useReducedMotion();
  // One minute hand, not a rAF loop: the line only moves meaningfully every
  // couple of minutes, and the first paint of the page should not wait on it.
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
  const now = hydrated ? new Date() : new Date(0);

  // Centre the disc between the two cities, so both sit on it and the distance
  // between their dawns is the thing you can see.
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
        .rotate([-centre[0], -centre[1]])
        .clipAngle(90),
    [centre],
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

  const onDisc = (lon: number, lat: number) =>
    geoDistance([lon, lat], centre) <= Math.PI / 2;
  const xy = (lon: number, lat: number) => (onDisc(lon, lat) ? projection([lon, lat]) : null);

  const sub = subsolarPoint(now);
  const antipode: [number, number] = [wrapLon(sub.lon + 180), -sub.lat];
  const night = gen(geoCircle().center(antipode).radius(90).precision(1)());
  const twilight = gen(geoCircle().center(antipode).radius(96).precision(1)());
  const terminator = gen(geoCircle().center(antipode).radius(90).precision(0.5)());

  // The body's own line — only worth a second curve while the gap is open.
  const gapOpen = owedMin >= 6;
  const body = bodySubsolarPoint(sub, owedMin, trip.requiredShiftMin);
  const ghost = gapOpen
    ? gen(
        geoCircle()
          .center([wrapLon(body.lon + 180), -body.lat])
          .radius(90)
          .precision(0.5)(),
      )
    : null;

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

  const gap = gapPhrase(owedMin);
  const destName = trip.destination.name;
  const toward = trip.direction === "west" ? "ahead of" : "behind";

  return (
    <div className="hl">
      <div className="bg term" aria-hidden="true" />
      <div className="sc" />

      {hydrated && (
        <svg
          className="dawn-map"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
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
          {twilight && <path d={twilight} fill="var(--color-sun-dest)" opacity={0.1} />}
          {night && <path d={night} fill="#02040a" opacity={0.62} />}
          {terminator && (
            <path
              d={terminator}
              fill="none"
              stroke="var(--color-sun-home)"
              strokeWidth={1.2}
              opacity={0.8}
            />
          )}
          {ghost && (
            <path
              d={ghost}
              fill="none"
              stroke="var(--color-ghost)"
              strokeWidth={1.8}
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
                opacity={0.45}
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

          {originXY && (
            <g transform={`translate(${originXY[0]} ${originXY[1]})`}>
              <circle r={5} fill="var(--color-sun-home)" stroke="var(--color-paper)" strokeWidth={1.3} />
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
            <g transform={`translate(${destXY[0]} ${destXY[1]})`}>
              <circle r={5.5} fill="var(--color-sun-dest)" stroke="#fff3d6" strokeWidth={1.3} />
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

      {/* The same read the curve gives, in words — a reduced-motion or Guided
          visitor gets the number as a label, never as an animation to infer. */}
      <div className="dawn-cap">
        <div className="dawn-cities">
          <span>
            {trip.origin.name}
            <b>{hydrated ? fmtMin(nowMinOnDay(trip, 0, now)) : "--:--"}</b>
          </span>
          <span>
            {trip.destination.name}
            <b>{hydrated ? fmtMin(nowMinOnDay(trip, trip.departureDayIndex + 1, now)) : "--:--"}</b>
          </span>
        </div>

        <p className="dawn-gap">
          {gap ? (
            <>
              Your dawn is <b>{gap} {toward}</b> {destName}&apos;s — the crew is closing it.
            </>
          ) : (
            <>Your dawn is {destName}&apos;s already — the job now is keeping it.</>
          )}
        </p>

        <p className="dawn-note">
          Banked ~{bankedH}h of the {shiftH}h shift; the rest lands in {destName} daylight.
        </p>

        <div className="dawn-legend">
          <span>
            <svg width="16" height="6" aria-hidden="true">
              <line x1="0" y1="3" x2="16" y2="3" stroke="var(--color-sun-home)" strokeWidth="1.6" />
            </svg>
            the real dawn
          </span>
          <span>
            <svg width="16" height="6" aria-hidden="true">
              <line
                x1="0"
                y1="3"
                x2="16"
                y2="3"
                stroke="var(--color-ghost)"
                strokeWidth="2"
                strokeDasharray="4 3"
              />
            </svg>
            your body&apos;s dawn
          </span>
          {beamTrack && (
            <span>
              <svg width="16" height="6" aria-hidden="true">
                <line
                  x1="0"
                  y1="3"
                  x2="16"
                  y2="3"
                  stroke="var(--color-sun-dest)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  opacity="0.6"
                />
              </svg>
              light {fmtMin(beamTrack.startMin)}–{fmtMin(beamTrack.endMin)}{" "}
              {beamTrack.place.code}
            </span>
          )}
        </div>
      </div>

      {readinessPct > 0 && (
        <div className="stats hl-stats">
          <div className="stat">
            <em>{readinessPct}%</em>of shift locked
          </div>
        </div>
      )}
    </div>
  );
}
