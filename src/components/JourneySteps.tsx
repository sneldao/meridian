"use client";

import Link from "next/link";

const STEPS = ["Your trip", "Your plan", "Each day", "After you land"] as const;

/** Where the traveller is in the journey — one quiet line under the route
 *  picker. `current` is the live step; steps before it read as done. When
 *  `hrefs` are supplied the steps are also links — the map doubles as a way
 *  to move, not just a place to stand. */
export function JourneySteps({
  current,
  hrefs,
}: {
  current: 0 | 1 | 2 | 3;
  hrefs?: readonly string[];
}) {
  return (
    <ol className="journey" aria-label="Your progress">
      {STEPS.map((label, i) => {
        const state = i < current ? "done" : i === current ? "now" : "later";
        const body = (
          <>
            {state === "done" && <span aria-hidden="true" className="journey-check">✓</span>}
            {label}
          </>
        );
        return (
          <li
            key={label}
            className={`journey-step ${state}`}
            aria-current={i === current ? "step" : undefined}
          >
            {hrefs?.[i] ? (
              <Link href={hrefs[i]} className="journey-step-link">{body}</Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ol>
  );
}
