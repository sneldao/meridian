"use client";

import { useEffect } from "react";
import Link from "next/link";

// The segment-level boundary. Next renders this inside the root layout, so it
// gets the document, the fonts and the global stylesheet — only the page's own
// subtree is replaced.
//
// This exists because a single uncaught render throw used to take the whole
// route down with Next's default development overlay and, in production, a bare
// "Application error: a client-side exception has occurred". The trip the
// traveller had already built is still in localStorage, so the useful thing to
// offer is a way back, not a stack trace.

export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the console so a report can carry it; `digest` is the only
    // handle that survives to production.
    console.error("Meridian route error:", error);
  }, [error]);

  return (
    <div className="errpage">
      <div className="beam" aria-hidden="true" />
      <div className="in">
        <div className="errcard">
          <span className="route">Something went wrong on this screen</span>
          <h1>The crew lost its place.</h1>
          <p className="s">
            This page failed to render. Your trip, your locked days and your
            check-ins are all still saved — nothing has been lost, and trying
            again is usually enough.
          </p>
          <div className="errbtns">
            <button type="button" className="p1" onClick={() => reset()}>
              Try again
            </button>
            <Link className="p2" href="/">
              Back to Today
            </Link>
          </div>
          {error.digest && (
            <p className="errdigest">
              Reference <code>{error.digest}</code> — quote it if you report this.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}