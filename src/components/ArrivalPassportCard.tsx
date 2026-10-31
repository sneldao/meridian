"use client";

import { useId, useState } from "react";
import { passportText, type ArrivalPassport } from "@/domain/arrival-passport";
import { downloadArrivalPassport } from "@/lib/download-arrival-passport";
import { CountUp } from "@/components/CountUp";

/**
 * The arrival record as a stamped card, and the means to send it.
 * The preview renders in live type; downloads come from the SVG twin
 * (`arrival-passport-svg`), so the exported image matches the card.
 * Nothing is posted automatically — every action is an explicit button.
 */
export function ArrivalPassportCard({
  passport,
  rise,
}: {
  passport: ArrivalPassport;
  /** This card's beat in the arrival reveal choreography. */
  rise?: number;
}) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const uid = useId();
  const canShare = typeof navigator !== "undefined" && !!navigator.share;

  const run = async (fn: () => Promise<void>, busy: string, done: string) => {
    setPending(true);
    setStatus(busy);
    try {
      await fn();
      setStatus(done);
    } catch {
      setStatus("Could not create the image. Try the SVG download.");
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(passportText(passport));
      setStatus("Record copied — paste it anywhere.");
    } catch {
      setStatus("Could not copy. The downloads still work.");
    }
  };

  const share = async () => {
    const text = passportText(passport);
    try {
      await navigator.share({ title: "Meridian · arrival record", text });
      setStatus(null);
    } catch {
      // Dismissed or unsupported — the copy button covers it.
      await copy();
    }
  };

  return (
    <div className="arr-passport" data-rise={rise}>
      <div className="arr-passport-card" role="img" aria-label={passportText(passport).replace(/\n/g, ". ")}>
        <span className="arr-passport-eyebrow">Meridian · Arrival record</span>
        <div className="arr-passport-route">{passport.route}</div>
        {passport.landedOn && <div className="arr-passport-date">Landed {passport.landedOn}</div>}
        <div className={`arr-passport-stamp ${passport.stamp.toLowerCase()}`}>
          <span className="arr-passport-stamp-word">{passport.stamp}</span>
          <span className="arr-passport-stamp-detail">{passport.stampDetail}</span>
        </div>
        <div className="arr-passport-stat"><CountUp value={passport.stat} ms={900} /></div>
        <div className="arr-passport-label">{passport.statLabel}</div>
        <div className="arr-passport-sub">{passport.statSub}</div>
        {passport.marksLine && (
          <>
            <div className="arr-passport-rule" aria-hidden="true" />
            <div className="arr-passport-marks-k">The traveller&apos;s account</div>
            <div className="arr-passport-marks">{passport.marksLine}</div>
          </>
        )}
        <div className="arr-passport-foot">
          <span>Timing guidance, not medical advice</span>
          <em>meridian</em>
        </div>
      </div>

      <div className="arr-actions" role="group" aria-labelledby={`${uid}-send`}>
        <span id={`${uid}-send`} className="sr-only">Send the arrival record</span>
        <button
          type="button"
          className="arr-btn"
          disabled={pending}
          onClick={() =>
            run(() => downloadArrivalPassport(passport, "png"), "Preparing image…", "Passport downloaded.")
          }
        >
          Download passport
        </button>
        <button
          type="button"
          className="arr-btn ghost"
          disabled={pending}
          onClick={() =>
            run(() => downloadArrivalPassport(passport, "svg"), "Preparing image…", "SVG downloaded.")
          }
        >
          SVG
        </button>
        <button type="button" className="arr-btn ghost" onClick={copy}>
          Copy text
        </button>
        {canShare && (
          <button type="button" className="arr-btn ghost" onClick={share}>
            Share
          </button>
        )}
      </div>
      <p className="arr-passport-status" role="status">{status ?? "Nothing is posted automatically — choose where it goes."}</p>
    </div>
  );
}
