# Meridian

**Agents that fly ahead of you.** A crew of long-running Claude agents resets
your body clock before you land — turning a trip across time zones into a
day-by-day circadian shift plan grounded in real literature and your actual
calendar.

Built at Accel AI Innovate London, Oct 2026.

## The crew

| Agent | Job |
|---|---|
| Mara · ANALYST | Reads the wearable baseline + adherence profile |
| Jun · RESEARCH | Pulls real papers (ScienceMadeReadable / Firecrawl) with DOIs |
| Otto · PLANNER | Drafts each day's shift plan, one at a time |
| Iris · EVAL | Fresh-context evaluator — explains the deterministic scorer's verdict |
| Rex · NEGOTIATOR | Reschedules movable calendar events, commits the .ics |

**Agents propose, code disposes.** Every plan is gated by a deterministic
circadian scorer (`src/domain/circadian.ts`): ≤90 min/day phase shift, caffeine
8h before bed, timed-light anchors, calendar conflicts, per-person adherence
risk. The evaluator explains; the math decides.

## Run it

```bash
bun install
bun run dev          # http://localhost:3000
```

## Providers (`AGENT_PROVIDER`)

- `replay` — zero tokens, scripted transcript. Stage insurance and UI dev. (default)
- `anthropic` — live Claude crew. Needs `ANTHROPIC_API_KEY`. Falls back to replay on failure.
- `featherless` — OpenAI-compatible open models for cheap iteration.

Model IDs configurable via `MERIDIAN_ORCHESTRATOR_MODEL` / `MERIDIAN_SPECIALIST_MODEL`.

## Checks

```bash
bun run typecheck
bun run replay:check   # streams the replay transcript, prints eval verdicts
bun run build
```

## Layout

```
src/domain/     types, circadian scorer, fixtures
src/tools/      science search (SMR -> Firecrawl -> verified fallback), calendar (ICS), wearable
src/agents/     providers, crew prompts, orchestrator runtime, replay transcript
src/components/ SunTrack scene, CrewFeed, DayStrip, BriefingCard
artifacts/      runtime handoff artifacts (shift-plan.json, shift-log.json, .ics)
```
