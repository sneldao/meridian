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
`bun run replay:check`); `anthropic` spends real tokens and is where the
trend actually gets interesting, since the live model's attempts vary.

## What gets measured, per scenario run

| Metric | Source |
|---|---|
| Days locked (of 5) | `day_locked` events |
| Mean score | `briefing.score` — mean of every feasible attempt, same number the product shows on the handoff card |
| Attempts used | count of `eval_result` events |
| Violation codes | tallied from every `eval_result.violations[].code`, pass or fail — this is the "what's the model getting wrong" signal |
| Tool calls, wall-clock duration, provider, fallback-to-replay flag | the rest of the row |

## Where it's persisted

Same table as everything else — `public.meridian_events`, tagged
`kind: "eval"` (see [providers.md](providers.md#supabase-persistence-optional)).
No new migration; this reuses the single-JSONB-table pattern the app already
has for runs and check-ins. Falls back to `artifacts/evals.json`
(gitignored) when Supabase isn't configured, same "degrades cleanly"
philosophy as the rest of the app.

## Reading the trend

`--report` groups history by scenario and prints, per scenario: run count,
average lock rate, average score, a run-by-run trend glyph (`●` = 5/5 locked,
`◐` = 4/5, `○` = worse), and the most common violation codes across every
run on record. That last column is the actual roadmap: if `CALENDAR_CONFLICT`
dominates, the planner needs better calendar-awareness in its prompt; if
`SLEEP_TOO_SHORT` dominates, the scorer's floor is colliding with how
aggressively Otto shifts; if `SHIFT_OVERSTATED` dominates, the planner is
declaring more shift than the timing can deliver — prompt it to trust the
solverDraft's number. Today there's one data point per scenario — the
value compounds the more this runs, especially on the live provider where
attempts genuinely vary.

## Extending it

Add a scenario: push another `{ name, trip }` onto `SCENARIOS` in
`scripts/eval.ts` — e.g. a fourth persona, or a route that crosses the
antimeridian. Add a metric: it's just another field read off the
`CrewEvent` stream in `runScenario` and the `EvalPayload` shape in
`src/tools/supabase.ts`.
