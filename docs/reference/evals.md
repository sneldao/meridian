<!-- LIVE reference — keep in sync with the code. -->

# Evals — the shape, not the hillclimb

**Not done today:** tuning prompts against these numbers. **Done today:** the
harness, the metrics, and a persisted trend line, so improvement is a
measured process from here rather than a vibe.

## Why this is the right unit of measurement

The product already has a judge, not a model: `evaluatePlan` in
`src/domain/circadian.ts` ([scoring.md](scoring.md)) is pure code — no LLM —
and it's the only thing that can lock a day. That means "is the crew getting
better" is actually measurable without human grading: run the same scenarios
repeatedly, score every attempt with the same deterministic gate, and track
whether the crew clears it in fewer attempts, with fewer violations, more
often.

## The harness

```bash
bun run eval            # run the scenario matrix, persist, print a summary
bun run eval -- --report  # print the trend from everything on record, no run
```

`scripts/eval.ts` runs three fixed scenarios through the real crew
(`runCrew`, the same function the product uses — not a separate code path):
the demo route (LHR→HND, eastward, tight calendar), a westward route
(LHR→JFK), and ICP-2's longer westward delay (LHR→MEX). Same matrix every
time — that's what makes the trend mean something. The calendar is forced to
fixtures (`calendarFor(trip)`) so eval runs never read or write a real
connected Google Calendar.

It respects `AGENT_PROVIDER` like everything else: `replay` is free and
deterministic (good for a pre-commit regression check, same spirit as
`bun run replay:check`); `featherless` is the cheap live path (real model
variance, pennies per matrix); `anthropic` is the quality ceiling. A failed
primary retries on `AGENT_PROVIDER_FALLBACK` before replay — see
[providers.md](providers.md).

## What gets measured, per scenario run

| Metric | Source |
|---|---|
| Days locked (of 5) | `day_locked` events |
| Mean score | `briefing.score` — mean of every feasible attempt, same number the product shows on the handoff card |
| Attempts used | count of `eval_result` events |
| Violation codes | tallied from every `eval_result.violations[].code`, pass or fail — this is the "what's the model getting wrong" signal |
| **Shift claimed** | `briefing.coverage.ratio` — the plan's *declared* coverage |
| **Shift delivered** | the same projection the clock and the landing show: what the plan's *timing* actually carried, as a share of the required shift |
| **Hours off at landing** | the projection's headline — the distance between the body clock and the destination's night on arrival day, with its band |
| **Draft kept** | the share of the solver's cues the planner kept, from the `plan_candidate` event's `drift` |
| Tool calls, wall-clock duration, provider, fallback-to-replay flag | the rest of the row |

**Claimed and delivered are different numbers, and the gap between them is
the point.** "Shift claimed" is the plan's arithmetic. "Shift delivered" is
what the phase-response model says the day's zeitgeber timing can actually
carry — the same number the clock's band and the landing's headline are built
from. A plan that claims 100% and delivers 40% is not a plan that failed; it
is a plan whose claim was never checked, and the harness is where that shows
up first.

**Draft kept** is `—` on the replay provider, correctly: the replay path's
plan *is* the solver's, so there is no drift to report. On a live provider it
says how much of the solver's placement survived the planner's intent (see
[architecture.md](architecture.md#pipeline-runcrew-srcagentsruntimets) — the
draft is the default, so a low number means the planner rewrote it on
purpose).

## Where it's persisted

Same table as everything else — `public.meridian_events`, tagged
`kind: "eval"` (see [providers.md](providers.md#supabase-persistence-optional)).
No new migration; this reuses the single-JSONB-table pattern the app already
has for runs and check-ins. Falls back to `artifacts/evals.json`
(gitignored) when Supabase isn't configured, same "degrades cleanly"
philosophy as the rest of the app.

## Reading the trend

`--report` groups history by scenario and prints, per scenario: run count,
average lock rate, average score, the average shift claimed and delivered,
the average hours off at landing, the average draft kept, a run-by-run trend
glyph (`●` = 5/5 locked, `◐` = 4/5, `○` = worse), and the most common
violation codes across every run on record.

That last column is the actual roadmap: if `CALENDAR_CONFLICT` dominates, the
planner needs better calendar-awareness in its prompt; if `SLEEP_TOO_SHORT`
dominates, the scorer's floor is colliding with how aggressively Otto shifts;
if `SHIFT_OVERSTATED` dominates, the planner is declaring more shift than the
timing can deliver; if `WRONG_WAY_CUE` dominates, the plan's light is in the
phase zone that pushes the clock against the trip — the single most common
way to make eastward jet lag worse. The **delivered** column is the one to
watch over time: it is what the traveller actually gets, and it is the
number the landing quotes them.

## Extending it

Add a scenario: push another `{ name, trip }` onto `SCENARIOS` in
`scripts/eval.ts` — e.g. a fourth persona, or a route that crosses the
antimeridian. Add a metric: it's just another field read off the
`CrewEvent` stream in `runScenario` and the `EvalPayload` shape in
`src/tools/supabase.ts`.

## Trend notes

- **2026-10-16** (replay provider, `REPLAY_BEAT_MS=1`): LHR→HND went 5/5 · 0.90 · 79% shift (pre-overhaul, `origin/main`) → 5/5 · 0.95 · **19%** shift (floor-cap engine) → 5/5 · 0.95 · 19% (after the hold→resume flip fix). LHR→JFK and LHR→MEX flat at 5/5 · 0.91 / 0.90 throughout. The eastward drop is intentional — the solver now caps shifts at the compliance floor instead of drafting 03:45 wakes; the flip fix removed `SHIFT_DIRECTION_FLIP` from the scripted rejection but the scripted days hold, so coverage stays honest.
- **2026-10-20** (replay provider): the replay path's plan became **the
  solver's plan** — it had been keeping a second, weaker planner, and the
  duplicate could not place a day around a fixed commitment, could step over
  a hold, and put an arrival-morning light in the wrong phase zone. With one
  planner: LHR→HND 5/5 · 0.95 · **38% claimed, 56% delivered, 3.5h off at
  landing**; LHR→JFK 5/5 · 0.93 · 100% claimed, 76% delivered, 1.2h off;
  LHR→MEX 5/5 · 0.91 · 87% claimed, **96% delivered, 0.3h off**. The
  westward routes show more violation codes because the *bad first drafts* —
  the ones the recording shows being rejected — now fail in more ways, which
  is the gate working; the locked plans and the scores went up.
- **2026-10-20**: the harness grew the delivered, landing and draft-kept
  columns, and `WRONG_WAY_CUE` joined the violation codes (a day's cues that
  push the clock against the trip). The live provider's **draft kept** number
  is still `—` here — it needs a provider key to exist.
