<!-- LIVE reference — keep in sync with the code. -->

# Architecture

One Next.js app. The crew runs server-side and streams `CrewEvent`s over SSE;
the UI is a scene renderer + feed on top of that stream.

```
GET /api/crew/run  ──SSE──▶  src/agents/runtime.ts  ──▶  providers ──▶  model
                                │
                                ▼
                          artifacts/  (handoff files + .ics)
```

## Pipeline (`runCrew`, `src/agents/runtime.ts`)

Deterministic orchestration decides who acts when — agents never route to each
other.

1. **Analyst (Mara)** — reads the wearable baseline via tools. That's
   `GARMIN_BASELINE` by default, or `resolveBaseline(wakeBand)` when the
   traveller answered the setup question (`?wake=` on the run route) — plus
   `ADHERENCE_PROFILE` fixtures; extracts chronotype, habitual window,
   compliance floor.
2. **Researcher (Jun)** — calls `searchScience` ≥2 angles; each result becomes a
   first-class `citation` event pinned to later interventions.
3. **Planner (Otto) × Evaluator (Iris)** — the core loop, one `DaySpec` at a
   time, `MAX_ATTEMPTS_PER_DAY = 2`:
   - Before Otto drafts, the **placement solver** (`src/domain/solver.ts`)
     searches shift magnitude × intervention placement against the same gate
     and hands the result over as `solverDraft` — a skeleton that already
     passes. Otto owns intent (how much to claim, notes, citations); the
     solver owns feasible times. `null` means no template placement exists.
     Placement rules the solver applies that the scorer only penalises:
     eastbound it never picks a shift whose wake lands earlier than
     `floor − 105min` (the compliance floor minus the furthest light-anchor
     offset — a hold day is always allowed); light candidates try the
     at/after-floor band before sub-floor anchor starts; the wind-down block
     dodges fixed events by starting later rather than colliding; and the
     first post-flight day converts the previous day's bed/wake into
     destination time before shifting. `previewPlan` on the same module runs
     this chain pre-run for the home page, post-flight days included: the
     engine carries a phase chain through `evaluatePlan` (baseline + locked
     shifts + one boundary conversion) so zeitgeber gates measure against
     circadian phase rather than the schedule target, and `draftDay` has a
     post-flight branch for local-night sleep. `null` is now the genuine
     fallback for "the solver could not place this", not a post-flight rule.
   - Otto submits exactly one `DayPlan` via `submitDayPlan`. The submission is
     **merged over the draft** (`src/domain/draft.ts`): every field is
     optional, so what Otto does not mention keeps the solver's value, and
     moving a time is an explicit act rather than an omission. The merge
     reports the **drift** — the shift difference, the minutes the cues
     moved, the kinds added or dropped — on the `plan_candidate` event, so
     the transcript and the eval harness can both see how much of the
     solver's work survived the planner's intent. The drift is a number, not
     a verdict: the gate still judges the plan.
   - The **deterministic scorer** (`src/domain/circadian.ts`) evaluates it —
    code, not judgment. It also re-derives the plausible shift from zeitgeber
    timing (`modelShiftMin`) and rejects a plan whose declared shift outruns
    what the schedule can deliver (`SHIFT_OVERSTATED`).
   - Iris sees only the plan + scorer verdict (fresh context, no debate
     history) and explains it in two lines.
   - Pass → `day_locked`, sun advances. Fail → violations feed back as the next
     prompt; day stays unlocked.
4. **Negotiator (Rex)** — `proposeMove` on movable calendar events that
   survived the locked plan.
5. **Briefing** — `buildIcs` emits a real `.ics`; summary + mean score stream as
   the `briefing` event, then `done`.

## Event stream

`CrewEvent` union in `src/domain/types.ts` (16 variants). Everything the UI
needs is an event: agent lifecycle, token deltas, tool calls/results,
citations, plan candidates, eval verdicts, day locks, calendar moves,
check-ins, replans, errors.

`plan_candidate` carries an optional `drift`: how far the planner's
submission moved from the solver's draft (the shift difference, the minutes
the cues moved, the kinds added or dropped). It is a number, not a verdict —
the gate judges the plan — but it is how the transcript and the eval harness
both see that the draft is the default and how much of it survived.

Errors are `recoverable: true` where the run can continue (e.g. planner
submitted nothing → `continue`). A provider-level throw mid-run retries once on
`AGENT_PROVIDER_FALLBACK`, then drains the replay transcript — see
[providers.md](providers.md).

The voice layer is a consumer of the same stream: `agent_token` deltas are
sentence-chunked client-side and queued to `POST /api/voice` while generation
is still in flight, so speech overlaps thinking; `briefing.lines` become one
text-to-dialogue call — see [providers.md](providers.md).

## Artifacts

`persistArtifacts` writes to `artifacts/` (gitignored except `.gitkeep`):

