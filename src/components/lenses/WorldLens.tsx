"use client";

import { useEffect, useState } from "react";
import type { Trip } from "@/domain/types";
import { utcOffsetMinOn } from "@/domain/timezones";
import airports from "@/data/airports.json";
import coastPaths from "@/data/coast-paths.json";

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

function xy(lon: number, lat: number) {
  return { x: ((lon + 180) / 360) * W, y: ((90 - lat) / 180) * H };
}

function lonX(lon: number) {
  const wrapped = ((lon + 180) % 360 + 360) % 360;
  return (wrapped / 360) * W;
}

function terminatorX(lon: number) {
  return lonX(lon);
}

// The world is drawn as its airports — the landmasses emerge from where
// people actually fly. ~1,150 dots, computed once.
const AIRPORT_DOTS = (airports as { lat: number; lon: number }[]).map((a) => xy(a.lon, a.lat));

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export function WorldLens({ trip, progress, citationCount, running, ghostGap = 0 }: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const utcHour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const todayISO = now.toISOString().slice(0, 10);
  const localAt = (c?: { tz?: string }) => {
    if (!c?.tz) return "";
    const utc = now.getUTCHours() * 60 + now.getUTCMinutes();
    return hhmm(((utc + utcOffsetMinOn(c.tz, todayISO)) % 1440 + 1440) % 1440);
  };
  const sunLon = 15 * (12 - utcHour);
  const origin = trip ? xy(trip.origin.lon, trip.origin.lat) : { x: W * 0.3, y: H * 0.4 };
  const dest = trip ? xy(trip.destination.lon, trip.destination.lat) : { x: W * 0.8, y: H * 0.4 };
  // Draw the flight arc the short way when it crosses the antimeridian.
  const lonDelta = trip ? ((trip.destination.lon - trip.origin.lon + 540) % 360) - 180 : 0;
  const destPlot = trip ? { x: origin.x + (lonDelta / 360) * W, y: dest.y } : dest;
  const ghostLon = trip ? sunLon - 90 - ghostGap : -10;
  const mid = { x: (origin.x + destPlot.x) / 2, y: Math.min(origin.y, dest.y, destPlot.y) - 90 };
  const path = `M ${origin.x} ${origin.y} Q ${mid.x} ${mid.y} ${destPlot.x} ${destPlot.y}`;
  // When the arc wraps at ±180° its destination end sits off-screen; draw the
  // continuation shifted by one map width so it re-enters the opposite edge.
  const wrapShift = destPlot.x < 0 ? W : destPlot.x > W ? -W : 0;
  const wrapX = (v: number) => ((v % W) + W) % W;

  return (
    <div className="relative h-full w-full bg-[#050812]">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <defs>
          <linearGradient id="world-night" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#050812" />
            <stop offset="100%" stopColor="#151a2a" />
          </linearGradient>
          {/* warm bleed at the terminator edges — dawn/dusk, not flat cut */}
          <linearGradient id="dawn-glow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffc46b" stopOpacity="0" />
            <stop offset="100%" stopColor="#ffc46b" stopOpacity="0.14" />
          </linearGradient>
          <linearGradient id="dusk-glow" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ffc46b" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#ffc46b" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#world-night)" />
        {/* continents — bundled 110m coastlines, equirectangular */}
        {(coastPaths as string[]).map((d, i) => (
          <path key={i} d={d} fill="#121a2c" stroke="#263252" strokeWidth="0.8" />
        ))}
        {/* the world, drawn as its airports */}
        {AIRPORT_DOTS.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={1.2} fill="#e8eaf2" opacity="0.16" />
        ))}
        {/* sun — parked at the sub-solar point */}
        <circle cx={lonX(sunLon)} cy={H * 0.5} r={14} fill="#ffc46b" opacity="0.18" />
        <circle cx={lonX(sunLon)} cy={H * 0.5} r={5} fill="#ffc46b" opacity="0.9" />
        {/* day is within +/-90 degrees of the sub-solar longitude (night outside) */}
        {(() => {
          const dawnX = terminatorX(sunLon - 90);
          const duskX = terminatorX(sunLon + 90);
          const nightRects = dawnX < duskX
            ? [{ x: 0, w: dawnX }, { x: duskX, w: W - duskX }]
            : [{ x: duskX, w: dawnX - duskX }];
          return nightRects.map((r, i) => (
            <rect key={i} x={r.x} y={0} width={r.w} height={H} fill="#000" opacity="0.45" />
          ));
        })()}
        {/* warm bleed just inside the day band at dawn and dusk */}
        <rect x={terminatorX(sunLon - 90)} y={0} width={56} height={H} fill="url(#dawn-glow)" />
        <rect x={terminatorX(sunLon + 90) - 56} y={0} width={56} height={H} fill="url(#dusk-glow)" />
        {/* ghost body-clock terminator, closing to zero as days lock */}
        <rect x={0} y={0} width={terminatorX(ghostLon)} height={H} fill="#ffd98a" opacity="0.08" />
        <line x1={terminatorX(sunLon - 90)} y1={0} x2={terminatorX(sunLon - 90)} y2={H} stroke="#9db8ff" strokeWidth="2" />
        <line x1={terminatorX(sunLon + 90)} y1={0} x2={terminatorX(sunLon + 90)} y2={H} stroke="#9db8ff" strokeWidth="2" />
        <line x1={terminatorX(ghostLon)} y1={0} x2={terminatorX(ghostLon)} y2={H} stroke="#ffd98a" strokeWidth="2" strokeDasharray="6 4" />
        {trip && (
          <text
            x={Math.min(Math.max(terminatorX(ghostLon), 44), W - 44)}
            y={H - 12}
            textAnchor="middle"
            fill="#ffd98a"
            fontSize="12"
            fontWeight="700"
            letterSpacing="2"
          >
            YOUR DAWN
          </text>
        )}

        {/* flight arc */}
        {trip && (
          <>
            <path d={path} fill="none" stroke="#ffc46b" strokeWidth="2" strokeDasharray="8 6" opacity="0.9">
              <animate attributeName="stroke-dashoffset" values="0;-28" dur="1.4s" repeatCount="indefinite" />
            </path>
            {wrapShift !== 0 && (
              <path d={path} transform={`translate(${wrapShift} 0)`} fill="none" stroke="#ffc46b" strokeWidth="2" strokeDasharray="8 6" opacity="0.9">
                <animate attributeName="stroke-dashoffset" values="0;-28" dur="1.4s" repeatCount="indefinite" />
              </path>
            )}
          </>
        )}
        {/* origin + destination */}
        {trip && (
          <>
            <circle cx={origin.x} cy={origin.y} r={6} fill="#9db8ff" />
            <text x={origin.x} y={origin.y + 20} textAnchor="middle" fill="#9db8ff" fontSize="12" fontWeight="600">
              {trip.origin.code}{localAt(trip.origin) && ` · ${localAt(trip.origin)}`}
            </text>
            <circle cx={dest.x} cy={dest.y} r={8} fill="#ffc46b" />
            <text x={dest.x} y={dest.y + 22} textAnchor="middle" fill="#ffc46b" fontSize="12" fontWeight="600">
              {trip.destination.code}{localAt(trip.destination) && ` · ${localAt(trip.destination)}`}
            </text>
          </>
        )}

        {/* body position along the arc — you, mid-flight */}
        {trip && (() => {
          const bx = wrapX(progressWeight(progress, origin.x, destPlot.x, mid.x));
          const by = progressWeight(progress, origin.y, destPlot.y, mid.y);
          return (
            <>
              <circle cx={bx} cy={by} r={9} fill="none" stroke="#ffd98a" strokeWidth="1" opacity="0.6">
                <animate attributeName="r" values="9;17;9" dur="2.2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.6;0.05;0.6" dur="2.2s" repeatCount="indefinite" />
              </circle>
              <circle cx={bx} cy={by} r={7} fill="#ffd98a" stroke="#fff3d6" strokeWidth="1.5" />
              <text x={bx} y={by - 16} textAnchor="middle" fill="#fff3d6" fontSize="11" fontWeight="700" letterSpacing="2">
                YOU
              </text>
            </>
          );
        })()}

        {/* stars */}
        {[[120, 40], [280, 90], [470, 30], [700, 70], [860, 45]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 2 === 0 ? 1.4 : 0.9} fill="#e8eaf2" opacity="0.35" />
        ))}
      </svg>
      <div className="absolute left-4 top-4 rounded-lg border border-[#1e2637] bg-[#0c1018cc] px-3 py-2 text-[12px] text-[#8b93a7] backdrop-blur">
        <div className="text-[#9db8ff]">real terminator · UTC {String(now.getUTCHours()).padStart(2, "0")}:{String(now.getUTCMinutes()).padStart(2, "0")}</div>
        <div className="text-[#ffd98a]">ghost terminator · body clock</div>
        {running && <div className="mt-1 text-[#b8e356]">mission live · {citationCount} evidence stars</div>}
      </div>
    </div>
  );
}

function progressWeight(t: number, start: number, end: number, control: number) {
  // quadratic bezier position at parameter t
  const u = 1 - t;
  return u * u * start + 2 * u * t * control + t * t * end;
}