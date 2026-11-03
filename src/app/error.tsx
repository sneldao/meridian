"use client";

import { useEffect } from "react";
import Link from "next/link";
import { errorDigest } from "@/lib/error-reporting";
import { SUPPORT_MAILTO } from "@/lib/support";

// The segment-level boundary. Next renders this inside the root layout, so it
// gets the document, the fonts and the global stylesheet — only the page's own
// subtree is replaced.
//
// This exists because a single uncaught render throw used to take the whole
// route down with Next's default development overlay and, in production, a bare
// "Application error: a client-side exception has occurred". The trip the
// traveller had already built is still in localStorage, so the useful thing to
// offer is a way back, not a stack trace.

export function reportClientError(digest: unknown): void {
  const d = errorDigest(digest);
  fetch("/api/errors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(d ? { digest: d } : {}),
  }).catch(() => {});
}

export default function SegmentError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    reportClientError(error?.digest);
  }, [error]);

  const digest = errorDigest(error?.digest);
  return (
    <div className="errpage">
      <div className="beam" aria-hidden="true" />
      <div className="in">
        <div className="errcard">
          <span className="route">Something went wrong on this screen</span>
          <h1>The crew lost its place.</h1>
          <p className="s">
            This screen could not be loaded. Try again or return to Today. Any
            plan already saved in this browser will still be available.
          </p>
          <div className="errbtns">
            <button type="button" className="p1" onClick={() => retry()}>
              Try again
            </button>
            <Link className="p2" href="/">
              Back to Today
            </Link>
          </div>
          {digest && (
            <p className="errdigest">
              Reference <code>{digest}</code> — quote it if you report this.
            </p>
          )}
          <p className="s">
            <Link href="/privacy">Privacy</Link> ·{" "}
            <a href={SUPPORT_MAILTO}>Contact support</a>
          </p>
        </div>
      </div>
    </div>
  );
}