- `shift-plan.json` — locked days
- `shift-log.json` — full event/handoff log
- `calendar-plan.ics` — calendar output

These are the handoff layer: context resets are safe because state lives in
files, not in the prompt.

## Adherence loop (`src/domain/adherence.ts`)

Closes observe → plan → outcome. `parseCheckInText` turns a free-text check-in
("skipped the 6am light walk") into a structured `CheckIn`; `foldCheckIns`
updates the `AdherenceProfile` — the compliance floor moves to the latest
early-ask time that still failed, skipped kinds join `weakAt`. The scorer then
penalizes plans the wearer demonstrably won't follow.

Intake endpoint `POST /api/crew/checkin` parses a free-text check-in via
`parseCheckInText`, appends it to crew memory, and fans out to Supabase and the
tenant graph (both optional). `GET /api/crew/run` takes `checkins` (base64 JSON
array of `CheckIn`) and `startDay`; when either is set, `runCrew` folds the
check-ins into the adherence profile and replans only the days from `startDay`
onward. Each check-in streams as a `check_in` event, then a `replan` event
drops the earlier days. In replay mode the morning beat runs
`runMorningReplay` (`src/agents/morning-replay.ts`), which re-drafts the
remaining days from the solver under the folded profile and re-scores them
with the same deterministic gate — the days are re-planned against the body
clock the replan starts from, not re-judged against the full run's chain.

On `/`, per-step did/skip marks queue a trip-scoped ledger and flush as
structured `CheckIn`s on "Tell the crew", with `startDay` derived from the last
marked day (not a fixed index).

**Not wired yet:** the clock's projection takes the traveller's *session* skips
(`Not tonight` on the day) but not the *persisted* check-ins, so a traveller
who missed the light on D-2 still sees a dial that credits them with it. The
projection model already supports it (`skippedDayIndices`); the two surfaces
are not yet one story.

**Traveller scoping.** Middleware stamps a `meridian-tid` cookie per visitor
and mirrors it as `x-meridian-tid` on `/api/*` requests (`src/middleware.ts`,
`src/lib/tenant.ts` → `tenantOf`). Every memory surface scopes by it:
`artifacts/crew-memory-{tid}.json` files, the adherence fold, graph writes,
`recordRun`, `GET /api/memory`. `?tenant=` remains the explicit override
(demos, seeded fixtures, MCP); absent both, the shared `crew-memory.json`
serves the demo traveller.

## Persistence

