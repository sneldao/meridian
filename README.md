# Meridian

**Agents that fly ahead of you.** A crew of long-running agents resets your
body clock before you land — turning a trip across time zones into a
day-by-day circadian shift plan grounded in real literature and your actual
calendar.

Built at Accel AI Innovate London, Oct 2026.

**Agents propose, code disposes.** Every plan is gated by a deterministic
circadian scorer — the crew debates, the math decides.

## Quickstart

```bash
bun install
cp .env.example .env.local    # AGENT_PROVIDER=replay works with zero keys
bun run dev                   # http://localhost:3000
```

## The crew

| Agent | Job |
|---|---|
| Mara · ANALYST | Reads the wearable baseline + adherence profile |
| Jun · RESEARCH | Pulls real papers (ScienceMadeReadable → Firecrawl) with DOIs |
| Otto · PLANNER | Drafts each day's shift plan, one at a time |
| Iris · EVAL | Fresh-context evaluator — explains the scorer's verdict |
| Rex · NEGOTIATOR | Reschedules movable calendar events, commits the .ics |

## Routes

| Path | What |
|---|---|
| `/` | Live crew run — sun-track scene + crew feed (SSE) |
| `/review` | Saved plan: days, citations, .ics download |
| `/history` | Past runs |
| `/outcome` | Post-trip self-report (adherence, jetlag, notes) |

## Docs

- [Architecture](docs/architecture.md) — pipeline, event stream, artifacts, adherence loop
- [Scoring](docs/scoring.md) — the deterministic gate every plan must pass
- [Providers](docs/providers.md) — replay / anthropic / featherless, env vars, fallbacks
- [Demo runbook](docs/demo.md) — stage path, pacing, localStorage keys, troubleshooting

## Checks

```bash
bun run typecheck
bun run lint
bun run replay:check   # streams the replay transcript, prints eval verdicts
bun run build
```

Commits run `gitleaks` + typecheck + lint via `.githooks/` (enabled through
`git config core.hooksPath .githooks` — already set in this clone).
