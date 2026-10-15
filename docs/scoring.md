# The deterministic gate

`evaluatePlan` in `src/domain/circadian.ts` is the evaluator's ground truth.
It is pure code — no model — and it is the only thing that can lock a day.

```
passes(result) = result.feasible && result.score >= PASS_SCORE   // 0.75
```

## Hard violations (`feasible = false`, `score = 0`)

| Code | Rule |
|---|---|
| `SHIFT_TOO_FAST` | Phase shift > 90 min/day for a single day |
| `SHIFT_DIRECTION_FLIP` | Plan shifts opposite to the trip direction |
| `SLEEP_TOO_SHORT` | Sleep window under the 6 h floor |
| `MISSING_LIGHT_ANCHOR` | Advance day with no timed-light intervention |
| `LIGHT_WRONG_WINDOW` | Light exposure inside the wrong phase-response window |
| `CAFFEINE_TOO_LATE` | Caffeine cutoff inside 8 h of target bedtime |
| `CALENDAR_CONFLICT` | Intervention overlaps a calendar event (wrap-aware; `meal_timing` is exempt — meals are supposed to coincide) |
| `DOSE_PRESCRIPTION` | Note prescribes a dose or names medication — the crew advises on timing, never medication |
| `UNSAFE_CLAIM` | Note makes a clinical claim (cure/treat/diagnose/proven-to-fix) |

## Soft score (`feasible = true`)

```
score = 0.95 − adherencePenalty    (clamped ≥ 0, rounded to 2dp)
```

The adherence penalty is computed **marginally**: only the candidate day's
asks are weighed against the `AdherenceProfile` — early asks before
`ignoresInterventionsBeforeMin`, kinds in `weakAt`. Locked days aren't
re-punished; the gate judges each plan on its own risk.

## Invariants worth keeping

- **Default-FAIL.** A plan starts rejected; only scorer evidence passes it.
- **Evaluator ≠ judge.** Iris explains the verdict; she cannot change it.
- **Feedback is the prompt.** Violation strings feed directly into the
  planner's retry prompt — the loop is the recovery story.
- **Physiology is hardcoded.** The 90 min/day ceiling is a real circadian
  constraint, not a tuning knob. Everything else (`PASS_SCORE`,
  caffeine/sleep floors) lives at the top of `circadian.ts` / `types.ts`.
