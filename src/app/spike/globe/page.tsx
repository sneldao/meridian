"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { HeroDawnPanel } from "@/components/HeroDawnPanel";
import { DEMO_TRIP } from "@/domain/fixtures";
import type { FrameStats } from "@/components/globe/DawnGlobeR3F";

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

const OWED_STEPS = [480, 360, 240, 120, 60, 30, 15, 0];

export default function GlobeSpikePage() {
  const mounted = useSyncExternalStore(mountedStore.subscribe, mountedStore.getSnapshot, mountedStore.getServerSnapshot);
  const hasWebGL = useSyncExternalStore(webglStore.subscribe, webglStore.getSnapshot, webglStore.getServerSnapshot);
  const [forcedSvg, setForcedSvg] = useState(false);
  const [owedIdx, setOwedIdx] = useState(0);
  const [stats, setStats] = useState<FrameStats | null>(null);

  // A ticking clock so the terminator moves at the Earth's real rate, matching
  // the hero's 4Hz rule: sub-pixel per frame, continuous, cheap. The Canvas is
  // `ssr: false` and HeroDawnPanel guards its own time-dependent render behind
  // a hydration flag, so a lazy `new Date()` here cannot mismatch.
  const [date, setDate] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setDate(new Date()), 250);
    return () => clearInterval(id);
  }, []);

  const svgForced = forcedSvg || (mounted && new URLSearchParams(window.location.search).has("svg"));
  const owedMin = OWED_STEPS[owedIdx] ?? 0;
  const useSvg = svgForced || !hasWebGL;

  // Both surfaces are handed the same two inputs. If they disagree, it is the
  // rendering, never the data.
  const scene = useMemo(
    () => ({ date, owedMin, requiredShiftMin: DEMO_TRIP.requiredShiftMin }),
    [date, owedMin],
  );

  return (
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
            <div className="h-[420px] overflow-hidden rounded-2xl border border-clay-line bg-ink">
              <DawnGlobeCanvas className="h-full w-full" {...scene} onStats={setStats} />
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
    </main>
  );
}