"use client";

const STEPS = ["Your trip", "Your plan", "Each day", "After you land"] as const;

/** Where the traveller is in the journey — one quiet line under the route
 *  picker. `current` is the live step; steps before it read as done. */
export function JourneySteps({ current }: { current: 0 | 1 | 2 | 3 }) {
  return (
    <ol className="journey" aria-label="Your progress">
      {STEPS.map((label, i) => {
        const state = i < current ? "done" : i === current ? "now" : "later";
        return (
          <li
            key={label}
            className={`journey-step ${state}`}
            aria-current={i === current ? "step" : undefined}
          >
            {state === "done" && <span aria-hidden="true" className="journey-check">✓</span>}
            {label}
          </li>
        );
      })}
    </ol>
  );
}
