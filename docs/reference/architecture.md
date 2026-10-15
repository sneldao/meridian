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

1. **Analyst (Mara)** — reads `GARMIN_BASELINE` + `ADHERENCE_PROFILE` fixtures
   via tools; extracts chronotype, habitual window, compliance floor.
2. **Researcher (Jun)** — calls `searchScience` ≥2 angles; each result becomes a
   first-class `citation` event pinned to later interventions.
3. **Planner (Otto) × Evaluator (Iris)** — the core loop, one `DaySpec` at a
   time, `MAX_ATTEMPTS_PER_DAY = 2`:
   - Before Otto drafts, the **placement solver** (`src/domain/solver.ts`)
     searches shift magnitude × intervention placement against the same gate
     and hands the result over as `solverDraft` — a skeleton that already
     passes. Otto owns intent (how much to claim, notes, citations); the
     solver owns feasible times. `null` means no template placement exists.
   - Otto submits exactly one `DayPlan` via `submitDayPlan`.
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

Errors are `recoverable: true` where the run can continue (e.g. planner
submitted nothing → `continue`). A provider-level throw mid-run falls back to
the replay transcript — see [providers.md](providers.md).

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
`parseCheckInText`. `GET /api/crew/run` takes `checkins` (base64 JSON array of
`CheckIn`) and `startDay` (0–4); when either is set, `runCrew` folds the
check-ins into the adherence profile and replans only the days from `startDay`
onward. Each check-in streams as a `check_in` event, then a `replan` event
drops the earlier days. In replay mode the morning beat runs
`runMorningReplay` (`src/agents/morning-replay.ts`), which re-scores the
scripted days under the folded profile with the same deterministic gate.

## Persistence

Optional Supabase layer (`src/tools/supabase.ts`): when `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` are set, runs and check-ins are appended to
`public.meridian_events` and `/api/persistence/runs` serves cross-run history.
Without them everything falls back to `localStorage`. Project + schema details
in [providers.md](providers.md#supabase-persistence-optional).

## API surface

| Route | Purpose |
|---|---|
| `GET /api/crew/run` | SSE crew stream (`checkins`, `startDay` query params) |
| `POST /api/crew/checkin` | Free-text check-in → structured `CheckIn` |
| `GET /api/trip` | Trip preview: schedule, baseline, calendar, provider |
| `GET /api/team/run` | 12 parallel crews, one tagged SSE stream |
| `GET /api/persistence/runs` | Supabase run history; `{"enabled":false}` without keys |
| `GET /api/memory` · `GET /api/graph/health` | Learned cross-run memory; FalkorDB status (503 when unreachable) |
| `GET /api/voice` · `POST /api/voice` | Voice-layer availability; TTS audio — see [providers.md](providers.md) |
| `POST /api/mcp` | Self-hosted MCP server (Streamable HTTP, protocol 2025-11-25; stateless JSON-RPC over POST). Tools wrap the crew surface: `preview_trip`, `plan_shift`, `evaluate_plan`, `record_check_in`, `search_literature`, `crew_memory`, `recall_findings`, `latest_plan`, `search_web` (Tavily), `destination_taste` (Qloo) — implemented in `src/mcp/server.ts`. GET 405s (no server push); DELETE is a no-op. |

## Layout

```
src/domain/      types, circadian scorer + phase-response model, placement
                 solver, adherence, readiness, fixtures
src/tools/       science (SMR → Firecrawl → static), calendar (ICS), wearable
src/agents/      providers, crew prompts, runtime, night replay, morning replay
src/components/  CrewFeed, DayStrip, BriefingCard, RoutePicker,
                 MorningCheckin, AnchoredPopover, lenses/, ui/ primitives
src/lib/         voice/ (engine, config, cache, split, align, huddle),
                 motion tokens, intervention icon vocabulary
src/mcp/         MCP server: JSON-RPC dispatch + tool catalogue
src/app/         pages + api routes
artifacts/       runtime handoff artifacts (gitignored)
scripts/         replay-check and smoke (night + morning) checks
docs/            this documentation
```
