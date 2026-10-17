"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { HeroDawnPanel } from "@/components/HeroDawnPanel";
import { WindowSeat } from "@/components/globe/WindowSeat";
import { DEMO_TRIP } from "@/domain/fixtures";
import { solarZenithDeg, subsolarPoint } from "@/domain/sun";
import { SKY_BAND_LABEL, skyBand } from "@/domain/sky";
import { localClock } from "@/domain/timezones";
import { easeInOut } from "@/lib/globe/great-circle";
import { motion, MotionConfig } from "framer-motion";
import type { CityHover, FrameStats } from "@/components/globe/DawnGlobeR3F";

// Tier 1 spike host: the WebGL dawn globe beside the shipped SVG hero, on one
// screen, so the two can be compared by eye and by number.
//
// Three things this page is deliberately built to answer:
//
//   1. Does the R3F globe draw the same world the SVG hero does? The solar
//      model is shared (domain/sun), so it must — and if it ever doesn't,
//      tests/globe-port.test.ts goes red first.
//   2. What does a frame actually cost? `WorldLens` regenerates 177 country
//      paths every frame in globe mode; the read-out here reports the GPU
//      path's real p50/p95 and draw calls so that can be compared.
//   3. What happens when WebGL is missing or the demo laptop's GPU is having a
//      bad day? `?svg=1` (or any no-WebGL browser) renders the shipped hero
//      instead. That switch is the insurance policy for a live demo, and it
//      costs one ternary.
//
// `ssr: false` is mandatory, not stylistic: a WebGL context does not exist on
// the server, and rendering <Canvas> there throws.

const DawnGlobeCanvas = dynamic(
  () => import("@/components/globe/DawnGlobeR3F").then((m) => m.DawnGlobeCanvas),
  { ssr: false, loading: () => <BootNote>compiling shaders…</BootNote> },
);

/** The flight, as a hairline along the frame's bottom edge: the route's
 *  ground track, readable without looking away from the globe. Appears only
 *  while the flight is in motion — a parked dial needs no chrome. */
function PlanetHairline({ flightT, flying }: { flightT: number; flying: boolean }) {
  const alive = flying || (flightT > 0 && flightT < 1);
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-br-2xl bg-sun-dest transition-opacity duration-300"
      style={{ width: `${flightT * 100}%`, opacity: alive ? 1 : 0 }}
    />
  );
}

function BootNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-[420px] w-full items-center justify-center rounded-2xl border border-clay-line bg-ink font-mono2 text-xs text-mist">
      {children}
    </div>
  );
}

