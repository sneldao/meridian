<!-- LIVE reference — keep in sync with the code. -->

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
| `UNKNOWN_CITATION` | Intervention cites an id outside the research set Jun actually returned |
| `SHIFT_OVERSTATED` | Declared shift exceeds what the phase-response model says the day's timing supports by more than 45 min |

(`ADHERENCE_RISK` is declared in the `EvalViolation` code union but not
currently emitted — adherence feeds the soft score below.)

## The model behind `SHIFT_OVERSTATED`

`modelShiftMin` (same file) is a flattened phase-response curve: light in the
~5h after the estimated core-body-temperature minimum (`targetWakeMin − 2h`)
advances, light in the ~8h before it delays, darkness in the opposite zone
counts the other way; melatonin timing, morning exercise and the day's sleep-
window move add smaller support. The scorer compares the *declared* `shiftMin`
against this *derived* support — a plan can no longer claim a 90-minute
advance while placing its light in the delay zone. When the claim outruns the
model within tolerance, the gap surfaces as a note, not a failure.

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
