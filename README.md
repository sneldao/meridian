# Meridian

**Agents that fly ahead of you.** A crew of long-running agents resets your
body clock before you land — turning a trip across time zones into a
day-by-day circadian shift plan grounded in real literature and your actual
calendar.

Built at Accel AI Innovate London, Oct 2026.

**Agents propose, code disposes.** A deterministic placement solver drafts the
times, the crew debates intent, and a scorer backed by a phase-response model
decides — a plan's declared shift is checked against what its zeitgeber timing
can actually deliver.

**Live:** https://meridian-afud.onrender.com

## Quickstart

```bash
bun install
cp .env.example .env.local    # defaults to featherless (needs a key) — AGENT_PROVIDER=replay runs with zero keys
bun run dev                   # http://localhost:3000
```

Optional: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` persist
run history server-side (project `vpeakvspljdoxbwfsdvw`, see
[providers.md](docs/reference/providers.md#supabase-persistence-optional)).

## The crew

| Agent | Job |
|---|---|
| Mara · ANALYST | Reads the wearable baseline + adherence profile |
| Jun · RESEARCH | Pulls real papers (ScienceMadeReadable → Firecrawl) with DOIs |
| Otto · PLANNER | Drafts each day's shift plan from a solver-placed skeleton, one at a time |
| Iris · EVAL | Fresh-context evaluator — explains the scorer's verdict |
| Rex · NEGOTIATOR | Reschedules movable calendar events, commits the .ics |

## Routes

| Path | What |
|---|---|
| `/pitch` | *(removed — the deck retired with the pre-overhaul surface)* |
| `/` | Today — the one step to do now, then the day timeline and readiness. No trip yet → setup; trip set → a trip chip with an Edit sheet. `?depth=guided` adds the deep-dive visuals |
| `/review` | Saved plan: days, citations, .ics download |
| `/history` | Past runs (with provider + fallback provenance) |
| `/outcome` | Post-trip self-report (adherence, jetlag, notes); learned cross-run memory |
| `/team` | Travel-manager view: 12 travellers, 12 crews in parallel (stretch) |
| `/dev` | Lens workbench + recorded-event fixture playback (dev only) |
| `/api/*` | Server surface — run SSE, check-in, trip, team, persistence, memory, graph health, voice ([reference](docs/reference/architecture.md#api-surface)) |

## Docs

Reference (kept in sync with the code):

- [Architecture](docs/reference/architecture.md) — pipeline, event stream, API surface, artifacts, adherence loop
- [Scoring](docs/reference/scoring.md) — the deterministic gate every plan must pass
- [Providers](docs/reference/providers.md) — featherless / nebius / anthropic / replay, env vars, fallback chain
- [Demo runbook](docs/reference/demo.md) — stage path, pacing, localStorage keys, troubleshooting
- [Evals](docs/reference/evals.md) — the harness that tracks plan quality over time (`bun run eval`), not a hillclimb yet, the shape of one
- [Graph memory](docs/reference/graph-memory.md) — FalkorDB state + Graph Hacks sprint to the 2026-10-18 deadline

Active:

- [Hackathon submissions](docs/plan/hackathon-submissions.md) — external hackathons Meridian is eligible for, ranked targets + per-sponsor deltas
- [Consolidation](docs/plan/consolidation.md) — consumer face + depth dial spec (Calm/Guided/Operator)
- [Next steps](docs/plan/next-steps.md) — consumer simplification direction, post-Oct-30
- [Consumer appeal plan](docs/plan/consumer-appeal-implementation.md) — sequenced implementation plan from the design research
- [Home page overhaul](docs/plan/home-page-overhaul.md) — shipped 2026-10-17 (accuracy fixes, one-flow layout, honest claims)
- [Home signature pass](docs/plan/home-signature-pass.md) — shipped 2026-10-17 (hero meaning, voice ramp, nudge→impact loop)
- [Any-route pass](docs/plan/any-route.md) — shipped 2026-10-17 (parameterized trip horizon, neutral default calendar, connect-state surfacing, picker UX)

Plan & pitch (frozen at the 2026-10-15 hackathon — history, not current state):

- [Hackathon plan](docs/plan/hackathon-plan.md) — the day's build: 4 lenses, any route, team split, demo script, business case (§11 still live)
- [Design vision](docs/plan/design-vision.md) — the Ghost Terminator, immersive-world plan, build tiers
- [Graph Hacks plan](docs/plan/graph-hackathon.md) — FalkorDB participation strategy, tracks, scope guardrails
- [ICP](docs/plan/icp.md) — the two personas the fixtures are built from
- [Commercial](docs/plan/commercial.md) — deployment + monetisation story behind the live URL
- [Pitch narrative](docs/plan/pitch.md) — verified framing material for the stage

## Checks

```bash
bun run typecheck
bun run lint
bun run replay:check   # streams the replay transcript, prints eval verdicts
bun run eval            # scores the crew against a fixed scenario matrix, persists the trend
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