function webglAvailable(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    return Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

// Probing WebGL needs `document`, so it cannot happen during SSR. Resolved
// through useSyncExternalStore rather than a mount effect for the same reason
// HeroDawnPanel does it: the server snapshot is `false`, so the first paint and
// the hydration pass agree instead of the canvas popping in a frame later.
let webglCache: boolean | null = null;
const noopSubscribe = () => () => {};
const webglStore = {
  subscribe: noopSubscribe,
  getSnapshot: () => (webglCache ??= webglAvailable()),
  getServerSnapshot: () => false,
};

/** True once we are on the client. Gates anything that reads `window`. */
let mountedCache = false;
const mountedStore = {
  subscribe: noopSubscribe,
  getSnapshot: () => mountedCache || (mountedCache = true),
  getServerSnapshot: () => false,
};

/**
 * A 4Hz clock, shared by the globe and the window seat.
 *
 * Two constraints shape this. `useSyncExternalStore` because the server has no
 * clock and the panes read real solar altitude — a lazy `new Date()` bakes the
 * server's time into the first paint and React throws the tree away on
 * hydration. And a *stable* snapshot reference between ticks, because
 * `getSnapshot` returning a fresh `Date` every call would re-render forever.
 * So `currentNow` is only reassigned inside the interval, and both the server
 * snapshot and the first client render see `null`.
 */
let currentNow: Date | null = null;
const nowListeners = new Set<() => void>();
let nowTimer: ReturnType<typeof setInterval> | null = null;
function subscribeNow(cb: () => void) {
  nowListeners.add(cb);
  if (nowTimer === null) {
    nowTimer = setInterval(() => {
      currentNow = new Date();
      for (const l of nowListeners) l();
    }, 250);
  }
  return () => {
    nowListeners.delete(cb);
    if (nowListeners.size === 0 && nowTimer !== null) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  };
}
const getNowSnapshot = () => currentNow;
const getServerNow = () => null;

const OWED_STEPS = [480, 360, 240, 120, 60, 30, 15, 0];
/** Seconds for the full great-circle flight. The archive script gives the Window
 *  Seat 20s of an 85s cut; this is the same order of magnitude — long enough to
 *  read the terminator sweeping past. */
const FLIGHT_SECONDS = 20;

export default function GlobeSpikePage() {
  const mounted = useSyncExternalStore(mountedStore.subscribe, mountedStore.getSnapshot, mountedStore.getServerSnapshot);
  const hasWebGL = useSyncExternalStore(webglStore.subscribe, webglStore.getSnapshot, webglStore.getServerSnapshot);
  const [forcedSvg, setForcedSvg] = useState(false);
  const [owedIdx, setOwedIdx] = useState(0);
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [hover, setHover] = useState<CityHover | null>(null);
  const [flightT, setFlightT] = useState(0);
  const [flying, setFlying] = useState(false);
  // The “drag to spin” hint is for first contact only: it retires the moment the
  // canvas sees a pointer-down, and never returns — a coach mark that keeps
  // nagging is worse than none.
  const [hintSeen, setHintSeen] = useState(false);

  // The camera reads progress from a ref every frame; state only mirrors it for
  // the read-out, so React is not re-rendering sixty times a second.
  const flightRef = useRef(0);

  const date = useSyncExternalStore(subscribeNow, getNowSnapshot, getServerNow);

  // The flight dial. Autoplay walks the ref and mirrors to state at ~10Hz,
  // which is roughly the rate a person can read a number at.
  useEffect(() => {
    if (!flying) return;
    let raf = 0;
    let last = performance.now();
    let mirror = 0;
    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      flightRef.current = Math.min(1, flightRef.current + dt / FLIGHT_SECONDS);
      if (now - mirror > 100) {
        mirror = now;
        setFlightT(flightRef.current);
      }
      if (flightRef.current >= 1) {
        setFlying(false);
        setFlightT(1);
        return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [flying]);

  const svgForced = forcedSvg || (mounted && new URLSearchParams(window.location.search).has("svg"));
  const owedMin = OWED_STEPS[owedIdx] ?? 0;
  const useSvg = svgForced || !hasWebGL;

  // Both surfaces are handed the same two inputs. If they disagree, it is the
  // rendering, never the data.
  const scene = useMemo(
    () => ({
      date: date ?? new Date(0),
      owedMin,
      requiredShiftMin: DEMO_TRIP.requiredShiftMin,
      trip: DEMO_TRIP,
      flightProgress: flightRef,
      flying,
      onHover: setHover,
      hoverPoint: hover ? { lat: hover.lat, lon: hover.lon } : null,
    }),
    [date, owedMin, flying, hover],
  );

  // The tooltip's sun line, from the same solar model as the terminator. The
  // band word comes from the shared `SKY_BAND_LABEL`, so the tooltip and the
  // Window Seat's panes describe identical twilight with identical words.
  const hoverSub = useMemo(() => (date ? subsolarPoint(date) : null), [date]);
  const hoverSunAlt =
    hover && hoverSub ? 90 - solarZenithDeg(hover.lat, hover.lon, hoverSub) : null;

  return (
    <MotionConfig reducedMotion="user">
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <Link href="/" className="text-xs text-clay-2 hover:text-clay">← Today</Link>
        <h1 className="mt-2 text-xl font-bold tracking-[0.18em] text-clay">GLOBE SPIKE · TIER 1</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-clay-2">
          The WebGL dawn globe against the shipped SVG hero, sharing one solar model.
          Drag to orbit, scroll to zoom. Everything below the disc is the same read
          in words.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-clay-2">
            WebGL — {mounted && useSvg ? "unavailable, showing fallback" : "live"}
          </h2>
          {!mounted || useSvg ? (
            <BootNote>{!mounted ? "probing webgl…" : svgForced ? "svg fallback forced via ?svg=1" : "no webgl on this device"}</BootNote>
          ) : (
            <div
              className="relative h-[420px] cursor-grab overflow-hidden rounded-2xl border border-clay-line bg-ink active:cursor-grabbing"
              onPointerDownCapture={() => setHintSeen(true)}
            >
              <DawnGlobeCanvas className="h-full w-full" {...scene} onStats={setStats} />
              {/* Flight hairline: the route's ground track, along the bottom edge
                  of frame. Readable at arm's length while the eye stays on the
                  globe, gone again when the dial parks. */}
              <PlanetHairline flightT={flightT} flying={flying} />
              {/* Hover read-out. Everything here is computed — the daylight
                  flag is `isDaylight`, the sun line is `solarZenithDeg`, the
                  same calls the terminator shader makes, so the tooltip can
                  never contradict the picture. The little fade is keyed on the
                  place itself, so each city arrives with its own bloom. */}
              {hover && (
                <motion.div
                  key={`h-${hover.code || "cluster"}-${hover.lat.toFixed(2)}-${hover.lon.toFixed(2)}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="pointer-events-none absolute left-3 top-3 min-w-[11rem] rounded-lg border border-line bg-ink-2/95 px-3 py-2 backdrop-blur"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono2 text-sm font-bold text-paper">
                      {hover.code || "one light"}
                    </span>
                    {hover.code && hover.name && (
                      <span className="max-w-[9rem] truncate text-[11px] font-normal text-mist">
                        {hover.name}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono2 text-[10px] uppercase tracking-[0.12em] text-mist">
                    {hover.tz && date && (
                      <span className="text-paper">{localClock(hover.tz, date)}</span>
                    )}
                    {hover.tz && date && " · "}
                    <span className={hover.daylight ? "text-sun-dest" : "text-sleep"}>
                      {hoverSunAlt === null
                        ? hover.daylight
                          ? "daylight"
                          : "night"
                        : SKY_BAND_LABEL[skyBand(hoverSunAlt)]}
                    </span>
                    {hoverSunAlt !== null && (
                      <span>
                        {" · sun "}
                        {hoverSunAlt >= 0 ? "+" : "−"}
                        {Math.abs(hoverSunAlt).toFixed(1)}°
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono2 text-[10px] text-clay-3">
                    {hover.lat.toFixed(1)}, {hover.lon.toFixed(1)}
                    {(hover.count ?? 1) > 1 && ` · one light for ${hover.count} airports`}
                  </div>
                </motion.div>
              )}
              {!hintSeen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7, duration: 0.4 }}
                  className="pointer-events-none absolute inset-x-0 bottom-5 mx-auto w-fit rounded-full border border-white/10 bg-ink-2/85 px-3 py-1 font-mono2 text-2xs text-mist backdrop-blur"
                >
                  drag to spin · scroll to zoom · fly the route below
                </motion.div>
              )}
            </div>
          )}
          {stats && (
            <dl className="mt-3 grid grid-cols-5 gap-2 font-mono2 text-xs">
              {(
                [
                  ["fps", String(stats.fps)],
                  ["p50", `${stats.p50}ms`],
                  ["p95", `${stats.p95}ms`],
                  ["draws", String(stats.drawCalls)],
                  ["tris", stats.triangles.toLocaleString()],
                ] as const
              ).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-clay-line bg-cream-card px-2 py-1.5">
                  <dt className="text-[10px] uppercase tracking-[0.1em] text-clay-2">{k}</dt>
                  <dd className="font-bold text-clay">{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-clay-2">
            SVG hero — shipped
          </h2>
          <div className="overflow-hidden rounded-2xl border border-clay-line bg-cream-card p-4">
            <HeroDawnPanel
              trip={DEMO_TRIP}
              owedMin={owedMin}
              beam={null}
              readinessPct={0.42}
              readinessSource="preview"
            />
          </div>
        </section>
      </div>

      <section className="mt-8 rounded-2xl border border-clay-line bg-cream-card p-4">
        <label className="text-xs font-bold uppercase tracking-[0.14em] text-clay-2" htmlFor="owed">
          minutes the body still owes
        </label>
        <input
          id="owed"
          type="range"
          min={0}
          max={OWED_STEPS.length - 1}
          step={1}
          value={owedIdx}
          onChange={(e) => setOwedIdx(Number(e.target.value))}
          style={{ width: "100%", marginTop: 10 }}
        />
        <div className="mt-2 flex items-baseline justify-between font-mono2 text-xs">
          <span className="font-bold text-clay">
            owed {owedMin}m — ghost {owedMin >= 6 ? "drawn" : "hidden (below the 6m threshold)"}
          </span>
          <button
            type="button"
            onClick={() => setForcedSvg((v) => !v)}
            className="rounded-lg border border-clay-line px-3 py-1.5 text-clay-2 hover:text-clay"
          >
            {forcedSvg ? "use webgl" : "force svg fallback"}
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-clay-2">
          Both discs read the same <code className="font-mono2">subsolarPoint</code> and{" "}
          <code className="font-mono2">bodySubsolarPoint</code>. The ghost vanishing below 6
          minutes is <code className="font-mono2">GHOST_VISIBLE_MIN</code>, not a render
          setting — the WebGL version honours the same cutoff rather than drawing a
          line on top of itself.
        </p>
      </section>
      <section className="mt-6 rounded-2xl border border-clay-line bg-cream-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-clay-2">
            flight — the great circle
          </h2>
          <div className="font-mono2 text-xs text-clay">
            route {Math.round(easeInOut(flightT) * 100)}% · {DEMO_TRIP.origin.code} →{" "}
            {DEMO_TRIP.destination.code}
          </div>
        </div>
        <input
          aria-label="Flight progress"
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(flightT * 1000)}
          onChange={(e) => {
            const v = Number(e.target.value) / 1000;
            flightRef.current = v;
            setFlightT(v);
            setFlying(false);
          }}
          style={{ width: "100%", marginTop: 10 }}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (flightRef.current >= 1) {
                flightRef.current = 0;
                setFlightT(0);
              }
              setFlying((f) => !f);
            }}
            className="rounded-lg border border-clay-line bg-paper px-4 py-2 text-sm font-bold text-ink"
          >
            {flying ? "pause" : flightT >= 1 ? "fly again" : "fly the route"}
          </button>
          <button
            type="button"
            onClick={() => {
              flightRef.current = 0;
              setFlightT(0);
              setFlying(false);
            }}
            className="rounded-lg border border-clay-line px-4 py-2 text-sm text-clay-2 hover:text-clay"
          >
            rewind
          </button>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-clay-2">
          The dial is *time* through the 20s flight; the read-out above shows where on the route
          the camera actually is (the same ease the camera runs). The camera rides the same{" "}
          <code className="font-mono2">geoInterpolate</code> arc the SVG
          lens draws, and it eases from rest and arrives at rest. Orbiting is disabled while it
          flies so the two never fight for the same camera. Hover any city light for its real
          local daylight state.
        </p>
      </section>
      <section className="mt-6 rounded-2xl border border-clay-line bg-cream-card p-5">
        <WindowSeat trip={DEMO_TRIP} date={date} owedMin={owedMin} />
      </section>
    </main>
    </MotionConfig>
  );
}