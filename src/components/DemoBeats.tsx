"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  clockLabel,
  DEMO_BEAT_IDS,
  DEMO_BEAT_TITLES,
  demoJourney,
  planRows,
  stakesGapHours,
  sunSelfForBeat,
  type DemoBeatId,
} from "@/domain/demo-beats";
import { StageSun } from "@/components/StageSun";
import { arrivalPassportSvg } from "@/lib/arrival-passport-svg";
import { downloadSunPortrait } from "@/lib/download-sun-portrait";
import { buildTasteItinerary } from "@/domain/taste-itinerary";
import { TASTE_TYPES } from "@/domain/taste";
import { sampleTasteProfile, SAMPLE_TASTE_LABEL } from "@/lib/sample-taste";
import { useLightSweep } from "@/components/LightSweep";
import { isDemoScenarioId } from "@/domain/demo-scenarios";
import { sceneSolar } from "@/domain/day-scene";
import { crewPerformance } from "@/domain/crew-performance";
import { CrewPerformance } from "@/components/CrewPerformance";
import { stageSky, stageSkyVars, STAGE_SKY_VARS } from "@/domain/stage-sky";
import { STAGE_SUN_VARS, stageSunFor, stageSunVars } from "@/domain/stage-sun";
import { ridgePath, starPlane } from "@/domain/demo-depth";
import { Stamp } from "@/components/ui/Stamp";

/* The demo journey (round 19), told as beats instead of a dashboard.
 *
 *  "Try the example" used to land visitors on the full Today screen — every
 *  section at once, ten card headers competing. This is the same trip told
 *  in the order the product promises it: the stakes, the crew at work, the
 *  plan, the payoff. Every number is computed by demoJourney() from the
 *  solver's own scenario builder, so the story can never outrun the product.
 *  Pattern borrowed deliberately from a speed-run demo: scripted beats,
 *  skip controls, and a send-a-link URL (/demo).
 *
 *  The backdrop's depth is generated once, here: three star planes drifting
 *  at different rates behind everything, a dawn wash that rises with the
 *  beats, and two terrain silhouettes holding the floor — a night stage the
 *  morning slowly arrives into. Deterministic seeds, so SSR, hydration and
 *  every sent link see the same sky; the layers are aria-hidden and pause
 *  off-screen, the written beats carry the whole story. */

const STARS_FAR = starPlane(7, 24, 58);
const STARS_MID = starPlane(29, 18, 72);
const STARS_NEAR = starPlane(53, 12, 88);
const RIDGE_FAR = ridgePath(97, 8, 0.85);
const RIDGE_NEAR = ridgePath(41, 5, 0.4);

