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
| `/` | Live crew run — lens shell (world/board/calendar/ledger), crew feed (SSE) |
| `/review` | Saved plan: days, citations, .ics download |
| `/history` | Past runs (with provider + fallback provenance) |
| `/outcome` | Post-trip self-report (adherence, jetlag, notes); learned cross-run memory |
| `/team` | Travel-manager view: 12 travellers, 12 crews in parallel (stretch) |
| `/dev` | Lens workbench + recorded-event fixture playback (dev only) |

## Docs

- [Architecture](docs/architecture.md) — pipeline, event stream, artifacts, adherence loop
- [Scoring](docs/scoring.md) — the deterministic gate every plan must pass
- [Providers](docs/providers.md) — replay / anthropic / featherless, env vars, fallbacks
- [Demo runbook](docs/demo.md) — stage path, pacing, localStorage keys, troubleshooting
- [Hackathon plan](docs/hackathon-plan.md) — today's build: 4 lenses, any route, team split, demo script, business case
- [Design vision](docs/design-vision.md) — the Ghost Terminator, immersive-world plan, build tiers, current UI fixes
- [Graph Hacks plan](docs/graph-hackathon.md) — FalkorDB participation strategy, tracks, scope guardrails

## Checks

```bash
bun run typecheck
bun run lint
bun run replay:check   # streams the replay transcript, prints eval verdicts
bun run build
```

Commits run `gitleaks` + typecheck + lint via `.githooks/` (enabled through
`git config core.hooksPath .githooks` — already set in this clone).

## Offline / PWA

Meridian ships a minimal service worker (`public/sw.js`) that caches the app
shell and serves `public/offline.html` when the network is gone. Saved handoffs
live in `localStorage`, so a completed plan stays readable offline.

## Tests

```bash
bun test                 # pure-function tests (scorer, adherence)
bun run smoke            # SSE smoke against a running dev server: night run + morning replan
bun run replay:check     # streams the replay transcript; prints eval verdicts
```
