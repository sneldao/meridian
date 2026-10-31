"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clockLabel, demoJourney, sunSelfForBeat } from "@/domain/demo-beats";
import { arrivalPassportSvg } from "@/lib/arrival-passport-svg";
import { CountUp } from "@/components/CountUp";

/* Round 19: the landing shows its artifacts instead of naming them.
 *
 *  The three chips used to say "Body-clock dial + CAS · Arrival scorecard ·
 *  Shareable passport" — labels for things the visitor never saw. Now the
 *  things themselves render, computed from the same demo journey the /demo
 *  beats tell, and wake when they scroll into view. Below them, one strip
 *  names what the crew actually times, so the capability is visible without
 *  a feature-bullet wall. */

function useInViewOnce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

/** A 24-hour ring with two hands — the destination clock and the body the
 *  flight carries in. Pure SVG, attribute transforms only. */
function MiniDial({ localMin, bodyMin }: { localMin: number; bodyMin: number }) {
  const angle = (min: number) => (min / 1440) * 360;
  return (
    <svg
      viewBox="0 0 120 120"
      role="img"
      aria-label={`Tokyo ${clockLabel(localMin)}, body time ${clockLabel(bodyMin)}`}
    >
      <circle cx="60" cy="60" r="52" className="ld-ring" />
      {/* 12 ticks — the ring reads as a clock, not a pie. */}
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1="60"
          y1="10"
          x2="60"
          y2="16"
          className="ld-tick"
          transform={`rotate(${i * 30} 60 60)`}
        />
      ))}
      <line
        x1="60"
        y1="60"
        x2="60"
        y2="18"
        className="ld-hand-local"
        transform={`rotate(${angle(localMin)} 60 60)`}
      />
      <line
        x1="60"
        y1="60"
        x2="60"
        y2="28"
        className="ld-hand-body"
        transform={`rotate(${angle(bodyMin)} 60 60)`}
      />
      <circle cx="60" cy="60" r="3.5" className="ld-pin" />
    </svg>
  );
}

export function LandingArtifacts() {
  const journey = useMemo(() => demoJourney("miles"), []);
  const { ref, seen } = useInViewOnce<HTMLDivElement>();
  const p = journey.read.projection;

  return (
    <div className="landing-artifacts" ref={ref} data-seen={seen ? "yes" : "no"}>
      <div className="ld-grid" aria-label="What a Meridian plan produces">
        <div className="ld-card">
          <MiniDial localMin={journey.moment.localMin} bodyMin={journey.moment.bodyWithoutPlanMin} />
          <p className="ld-cap">
            <b>Body-clock dial</b>
            <small>
              {clockLabel(journey.moment.localMin)} in Tokyo ·{" "}
              {clockLabel(journey.moment.bodyWithoutPlanMin)} body time
            </small>
          </p>
        </div>

        <div className="ld-card">
          <p className="ld-score">
            {p && (
              <>
                <b>
                  <CountUp value={seen ? p.deliveredHours.toFixed(1) : "0.0"} />h
                </b>
                <small>
                  banked of <CountUp value={seen ? p.requiredHours.toFixed(1) : "0.0"} />h needed
                </small>
                <span className="ld-score-line">
                  doing nothing would owe{" "}
                  <CountUp value={seen ? p.baselineHours.toFixed(1) : "0.0"} />h
                </span>
              </>
            )}
          </p>
          <p className="ld-cap">
            <b>Arrival scorecard</b>
            <small>the first morning, honestly scored</small>
          </p>
        </div>

        <div className="ld-card">
          {journey.passport ? (
            <span
              className="ld-passport"
              aria-label="Example stamped arrival passport"
              dangerouslySetInnerHTML={{ __html: arrivalPassportSvg(journey.passport, sunSelfForBeat(journey, "payoff")) }}
            />
          ) : (
            <p className="ld-score">
              <b>—</b>
              <small>nothing to stamp yet</small>
            </p>
          )}
          <p className="ld-cap">
            <b>Shareable passport</b>
            <small>stamped only with what the read carries</small>
          </p>
        </div>
      </div>

      <div className="ld-strip">
        <p className="ld-strip-line">
          <span className="ld-strip-label">The crew times</span>
          daylight · light avoidance · sleep windows · caffeine cutoffs · exercise · meals
        </p>
        <p className="ld-strip-line">
          <span className="ld-strip-label">and carries</span>
          your wearable baseline · last trip&apos;s lessons · calendar walls · your taste,
          via Qloo when available
        </p>
      </div>
    </div>
  );
}
