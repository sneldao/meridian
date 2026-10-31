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
  type DemoBeatId,
} from "@/domain/demo-beats";
import { arrivalPassportSvg } from "@/lib/arrival-passport-svg";
import { useLightSweep } from "@/components/LightSweep";
import { isDemoScenarioId } from "@/domain/demo-scenarios";

/* The demo journey (round 19), told as beats instead of a dashboard.
 *
 *  "Try the example" used to land visitors on the full Today screen — every
 *  section at once, ten card headers competing. This is the same trip told
 *  in the order the product promises it: the stakes, the crew at work, the
 *  plan, the payoff. Every number is computed by demoJourney() from the
 *  solver's own scenario builder, so the story can never outrun the product.
 *  Pattern borrowed deliberately from a speed-run demo: scripted beats,
 *  skip controls, and a send-a-link URL (/demo). */

const CREW_LINES = [
  { agent: "Iris", text: "Nine hours east, and the meeting is the wall. I plan back from it." },
  { agent: "Sol", text: "Light before the flight buys the first hours — I place the windows." },
  { agent: "Mara", text: "The calendar fights back on D-1. I move what may be moved." },
  { agent: "Iris", text: "Signed: four days, every ask timed to the minute." },
] as const;

function DemoBeatsInner() {
  const params = useSearchParams();
  const scenarioQ = params.get("s");
  const scenarioId = scenarioQ && isDemoScenarioId(scenarioQ) ? scenarioQ : "jason";
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
  const gap = stakesGapHours(journey.moment);
  const p = journey.read.projection;
  const arrivalSpec = journey.trip.days.find(
    (d) => d.dayIndex === journey.trip.departureDayIndex + 1,
  );

  // The demo is a send-a-link funnel — the payoff beat makes sending one tap.
  const [shared, setShared] = useState(false);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (shareTimer.current) clearTimeout(shareTimer.current); }, []);
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

  return (
    <div className="demo">
      {sweepNode}
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
            <h1 className="demo-title" data-rise="2">{journey.moment.title}</h1>
            <p className="demo-clocks" data-rise="3">
              <b>{clockLabel(journey.moment.localMin)}</b> Tokyo time
              <span className="demo-clocks-sep">·</span>
              <b>{clockLabel(journey.moment.bodyWithoutPlanMin)}</b> body time
            </p>
            <p className="demo-gap" data-rise="4">
              <span className="demo-gap-num">{gap.toFixed(1)}h</span> to move ·{" "}
              {journey.trip.origin.code} → {journey.trip.destination.code},{" "}
              {Math.round(Math.abs(journey.trip.requiredShiftMin) / 60)}h{" "}
              {journey.trip.requiredShiftMin >= 0 ? "ahead" : "behind"}
            </p>
            <p className="demo-joke" data-rise="5">“{journey.scenario.joke}”</p>
          </section>
        )}

        {beat === "crew" && (
          <section className="demo-beat" aria-label={DEMO_BEAT_TITLES.crew}>
            <p className="demo-kicker" data-rise="1">The crew at work</p>
            <h2 className="demo-title" data-rise="2">Four days, planned back from the meeting</h2>
            <div className="demo-crew">
              {CREW_LINES.map((l, i) => (
                <p key={l.agent + i} className="demo-line" data-rise={i + 3}>
                  <span className="demo-agent">{l.agent}</span> {l.text}
                </p>
              ))}
            </div>
            <div className="demo-days" data-rise="7">
              {journey.plans.map((d) => (
                <span key={d.dayIndex} className="demo-day">
                  {d.label}{" "}
                  <b>
                    {d.shiftMin === 0 ? "·" : `${d.shiftMin > 0 ? "+" : "−"}${Math.abs(d.shiftMin)}m`}
                  </b>
                </span>
              ))}
            </div>
            <p className="demo-honest" data-rise="8">
              Solved live in your browser — the same solver the crew&apos;s plans are judged
              against. No canned numbers.
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
                  dangerouslySetInnerHTML={{ __html: arrivalPassportSvg(journey.passport) }}
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
        Imagined demo scenario — fictional sample data, not a real schedule or endorsement.{" "}
        {scenarioId === "jason" ? (
          <>
            Prefer a stage or a keynote?{" "}
            <Link href="/demo?s=cedric">Cedric&apos;s day</Link> ·{" "}
            <Link href="/demo?s=alex">Alex&apos;s day</Link>
          </>
        ) : (
          <Link href="/demo">Jason&apos;s day</Link>
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