function DemoBeatsInner() {
  const params = useSearchParams();
  const scenarioQ = params.get("s");
  const scenarioId = scenarioQ && isDemoScenarioId(scenarioQ) ? scenarioQ : "miles";
  const journey = useMemo(() => demoJourney(scenarioId), [scenarioId]);
  const [idx, setIdx] = useState(0);
  const beat: DemoBeatId = DEMO_BEAT_IDS[idx];
  const { sweep, node: sweepNode } = useLightSweep();

  const go = (next: number) => {
    if (next < 0 || next >= DEMO_BEAT_IDS.length || next === idx) return;
    sweep();
    setIdx(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(idx + 1);
      if (e.key === "ArrowLeft") go(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const rows = useMemo(() => planRows(journey), [journey]);
  const crewPerf = useMemo(() => crewPerformance(journey), [journey]);

  // The taste beat: the same recorded Qloo reads the example journey uses,
  // switchable between the two taste profiles so the cross-domain move —
  // music you love → places you'll love — is visible in one frame.
  const [profileKey, setProfileKey] = useState<string | null>(null);
  const tasteProfile = useMemo(
    () => sampleTasteProfile(profileKey ?? journey.scenario.profile),
    [profileKey, journey],
  );
  const tasteItinerary = useMemo(
    () =>
      tasteProfile
        ? buildTasteItinerary(
            journey.trip,
            journey.plans,
            journey.calendar,
            {
              favorites: tasteProfile.favorites,
              status: tasteProfile.places.length ? "ready" : "no-matches",
              places: tasteProfile.places,
              // A remembered prior keep, seeded so the memory story is
              // visible in the demo — "you kept this before" reads live.
              ...(tasteProfile.places[0]?.id
                ? { memory: { kept: 1, suppressed: 0, keptIds: [tasteProfile.places[0].id] } }
                : {}),
            },
            "replay",
          )
        : null,
    [journey, tasteProfile],
  );
  const gap = stakesGapHours(journey.moment);
  const p = journey.read.projection;
  const arrivalSpec = journey.trip.days.find(
    (d) => d.dayIndex === journey.trip.departureDayIndex + 1,
  );

  // Round 27: the demo is a stage — the sun rides the beat's moment, the
  // backdrop is the shared ink-stage sky (stageSky's luminance-clamped
  // horizon), and the face inside is the beat's computed read. The written
  // facts stay in the beats (Rule 2); the sun is the picture.
  const demoRef = useRef<HTMLDivElement>(null);
  const momentSolar = arrivalSpec
    ? sceneSolar(journey.trip.destination, arrivalSpec.date, journey.moment.localMin)
    : null;
  const heroSun = stageSunFor(
    momentSolar?.altitude ?? null,
    journey.moment.localMin / 1440,
    momentSolar?.label ?? null,
  );
  const heroFace = sunSelfForBeat(journey, beat);
  useEffect(() => {
    const el = demoRef.current?.closest(".demo-root");
    if (!(el instanceof HTMLElement)) return;
    const sky = stageSky(momentSolar?.altitude ?? -12, 0, 1);
    const skyVars = stageSkyVars(sky) as Record<string, string>;
    for (const name of STAGE_SKY_VARS) el.style.setProperty(name, skyVars[name]);
    const vars = stageSunVars(heroSun);
    for (const name of STAGE_SUN_VARS) el.style.setProperty(name, vars[name]);
    return () => {
      for (const name of [...STAGE_SKY_VARS, ...STAGE_SUN_VARS]) el.style.removeProperty(name);
    };
  }, [heroSun, momentSolar?.altitude]);

  // The demo is a send-a-link funnel — the payoff beat makes sending one tap.
  const [shared, setShared] = useState(false);
  const [portraitSaved, setPortraitSaved] = useState(false);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portraitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (shareTimer.current) clearTimeout(shareTimer.current);
    if (portraitTimer.current) clearTimeout(portraitTimer.current);
  }, []);
  const shareDemo = async () => {
    const url = `${window.location.origin}/demo`;
    const payload = {
      title: "Meridian — the ninety-second example",
      text: "Your meeting is at 16:00 Tokyo time and your body thinks it's 07:00. Watch a crew of agents move it.",
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
        return;
      }
    } catch {
      /* declined — fall through to the clipboard */
    }
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      if (shareTimer.current) clearTimeout(shareTimer.current);
      shareTimer.current = setTimeout(() => setShared(false), 2200);
    } catch {
      /* clipboard blocked — the link is visible in the address bar anyway */
    }
  };

  // The gift, take two (round 25): the traveller's portrait — the face the
  // payoff shows, as a shareable card. Same honesty rule as every figure on
  // this beat: it comes from sunSelfForBeat and the projection, never more.
  const savePortrait = async () => {
    try {
      await downloadSunPortrait(
        {
          read: sunSelfForBeat(journey, "payoff"),
          routeLabel: journey.passport?.route ?? "THE TRIP",
          subLabel: p
            ? `banked ${p.deliveredHours.toFixed(1)}h of ${p.requiredHours.toFixed(1)}h`
            : undefined,
        },
        "png",
      );
      setPortraitSaved(true);
      if (portraitTimer.current) clearTimeout(portraitTimer.current);
      portraitTimer.current = setTimeout(() => setPortraitSaved(false), 2200);
    } catch {
      /* download blocked — the share link above still carries the story */
    }
  };

  // Ambient drift stands down off-screen and on a hidden tab — the planes
  // are cheap, but nothing performs to an empty house.
  const [drift, setDrift] = useState(true);
  useEffect(() => {
    const el = demoRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([en]) => setDrift(en.isIntersecting && !document.hidden));
    io.observe(el);
    const vis = () => setDrift(!document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  return (
    <div className="demo" ref={demoRef} data-beat={beat}>
      {sweepNode}
      {/* The stage floor and the deep sky — depth behind the same painted
          sky. Stars drift on transform only, the dawn wash follows the
          beat, and the ridges hold the horizon down. */}
      <div className="demo-depth" aria-hidden="true" data-drift={drift ? "yes" : "no"}>
        <svg className="demo-stars demo-stars-far" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          {STARS_FAR.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
          ))}
        </svg>
        <svg className="demo-stars demo-stars-mid" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          {STARS_MID.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
          ))}
        </svg>
        <svg className="demo-stars demo-stars-near" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
          {STARS_NEAR.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} opacity={s.o} />
          ))}
        </svg>
        <div className="demo-dawn" />
        <svg className="demo-ridge demo-ridge-far" viewBox="0 0 100 40" preserveAspectRatio="none">
          <path d={RIDGE_FAR} />
        </svg>
        <svg className="demo-ridge demo-ridge-near" viewBox="0 0 100 40" preserveAspectRatio="none">
          <path d={RIDGE_NEAR} />
        </svg>
      </div>
      <StageSun
        sun={heroSun}
        read={heroFace}
        pulseKey={beat}
        label={`The moment over ${journey.trip.destination.name}: ${momentSolar?.label ?? "sun position unavailable"}`}
      />
      <header className="demo-head">
        <Link href="/" className="demo-word" transitionTypes={["nav-back"]}>
          MERIDIAN
        </Link>
        <span className="demo-sub">The ninety-second example</span>
        {idx < DEMO_BEAT_IDS.length - 1 && (
          <button type="button" className="demo-skip" onClick={() => go(DEMO_BEAT_IDS.length - 1)}>
            Skip to the payoff →
          </button>
        )}
      </header>

      {/* Keyed by beat so the choreography replays on every change. */}
      <div key={beat} className="demo-stage" data-beat={beat}>
        {beat === "stakes" && (
          <section className="demo-beat" aria-label={DEMO_BEAT_TITLES.stakes}>
            <p className="demo-kicker" data-rise="1">A fictional moment that matters</p>
            <p className="demo-persona" data-rise="2">
              <b>{journey.scenario.name}</b> — {journey.scenario.persona}
            </p>
            <h1 className="demo-title" data-rise="3">{journey.moment.title}</h1>
            <p className="demo-clocks" data-rise="4">
              <b>{clockLabel(journey.moment.localMin)}</b> Tokyo time
              <span className="demo-clocks-sep">·</span>
              <b>{clockLabel(journey.moment.bodyWithoutPlanMin)}</b> body time
            </p>
            <p className="demo-gap" data-rise="5">
              <span className="demo-gap-num">{gap.toFixed(1)}h</span> to move ·{" "}
              {journey.trip.origin.code} → {journey.trip.destination.code},{" "}
              {Math.round(Math.abs(journey.trip.requiredShiftMin) / 60)}h{" "}
              {journey.trip.requiredShiftMin >= 0 ? "ahead" : "behind"}
            </p>
            <p className="demo-joke" data-rise="6">“{journey.scenario.joke}”</p>
          </section>
        )}

        {beat === "crew" && (
          <section className="demo-beat" aria-label={DEMO_BEAT_TITLES.crew}>
            <p className="demo-kicker" data-rise="1">The crew at work</p>
            <h2 className="demo-title" data-rise="2">
              {journey.plans.length} days, planned back from the meeting
            </h2>
            <div data-rise="3">
              {/* Round 28: the differentiator performs. Agents speak, cues
                  land on the lanes, days lock with the gate's real verdict. */}
              <CrewPerformance perf={crewPerf} beatMs={[900, 620]} />
            </div>
            <p className="demo-honest" data-rise="4">
              Solved in your browser by the same solver and gate the live crew
              run uses. The pacing is authored; every figure is computed.
            </p>
          </section>
        )}

        {beat === "plan" && (
          <section className="demo-beat" aria-label={DEMO_BEAT_TITLES.plan}>
            <p className="demo-kicker" data-rise="1">The plan</p>
            <h2 className="demo-title" data-rise="2">
              Day 1 in Tokyo{arrivalSpec?.date ? ` · ${arrivalSpec.date}` : ""}
            </h2>
            <div className="demo-rows">
              {rows.map((r, i) => (
                <div key={r.id} className="demo-row" data-rise={i + 3}>
                  <span className="demo-row-time">{r.time}</span>
                  <span className="demo-row-body">
                    <b>{r.label}</b>
                    <small>{r.note}</small>
                  </span>
                </div>
              ))}
            </div>
            <p className="demo-honest" data-rise="8">
              Light, sleep and caffeine — timed to the route, shown to the minute.
            </p>
          </section>
        )}

        {beat === "taste" && (
          <section className="demo-beat" aria-label={DEMO_BEAT_TITLES.taste}>
            <p className="demo-kicker" data-rise="1">A little room for what you love</p>
            <h2 className="demo-title" data-rise="2">
              Your kind of {journey.trip.destination.name}
            </h2>
            <fieldset className="scenario-toggle demo-taste-toggle" data-rise="3">
              <legend>Taste preference</legend>
              {(["bjork", "luke"] as const).map((k) => {
                const pr = sampleTasteProfile(k);
                return (
                  pr && (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={tasteProfile?.key === k}
                      onClick={() => setProfileKey(k)}
                      className="taste-button taste-button--ghost"
                    >
                      {pr.favorites[0].name}
                    </button>
                  )
                );
              })}
            </fieldset>
            <div className="demo-rows">
              {(tasteItinerary?.suggestions ?? []).map((s, i) => (
                <div key={`${s.dayIndex}-${s.place.name}`} className="demo-row" data-rise={i + 4}>
                  <span className="demo-row-time">{clockLabel(s.startMin)}</span>
                  <span className="demo-row-body">
                    <b>{s.place.name}</b>
                    <small>
                      {s.date.slice(5)} · optional idea · free time in the plan
                      {s.place.categories.length > 0 &&
                        ` · ${s.place.categories.filter(Boolean).slice(0, 2).join(" · ")}`}
                    </small>
                  </span>
                </div>
              ))}
            </div>
            {(tasteItinerary?.suggestions.length ?? 0) === 0 && (
              <p className="demo-honest" data-rise="4">
                No free hour to fit — the plan kept its rest instead.
              </p>
            )}
            <p className="demo-provenance" data-rise="7">
              {tasteProfile
                ? `${tasteProfile.favorites
                    .map((f) => `${f.name} (${TASTE_TYPES[f.type].toLowerCase()})`)
                    .join(", ")} → ${tasteItinerary?.destination ?? journey.trip.destination.name} places — Qloo's taste graph, not a location search.`
                : "Destination picks, powered by Qloo."}
            </p>
            <p className="demo-honest" data-rise="8">
              Optional ideas fitted into the free hours the verified plan leaves — taste decides{" "}
              <i>what</i>, never <i>when</i>. {SAMPLE_TASTE_LABEL}.
            </p>
          </section>
        )}

        {beat === "payoff" && (
          <section className="demo-beat" aria-label={DEMO_BEAT_TITLES.payoff}>
            <p className="demo-kicker" data-rise="1">The payoff</p>
            <h2 className="demo-title" data-rise="2">The first morning, honestly scored</h2>
            {p && (
              <div className="demo-score" data-rise="3">
                <div className="demo-score-cell">
                  <b>{p.hours.toFixed(1)}h</b>
                  <small>still owed at landing</small>
                </div>
                <div className="demo-score-cell">
                  <b>{p.deliveredHours.toFixed(1)}h</b>
                  <small>carried by the plan</small>
                </div>
                <div className="demo-score-cell">
                  <b>{p.baselineHours.toFixed(1)}h</b>
                  <small>owing, doing nothing</small>
                </div>
              </div>
            )}
            {journey.passport && (
              <div className="demo-passport" data-rise="4" aria-label="Example arrival passport">
                {/* The peak beat: the passport lands and the stamp hits —
                    one scale/rotate impact plus an ink burst, nothing more. */}
                <div className="demo-stamp-burst" aria-hidden="true" />
                <div
                  className="demo-passport-frame"
                  dangerouslySetInnerHTML={{
                    __html: arrivalPassportSvg(journey.passport, sunSelfForBeat(journey, "payoff")),
                  }}
                />
              </div>
            )}
            <p className="demo-honest" data-rise="5">
              {journey.passport
                ? `Stamped ${journey.passport.stamp} — this example delivers ${
                    p ? p.deliveredHours.toFixed(1) : "?"
                  }h of ${p ? p.requiredHours.toFixed(1) : "?"}h, and says so.`
                : "Nothing to stamp — and nothing invented."}
            </p>
            <div className="demo-ctas" data-rise="6">
              <Link href="/" className="demo-cta-primary" transitionTypes={["nav-forward"]}>
                Make it yours
              </Link>
              <Link href="/?example=1" className="demo-cta-quiet" transitionTypes={["nav-forward"]}>
                Wander this trip in the app
              </Link>
              <button type="button" className="demo-cta-quiet" onClick={shareDemo}>
                {shared ? "Link copied ✓" : "Send this to a jet-lagged friend"}
              </button>
              <button type="button" className="demo-cta-quiet" onClick={savePortrait}>
                {portraitSaved ? "Portrait saved ✓" : "Save the portrait"}
              </button>
            </div>
          </section>
        )}
      </div>

      <footer className="demo-foot">
        <button type="button" className="demo-nav" onClick={() => go(idx - 1)} disabled={idx === 0}>
          ← Back
        </button>
        <div className="demo-dots" role="tablist" aria-label="Demo beats">
          {DEMO_BEAT_IDS.map((b, i) => (
            <button
              key={b}
              type="button"
              role="tab"
              aria-selected={i === idx}
              aria-label={DEMO_BEAT_TITLES[b]}
              className={`demo-dot${i === idx ? " on" : ""}${i < idx ? " past" : ""}`}
              onClick={() => go(i)}
            />
          ))}
        </div>
        {idx < DEMO_BEAT_IDS.length - 1 ? (
          <button type="button" className="demo-nav" onClick={() => go(idx + 1)}>
            Next →
          </button>
        ) : (
          <Link href="/" className="demo-nav demo-nav-cta" transitionTypes={["nav-forward"]}>
            Start →
          </Link>
        )}
      </footer>

      <p className="demo-footnote">
        <Stamp kind="fictional" /> Fictional sample data — imagined, not a real
        schedule or endorsement.{" "}
        {scenarioId === "miles" ? (
          <>
            Prefer a stage or a keynote?{" "}
            <Link href="/demo?s=danny">Danny&apos;s day</Link> ·{" "}
            <Link href="/demo?s=sofia">Sofia&apos;s day</Link>
          </>
        ) : (
          <Link href="/demo">Miles&apos;s day</Link>
        )}
      </p>
    </div>
  );
}

export function DemoBeats() {
  return (
    <Suspense fallback={null}>
      <DemoBeatsInner />
    </Suspense>
  );
}