Optional Supabase layer (`src/tools/supabase.ts`): when `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` are set, runs and check-ins are appended to
`public.meridian_events` and `/api/persistence/runs` serves cross-run history.
Feeds (`meridian_feeds`) and push subscriptions (`meridian_push_subscriptions`)
live there too — feeds fall back to `artifacts/feeds/*.json` on disk without
keys. Everything else falls back to `localStorage`. Project + schema details
in [providers.md](providers.md#supabase-persistence-optional).

## API surface

| Route | Purpose |
|---|---|
| `GET /api/crew/run` | SSE crew stream (`origin`, `dest`, `date`, `checkins`, `startDay`, `wake`, `flight` query params — `wake` ∈ `before6`/`6to8`/`after8` resolves the baseline; `flight` is a departure-window id) |
| `POST /api/crew/checkin` | Free-text check-in → structured `CheckIn` |
| `GET /api/trip` | Trip preview: `trip`, `baseline` + `baselineSource` (`"garmin"` after an upload, else `"fixture"`) + `baselineKind` (`garmin`/`wake-band`/`demo-default`), `adherence`, `calendar` + `calendarSource`, `flightId`, `provider`. `?flight=<id>` moves the flight event to that departure (`flightWindowFor` → `applyFlightChoice`); unknown or wrong-direction ids are ignored and `flightId` comes back `null`. Defaults `date` to `2026-10-18`; the client always sends an explicit date (today + 3 by default). Trip shape is `horizonFor`-sized: pre-flight capped by days left, post-flight bounded 1–5 |
| `POST /api/wearable` | Garmin sleep-export CSV → a per-traveller `WearableBaseline`, which is what makes `baselineSource: "garmin"` possible. Garmin Health API is partner-gated, so the file export is the demo path |
| `GET /api/team/run` | 12 parallel crews, one tagged SSE stream |
| `GET /api/persistence/runs` | Supabase run history; `{"enabled":false}` without keys |
| `GET /api/memory` · `GET /api/graph/health` | Learned cross-run memory; FalkorDB status (503 when unreachable); `?tenant=` selects the `meridian:{tenant}` graph |
| `POST /api/graph/seed` | Seeds/wipes a tenant graph (`{"tenant":"demo"|"other","reset":true?}`) — needed because the Render pserv is internal-only; disabled unless `SEED_ADMIN_TOKEN` is set, then requires `x-seed-token` |
| `GET /api/voice` · `POST /api/voice` | Voice-layer availability; TTS audio — see [providers.md](providers.md) |
| `POST /api/mcp` | Self-hosted MCP server (Streamable HTTP, protocol 2025-11-25; stateless JSON-RPC over POST). Tools wrap the crew surface: `preview_trip`, `plan_shift`, `evaluate_plan`, `record_check_in`, `search_literature`, `crew_memory`, `recall_findings`, `latest_plan`, `search_web` (Tavily), `destination_taste` (Qloo) — implemented in `src/mcp/server.ts`. GET 405s (no server push); DELETE is a no-op. |
| `POST /api/feed` | Create or update a plan feed `{ics, trip, days}` → `{id, key, tokens}`. `key` authorizes updates (hash stored, constant-time compare); `tokens` are per-surface read tokens (`calendar`, `assistant`). Rate-limited, ICS capped at 300KB |
| `GET /api/feed/[id]/calendar.ics` | The webcal URL — serves the current ICS, gated on `?t=` when a calendar token exists. Legacy feeds without tokens still serve on the bare id |
| `POST /api/feed/rotate` | `{id, key, surface}` → mints a fresh read token for one surface, killing its old links. The assistant sheet's "Reset link" |
| `GET /api/assistant/next` | `?feed=<id>&t=<token>&format=text` — one spoken sentence naming the next plan step (`nextStepFromPlan` — zone-aware, pre-flight steps in origin time, post-flight in destination). Built for Siri Shortcuts / any URL-fetching assistant |
| `GET·POST·DELETE /api/push/subscribe` | GET: `{enabled, publicKey}` — false without VAPID env. POST: `{id, key, endpoint, keys}` stores a Web Push subscription under the feed's write key. DELETE by endpoint stops sends |
| `GET /api/cron/dispatch` | The reminder sender — `Authorization: Bearer $CRON_SECRET`, intended to run every ~15 min. For each subscription: reads the feed, sends steps due inside the dispatch window (late beats never for a missed tick), dedupes via the row's `sent` map, culls dead endpoints (404/410). 503 when push isn't configured |

## Layout

```
src/domain/      types, circadian scorer + phase-response model, placement
                 solver + previewPlan, today (which day is now, next step),
                 sun (subsolar point, terminator, body-clock ghost), dawn-layers
                 (the shared day/night + ghost path builder both globes draw),
                 adherence, readiness, arrival (the landing read + headline),
                 arrival-rows (the `/arrival` cells, kept out of the component
                 so the numbers can be asserted), fixtures (trip horizon via
                 horizonFor; Alex fixture for the demo route,
                 neutralCalendarFor elsewhere),
                 misalignment (the body-clock projection the dial shows:
                 circular time, the modelled trajectory, the do-nothing
                 baseline, the uncertainty band, the advance-vs-delay
                 options), evidence (the seed table of grades + channels),
                 citations (the one catalogue of papers the app may cite),
                 mascot (the mascot's voice rules), shift-work (the rotating
                 night-shift week: an authored seed, a computed clock),
                 draft (the planner's submission merged over the solver's
                 draft, and the drift between them)
src/tools/       science (SMR → Firecrawl → static), tavily, qloo,
                 calendar (ICS), wearable
src/agents/      providers, crew prompts, runtime, night replay, morning replay
                 (the replay path's plan is the solver's plan — the same
                 draft the live path hands the planner)
src/components/  NudgeFeedScreen (the Calm `/` surface: next step, timeline,
                 readiness), dial/ (the clock view: CircadianDial, the mascot,
                 the daily action card, the five-step setup, the disclosure
                 sheet, and ShiftScreen — the shift week, which has its own
                 route at /shift),
                 TripSummary (trip chip + edit sheet),
                 HeroDawnPanel + DawnScrubber (the residual globe and its
                 clock/shift scrubber — hover, fine-pointer drag, and two native
                 range inputs, all layered on a caption that states the same
                 read in words), RunAnnouncer (aria-live run narration),
                  TripSetupScreen (setup body), DeepDiveVisuals
                 (globe / swimlane / week, `?depth=guided` only), CrewFeed,
                 DayStrip, BriefingCard, HandoffBanner, RoutePicker,
                 MorningCheckin, DailyJourney, AgentDrawer, AnchoredPopover,
                 lenses/, ui/
src/lib/         voice/ (engine, config, cache, split, align, huddle),
                 motion tokens, intervention icon vocabulary
src/mcp/         MCP server: JSON-RPC dispatch + tool catalogue
src/app/         pages + api routes (/, /arrival, /review, /history, /outcome,
                 /crew, /shift, /dev)
artifacts/       runtime handoff artifacts (gitignored)
scripts/         replay-check, provider-check, smoke (night + morning),
                 eval, seed-graph, verify-commit
docs/            this documentation
```
