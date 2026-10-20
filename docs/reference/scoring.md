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
| `SHIFT_DIRECTION_FLIP` | Plan shifts opposite to the most recent non-hold day — or to the trip direction when no day has shifted yet (holds are pauses, not a direction) |
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

The solver no longer inserts a melatonin window of its own. The model still
understands a melatonin timing cue — the planner may propose one, and the
gate still scores it — but a standing supplement prompt reads as a standing
recommendation, and the crew advises on timing, not medication.

## The projection behind the dial (`src/domain/misalignment.ts`)

The gate judges a plan; the dial shows where the body clock will actually
end up. Both use the same machinery, so the number on screen is never the
planner's own claim.

`computeTripTrajectory` walks the days and steps a **body-clock phase** by
`modelShiftMin` — the same phase-response model the gate uses — capped at the
90 min/day physiological ceiling and never capped at the declared `shiftMin`.
A plan that claims 90 minutes and places its light badly gets credited with
what the timing supports, and the projection shows the difference.

- **The gap** is the circular distance between the modelled body sleep
  midpoint and the destination's night (pre-flight, the destination night
  expressed in the origin's clock frame; after the flight, local time).
- **The baseline** is the same chain with no plan: the traveller keeps their
  habitual schedule until the flight, then lives in the destination under
  whatever daylight it has (`daylightWindowMin`, from the sun model). The
  comparison "your plan is 1.4h better than doing nothing" is two runs of the
  same model.
- **The band** is the model's own error, stated in three parts: how well the
  baseline phase is known (30 min self-reported, 20 min from a wearable), each
  day's support error (15 min, accumulated as a random walk because the days
  are independent), plus 15 min for a skipped action and 20 min for drinking.
  Never narrower than the model deserves, never wider than 90 min.
- **A skipped action** removes that day's light cues from the chain, so the
  projection slips toward the baseline on its own — there is no clamp and no
  hand-written "skips are never worse" rule.

`directionOptions` returns the advance-vs-delay options for a trip. The
trip's own direction is the executable one; the long way round is returned
with `executable: false` and the reason attached, because the solver places
zeitgebers for one direction and the scorer rejects a flip
(`SHIFT_DIRECTION_FLIP`). It is context, not a setting.

## The evidence seed table (`src/domain/evidence.ts`)

Every nudge the app can show is graded in one table: does it *move the clock*
(`moves_clock`) or only *help you feel better* (`helps_feel_better`), and how
well is the mechanism and the field evidence. Grades come from the table, never
from a prompt or an LLM's memory, so a nudge the table does not cover is
visibly "Limited / Unknown" rather than quietly confident.

The table's `citationIds` point into the shared catalogue
(`src/domain/citations.ts`) — the same objects the research agent returns and
the `UNKNOWN_CITATION` gate resolves. One id space, so a paper cannot be
"verified" in one module and invisible in another.

## Soft score (`feasible = true`)

```
score = 0.95 − adherencePenalty    (clamped ≥ 0, rounded to 2dp)
```

The adherence penalty is computed **marginally**: only the candidate day's
asks are weighed against the `AdherenceProfile` — early asks before
`ignoresInterventionsBeforeMin`, kinds in `weakAt`. Locked days aren't
re-punished; the gate judges each plan on its own risk.

The same compliance floor is a **hard cap in the solver**, not just a soft
penalty here: eastbound, `solveDay` never picks a shift that would wake the
wearer earlier than `floor − 105min`, and placements prefer at/after-floor
slots (see architecture.md — solver).

## Invariants worth keeping

- **Default-FAIL.** A plan starts rejected; only scorer evidence passes it.
- **Evaluator ≠ judge.** Iris explains the verdict; she cannot change it.
- **Feedback is the prompt.** Violation strings feed directly into the
  planner's retry prompt — the loop is the recovery story.
- **Physiology is hardcoded.** The 90 min/day ceiling is a real circadian
  constraint, not a tuning knob. Everything else (`PASS_SCORE`,
  caffeine/sleep floors) lives at the top of `circadian.ts` / `types.ts`.
