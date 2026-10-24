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

Optional extras, all in `.env.local` — every one degrades gracefully when unset:

- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — run history, durable
  calendar/assistant feeds, and push subscriptions (project
  `vpeakvspljdoxbwfsdvw`, see
  [providers.md](docs/reference/providers.md#supabase-persistence-optional))
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` —
  push notifications that arrive while the app is closed
  (`npx web-push generate-vapid-keys`)
- `CRON_SECRET` — bearer token guarding `GET /api/cron/dispatch`, the
  scheduler endpoint that actually sends pushed reminders (call it every
  ~15 min from Render cron / any scheduler)

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
| `/` | Today — the one step to do now, then the day timeline and readiness. No trip yet → setup; trip set → a trip chip with an Edit sheet. Asks one personalisation question inline when the baseline is still the demo one, and takes a departure window that the solver plans around. `?depth=guided` adds the deep-dive visuals. A **Clock** toggle (next to Simple/Detailed) opens the second view of the same plan: the 24-hour dial, the daily action card and the five-step setup — the projection, the do-nothing baseline and the uncertainty band, all from the same phase-response model the scorer gates with. **The Clock is the default once the crew has locked days**; the timeline stays for the first landing and as the other view |
| `/arrival` | The payoff — first morning in the destination, scored against what the gate promised. Reached from Today once the last planned day passes, or `?date=` to score any trip (`?arrived=1` to preview) |
| `/review` | Saved plan: days, citations, .ics download |
| `/history` | Past runs (with provider + fallback provenance) |
| `/outcome` | Post-trip self-report (adherence, jetlag, notes); learned cross-run memory. Gated on a saved plan — no plan, nothing to grade |
| `/shift` | Shift work — the rotating night-shift week on its own door: the anchor sleep window, the fixed and negotiable commitments, the one movable thing (the 15:30 pickup, behind a hold), and the post-night-shift driving warning |
| `/team` | Travel-manager view: 12 travellers, 12 crews in parallel (stretch) |
| `/dev` | Lens workbench + recorded-event fixture playback + the dial workbench (dev only) |
| `/api/*` | Server surface — run SSE, check-in, trip, wearable upload, team, persistence, memory, graph health, voice ([reference](docs/reference/architecture.md#api-surface)) |

## Docs

Design direction — where the product is going, and the rules every design
decision is held to:

- [Product vision](docs/vision.md) — the journey around the image: one question
  at the right moment, caption-first interaction, the depth dial, and the
  landing payoff
- [Design system](design.md) — the locked *Cinematic Dawn* system: Fraunces /
  Inter / JetBrains Mono, the ink-stage grammar, and the rules every page is
  held to (kept in sync with `src/app/globals.css`)

Reference (kept in sync with the code):

- [Architecture](docs/reference/architecture.md) — pipeline, event stream, API surface, artifacts, adherence loop
- [Scoring](docs/reference/scoring.md) — the deterministic gate every plan must pass
- [Providers](docs/reference/providers.md) — featherless / nebius / anthropic / replay, env vars, fallback chain
- [Demo runbook](docs/reference/demo.md) — stage path, pacing, localStorage keys, troubleshooting
- [Evals](docs/reference/evals.md) — the harness that tracks plan quality over time (`bun run eval`), not a hillclimb yet, the shape of one
- [Design primitives](docs/reference/design-primitives.md) — what the reference build does, what it buys, and what we took
- [Backlog](docs/plan/backlog.md) — what's left, ranked
- [Graph memory](docs/reference/graph-memory.md) — FalkorDB state + Graph Hacks sprint to the 2026-10-18 deadline

Archive (frozen 2026-10-15 hackathon material — history, not current state):

- [Hackathon submissions](docs/plan/hackathon-submissions.md) — external hackathons Meridian is eligible for, ranked targets + per-sponsor deltas
- [Hackathon plan](docs/archive/hackathon-plan.md) — the day's build: 4 lenses, any route, team split, demo script, business case (§11 still live)
- [Design vision](docs/archive/design-vision.md) — the Ghost Terminator, immersive-world plan, build tiers
- [Graph Hacks plan](docs/archive/graph-hackathon.md) — FalkorDB participation strategy, tracks, scope guardrails
- [ICP](docs/archive/icp.md) — the two personas the fixtures are built from
- [Commercial](docs/archive/commercial.md) — deployment + monetisation story behind the live URL
- [Pitch narrative](docs/archive/pitch.md) — verified framing material for the stage

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

The same service worker carries Web Push (`push` + `notificationclick`
handlers): reminders arrive while the app is closed when VAPID is configured,
and Done/Skip taps focus an open window or deep-link the mark back in.
Calendar and assistant surfaces ride `meridian_feeds` — webcal subscriptions
stay current as plans change, and `/api/assistant/next` speaks the next step
for Siri Shortcuts or any URL-fetching assistant.

## Tests

```bash
bun test                 # pure-function tests (scorer, adherence)
bun run smoke            # SSE smoke against a running dev server: night run + morning replan
bun run replay:check     # streams the replay transcript; prints eval verdicts
```
