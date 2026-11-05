"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";

/* The crew's account — the expandable trace that replaces the bare boot
 * skeleton while the plan builds (docs/plan/agent-native.md step 2).
 *
 * Every row is a fact a real function produced upstream (routeGapRead,
 * previewPlan, evaluatePlan, matchSampleProfileForTrip); this component
 * only paces their arrival — ~450ms apart — and holds the feed handoff
 * until the last one lands. The elapsed figure is measured wall time from
 * commit, never the presentation dwell. Reduced motion shows the settled
 * state instantly: all rows, no stagger, no video.
 */

export interface CrewAccountRow {
  id: string;
  /** What the crew did — primary text. */
  label: string;
  /** The number or honest wording it produced — mono secondary. */
  secondary: string;
}

export interface CrewAccountProps {
  /** Facts gathered so far, in the order the work ran. */
  rows: CrewAccountRow[];
  /** True once every fact is in — the header settles to "Planned in Ns". */
  done: boolean;
  /** performance.now() at commit — the working timer's epoch. */
  startedAt: number;
  /** Measured elapsed once done. Null while the work is still running. */
  elapsedMs: number | null;
  /** Fired when the last row has visibly landed — the feed may hand off. */
  onSettled?: () => void;
}

/** Presentation pacing only — the facts are already computed. */
const ROW_GAP_MS = 450;
/** Beat after the last reveal so its fade-up lands before the handoff.
 *  4 rows × 450ms + this tail ≈ the 2.4s max dwell the plan allows. */
const SETTLE_TAIL_MS = 500;
/** Reduced motion shows the settled state instantly — a short static hold
 *  so the account still registers before the feed takes over. */
const RM_DWELL_MS = 1200;

function LoaderGrid() {
  /* 3×3 pixel grid — the Drive chevron wavefront. Delay = (col+|row-1|)·90ms:
   * the wave sweeps left→right off the centre row. Reduced motion stands the
   * cells down to static dim via the media query in globals.css. */
  return (
    <span className="crew-loader" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        return (
          <span
            key={i}
            className="crew-loader-cell"
            style={{ animationDelay: `${(col + Math.abs(row - 1)) * 90}ms` }}
          />
        );
      })}
    </span>
  );
}

export function CrewAccount({ rows, done, startedAt, elapsedMs, onSettled }: CrewAccountProps) {
  /* Lazy initial read — this component only ever mounts after a commit,
   *  so the first paint already honours the preference; the effect below
   *  only subscribes for changes. */
  const [reduce, setReduce] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  /* The whole trace folds behind its header — usable before and after the
   * settle, per the ThinkingState law (settles, stays expandable). */
  const [expanded, setExpanded] = useState(true);

  /* Working clock — ticks every 100ms only while the work runs. Once the
   * account is done the measured figure replaces it and never moves again. */
  const [nowMs, setNowMs] = useState(() => performance.now());
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setNowMs(performance.now()), 100);
    return () => clearInterval(id);
  }, [done]);

  /* Row pacing. `shown` is presentation; `rows` is fact. A row waits 450ms
   * after the previous reveal — a slow fetch simply means the next fact
   * isn't there to show yet, which is the honest rhythm. Under reduced
   * motion `visible` is the full set instantly. */
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (reduce || shown >= rows.length) return;
    const id = setTimeout(() => setShown((s) => Math.min(rows.length, s + 1)), ROW_GAP_MS);
    return () => clearTimeout(id);
  }, [rows.length, shown, reduce]);
  const visible = reduce ? rows.length : shown;

  /* Hand the feed over once the last row has landed (plus its fade's tail).
   * One shot — settling is a latch. */
  const settledRef = useRef(false);
  useEffect(() => {
    if (settledRef.current || !done || rows.length === 0 || visible < rows.length) return;
    settledRef.current = true;
    const id = setTimeout(() => onSettled?.(), reduce ? RM_DWELL_MS : SETTLE_TAIL_MS);
    return () => clearTimeout(id);
  }, [done, visible, rows.length, onSettled, reduce]);

  return (
    <section className="crew-account" aria-label="The crew's account">
      <div className="crew-account-head">
        <span className="crew-account-glyph" aria-hidden="true">
          <Sparkles size={14} />
        </span>
        {done && elapsedMs !== null ? (
          <p className="crew-account-title">Planned in {(elapsedMs / 1000).toFixed(1)}s</p>
        ) : (
          <p className="crew-account-title is-working">The crew&#8217;s account</p>
        )}
        {!done && (
          <>
            <LoaderGrid />
            <span className="crew-account-elapsed" aria-hidden="true">
              {((nowMs - startedAt) / 1000).toFixed(1)}s
            </span>
          </>
        )}
        <button
          type="button"
          className="crew-account-toggle"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse the crew's account" : "Expand the crew's account"}
          onClick={() => setExpanded((v) => !v)}
        >
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      {expanded && (
        <div className="crew-account-body">
          <ul className="crew-account-rows">
            {rows.slice(0, visible).map((r) => (
              <li key={r.id} className="crew-account-row">
                <Check size={13} className="crew-account-check" aria-hidden="true" />
                <span className="crew-account-label">{r.label}</span>
                <span className="crew-account-secondary">{r.secondary}</span>
              </li>
            ))}
          </ul>
          {/* Surfer variant — the featured traveller's clip under the trace,
              muted so waiting becomes watching. Reduced motion holds the
              poster instead: no play, no autoplay, no fetch of the clip. */}
          {reduce ? (
            <img className="crew-account-surfer" src="/ads/c2a-poster.webp" alt="" />
          ) : (
            <video
              className="crew-account-surfer"
              src="/ads/c2a.mp4"
              poster="/ads/c2a-poster.webp"
              muted
              loop
              playsInline
              autoPlay
              aria-hidden="true"
            />
          )}
        </div>
      )}
    </section>
  );
}
