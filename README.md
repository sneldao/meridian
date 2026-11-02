# Meridian

**Agents that fly ahead of you.** A crew of long-running agents plans your
body-clock adjustment before you land — a day-by-day sleep, light and
caffeine plan timed to your trip, grounded in real literature and your actual
calendar.

Built at Accel AI Innovate London, Oct 2026.

**Agents propose, code disposes.** A deterministic placement solver drafts the
times, the crew debates intent, and a scorer backed by a phase-response model
decides — a plan's declared shift is checked against what its zeitgeber timing
can actually deliver.

**Live:** https://meridian.trustfall.xyz

## Quickstart

```bash
bun install
cp .env.example .env.local    # defaults to featherless (needs a key) — AGENT_PROVIDER=replay runs with zero keys
bun run dev                   # http://localhost:3000
```

Optional extras, all in `.env.local` — every one degrades gracefully when unset:

- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — run history, durable
  calendar/assistant feeds, durable shared cards (`meridian_shares` —
  without it `/plan/{id}` links die with the ephemeral disk), and push
  subscriptions (project `vpeakvspljdoxbwfsdvw`, see
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

## Powered by Qloo

The crew is culturally grounded, not just schedule-smart — via
[Qloo](https://www.qloo.com)'s taste graph (built for the Qloo Agentic
Hackathon). The integration, end to end:

- **`/search`** resolves up to three traveller favourites — artists, films,
  books, brands — to taste-graph entities (`/api/taste/search`,
  `src/tools/qloo.ts`, surfaced by `TasteDiscovery`).
- **`/v2/insights`** turns those entities into real places at the
  destination: `filter.location.query` keeps results inside the locality,
  and `signal.interests.entities` carries the favourites as the
  cross-domain affinity signal — music you love → places you'll love
  (`/api/taste`, `destinationTaste`).
- **Taste decides _what_, never _when_.** Qloo-ranked ideas are fitted into
  the free hours the verified plan leaves open
  (`src/domain/taste-itinerary.ts`); the phase-response scorer still owns
  every sleep, light and caffeine time. Favourites reach the planner as
  untrusted data under strict guardrails (`src/agents/taste-context.ts`),
  and Otto can call `destinationTaste` mid-run as a real tool.
- Also exposed as the MCP tool **`destination_taste`**
  (`src/mcp/server.ts`), so any MCP client gets the same taste grounding.
- **It remembers.** Favourites ride in a `self` profile across trips, and
  every keep/swap/dismiss lands in a device-local signals store (which
  feeds the `marks` run param — the loop works before the graph does)
  **and** as a graph edge (`/api/taste/feedback` → `recordTasteSignal`)
  for cross-device memory (`tasteHistory` in `loadTasteContext` +
  `/api/taste`). See [the flagship plan](docs/plan/taste-flagship.md).

The contrast is demoable in one click: the `/demo` taste beat and the
`?example=` journeys toggle between two recorded taste profiles — Björk's
Tokyo (galleries, quiet cafés) is not Luke Combs's Tokyo — same route, same
plan, different places.

## Routes

| Path | What |
|---|---|
| `/pitch` | *(removed — the deck retired with the pre-overhaul surface)* |
| `/` | Today — the playable plan: the important moment, destination/estimated body time, modeled sun and real seek/reduce/sleep windows, then optional Qloo place ideas and a privacy-gated day card. No trip yet → an explicit entry form whose sun-self wakes as the route is typed; `?example=miles|danny|sofia` runs the disclosed fictional journeys (Miles Mercer, Danny Rivers, Sofia Marchetti — archetypes, not real people) without saving trip, plan, or marks. Those journeys are a three-step flow (pick a day → scrub the day → see the plan); `step=0|1|2` and `day=<index>` in the URL reopen the same step and day, and the scrubbed time drives the plan's "Plan for HH:MM" readout (the minute itself is not in the URL). Once the plan has locked days, a native *"How my body clock is adjusting"* disclosure sits **below** Today — read-only: the 24-hour dial, projection and baseline from the same model the scorer gates with. `?view=clock` opens it; `?depth=guided` adds the guided visuals; `?example=1` remains the generic sample. Once days are locked, a **Now / The plan** switch shows the signed artifact (board, day cards, citations, exports) inline; done steps answer with a model-gated receipt ("≈ N min of the day's M min — banked"); once the trip is over, a morning-after card leads to the arrival report |
| `/arrival` | The payoff — first morning in the destination, scored against what the gate promised. Reached from Today once the last planned day passes, or `?date=` to score any trip (`?arrived=1` to preview). The stamped record carries the traveller's portrait — the sun-self, computed from the trip's debt and banked shift |
| `/demo` | The ninety-second story: stakes → crew → plan → payoff, every figure computed by the live solver. `?s=danny\|sofia` switches the life; `/?demo=1` is the same door. Shareable — the OG preview is composed from the real demo artifacts |
| `/crew` | The operator rung — lens shell, crew feed, eval verdict cards, and the voice layer. Reached from the Home menu ("AI at work") |
| `/review` | Saved plan: days, citations, .ics download |
| `/history` | Past runs (with provider + fallback provenance) |
| `/outcome` | Post-trip self-report (adherence, jetlag, notes); learned cross-run memory. Gated on a saved plan — no plan, nothing to grade |
| `/shift` | Shift work — the rotating night-shift week on its own door: the anchor sleep window, the fixed and negotiable commitments, the one movable thing (the 15:30 pickup, behind a hold), and the post-night-shift driving warning |
| `/team` | Travel-manager view: 12 travellers, 12 crews in parallel (stretch) |
| `/dev` | Lens workbench + recorded-event fixture playback + the dial workbench + the contested-day prototype + the crew-question card specimen (dev only) |
| `/plan/{id}` | The shared card — a plan's passport line or the post-landing arrival receipt, with a generated OG image (terminator + ghost dawn drawn from the payload's real owed minutes). "Make your own plan" lands recipients on `/?via={id}`, which acknowledges the share and prefills the sender's route |
| `/api/*` | Server surface — run SSE, check-in, trip, wearable upload, team, persistence, memory, graph health, Qloo destination/favorite search + taste feedback, voice ([reference](docs/reference/architecture.md#api-surface)) |

## Docs

Design direction — where the product is going, and the rules every design
decision is held to:

- [Product vision](docs/vision.md) — the journey around the image: explicit
  trip first, one question at the right moment, caption-first interaction,
  progressive explanation, and the landing payoff
- [Design system](design.md) — the locked *Cinematic Dawn* system: Fraunces /
  Inter / JetBrains Mono, the ink-stage grammar, and the rules every page is
  held to (kept in sync with `src/app/globals.css`)

Reference (kept in sync with the code):

- [Architecture](docs/reference/architecture.md) — pipeline, event stream, API surface, artifacts, adherence loop
- [Scoring](docs/reference/scoring.md) — the deterministic gate every plan must pass
- [Providers](docs/reference/providers.md) — featherless / nebius / anthropic / replay, env vars, fallback chain
- [Demo runbook](docs/reference/demo.md) — stage path, pacing, localStorage keys, troubleshooting
- [Interaction research](docs/reference/interaction-research.md) — playable-day, modeled-stage and privacy-conscious sharing direction
- [Evals](docs/reference/evals.md) — the harness that tracks plan quality over time (`bun run eval`), not a hillclimb yet, the shape of one
- [Design primitives](docs/reference/design-primitives.md) — what the reference build does, what it buys, and what we took
- [Backlog](docs/plan/backlog.md) — what's left, ranked
- [Flagship plan](docs/plan/taste-flagship.md) — the personal taste-graph
  direction: the agent that knows your taste and your body clock
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
bun test               # domain, entry, action-ledger, provenance, SSR markup
bun run typecheck
bun run lint
bun run replay:check   # streams the replay transcript, prints eval verdicts
bun run eval            # scores the crew against a fixed scenario matrix, persists the trend
bun run build
```

Commits run `gitleaks` + typecheck + lint via `.githooks/` (enabled through
`git config core.hooksPath .githooks` — already set in this clone).

`.github/workflows/ci.yml` runs typecheck + the full suite on every push and
pull request with no services and no API keys: `FALKORDB_URL` unset is a
supported state and an unset `AGENT_PROVIDER` resolves to `replay`, so a suite
that only passes on a laptop with a running FalkorDB can't be the only gate.

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
bun test                 # pure functions (scorer, adherence, home entry,
                         # trip-action ledger, baseline provenance) plus
                         # render-to-static-markup surface checks — no browser
bun run smoke            # SSE smoke against a running dev server: night run + morning replan
bun run replay:check     # streams the replay transcript; prints eval verdicts
```

`tests/design-contract.test.ts` executes `design.md` instead of paraphrasing
it: every step kind has a hue in every palette, a step with no kind claims no
data colour, the `.wide` sites are the sanctioned instrument bands, only
transform/opacity/paint animate, and a hedged state is hedged once. The
token-over-literal and inline-style counts are ratchets frozen in that file —
they may shrink, never grow, and a new file starts at zero.
