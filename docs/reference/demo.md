<!-- LIVE reference — keep in sync with the code. -->

# Demo runbook

## The safe path

```bash
AGENT_PROVIDER=replay bun run dev    # verified end-to-end, zero tokens, works offline
```

Click **Make my plan** on Today. ~45 s of scripted-but-honest transcript: the
scorer really runs, the rejections are real verdicts against real plans, and
the `.ics` is a genuine artifact. Two visible recoveries (`CALENDAR_CONFLICT`
on D-2 and D-1) — each one bounces red, goes back under Iris's scan line on the
retry, then snaps locked — and five day locks. The plan it locks is the
**solver's** plan: the replay path used to keep a second, weaker planner of
its own, and the two had drifted. The mission clock ticks on wall
time even while the model is quiet.

Pacing knob: `REPLAY_BEAT_MS` env var (default `60`, read in `replay.ts` and
`morning-replay.ts`) — ms between streamed events. Default is too fast to
narrate (~7.5 s for a full night shift); set `REPLAY_BEAT_MS=300` in
`.env.local` on the stage machine (~40 s, narratable). Keep the default for
tests and fixture recording — see `docs/archive/hackathon-plan.md` §11.

## The morning replan (replay)

The recorded morning beat needs no keys. Open the run with a start day and a
check-in (base64 JSON array of `CheckIn`):

```
https://meridian-afud.onrender.com/?startDay=2&checkins=<base64 of [{"id":"c1","dayIndex":1,"kind":"light_exposure","startMin":300,"status":"skipped","text":"skipped the 5am light","at":0}]>
```

The feed shows `wearer reported: …` then `replan — …`. On the board, the
dropped days' plans visibly dissolve (the old sleep bars fade out) and re-draft;
D-1, Flight and D+1 are re-locked; D-3 and D-2 carry over as lived.

## Voice on stage

With `ELEVENLABS_API_KEY` in `.env.local`, the crew talks while it thinks:
each agent's output is spoken sentence-by-sentence as tokens stream (no
waiting for `agent_end`), the spoken prefix lights up in the feed in the
agent's colour, and the handoff is a multi-voice text-to-dialogue exchange —
the crew talking the locked plan over in one call (the "huddle"). Without a
key, voice reads as "unavailable" in the menu and everything else works.

- Menu → voice toggle controls live speech; the BriefingCard **Listen** button
  replays the handoff even when the toggle is off.
- **Replay runs are instant and free after the first.** Audio is cached by
  content hash (memory + Supabase Storage bucket `meridian-voice`), and the
  replay transcript is deterministic — verified: second run serves 23/23
  sentences from cache at ~7ms each. Warm the cache with one full run before
  the slot; live paths never cache because text differs per run.
- Failures are visible, not silent: a bad key or exhausted quota posts a
  `voice unavailable: …` error to the feed and switches the layer off for the
  session.
- Env knobs (`ELEVENLABS_MODEL_ID`, `MERIDIAN_VOICE_SEED`, kill-switches,
  per-seat voices): [providers.md](providers.md).

## The live path

```bash
bun run dev          # AGENT_PROVIDER=featherless, fallback=nebius — see providers.md
ANTHROPIC_API_KEY=... AGENT_PROVIDER=anthropic bun run dev   # quality path
```

If the primary provider throws, the run retries once on
`AGENT_PROVIDER_FALLBACK`, then drains replay mid-stream — the audience sees
`error` events and the show continues. Verify a configured provider with
`bun run provider:check` (one forced tool call, seconds) before a full run —
cheap open models fail per-model, not per-key. Still: do one full live run
before judging; the planner prompt assumes exactly one `submitDayPlan` call
per day and may need tuning.

## Routes for the pitch

- `/` — Today: the one step to do now, the day timeline, readiness. Pre-run
  days show the solver's own preview (scorer-checked, compliance-floor-capped).
  Post-flight days are planned after landing. `?depth=guided` adds the
  deep-dive visuals; `/crew` is the operator rung (lens shell + crew feed
  + eval verdict cards).
- `/` → **Clock** — the second view of the same plan, and the default once
  the crew has locked days: the 24-hour dial, the daily action card, the
  projection with its uncertainty band and the do-nothing baseline beside it.
  The timeline stays for the first landing and as the other view.
- `/shift` — the rotating night-shift week, on its own door: the anchor sleep
  window, the fixed and negotiable commitments, the one movable thing (the
  15:30 pickup, behind a hold), and the post-night-shift driving warning.
- `/review` — the artifact: plan, citations, `.ics` download (persists via
  localStorage, survives refresh)
- `/history` — past runs (`meridian:history` localStorage capped at 20, plus
  Supabase `meridian_events` when `SUPABASE_URL` is configured)
- `/outcome` — post-trip self-report; the hook for the adherence story

## localStorage keys

| Key | Written by |
|---|---|
| `meridian:lastPlan` | `/` on briefing → read by `/review` |
| `meridian:lastTrip` | `/` on `run_start` → read by `/review` |
| `meridian:history` | `/` on briefing → read by `/history` |
| `meridian:onboarded` | `/` onboarding dismiss |
| `meridian:outcomes` | `/outcome` submissions |
| `meridian:checkins` | `/outcome` (structured via `/api/crew/checkin`) → read by replan runs |
| `meridian:wakeBand` | the inline wake question on `/` → the wake-band baseline |
| `meridian:lastPlan` (the `coverage` and `baseline` fields inside it) | the gate's promise and the baseline the plan was built on, read back by `/arrival` to score the trip against the projection |
| `meridian:completedNudges:<origin>-<dest>-<date>` | per-step did/skip marks, trip-scoped |
| `meridian:depth` | Calm / Guided depth dial |
| `meridian:voice` | voice toggle |

Per-traveller memory is **not** localStorage — a `meridian-tid` cookie scopes
`artifacts/crew-memory-<tid>.json`, the adherence fold, graph writes and run
records. Clearing localStorage does not reset a traveller's memory; see
`reset all` on `/history`.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Stream dies instantly | Provider misconfigured → check `.env.local`; replay needs nothing |
| Plan stuck locked at 0 | `bun run replay:check` — prints every eval verdict. If `.env.local` points at a provider with no key, every day fails this way; `AGENT_PROVIDER=replay` runs with zero keys |
| CTA stuck on "Checking your plan" | The client watchdog resets after 60s idle (12s once a briefing lands). If it never clears, a post-briefing write is blocking `done` — all four are now bounded to 4s, so a slow FalkorDB can't do it |
| No evidence chips in a step | By design — evidence only exists after a real crew run. On a machine whose provider is failing there is no plan, so there is nothing to show evidence about |
| `/arrival` says "still London time" | It judges arrival at the **destination's** clock, which is correct. Pass a past `?date=` to see the payoff: `/arrival?date=YYYY-MM-DD`, and `&arrived=1` to pretend the trip is over |
| `/arrival` says the plan carried nothing | It scores against the *projection* — what the day's timing can actually deliver — not the plan's declared shift. A plan that declared more than its light could carry is the case the page exists to name; the plan it was saved from is the solver's, and the clock shows the same number |
| The Clock view is empty | The clock needs a plan: a trip and a baseline. Before the crew has run there is nothing to project, and it says so rather than showing a number |
| The dial looks washed out in the dark | The dial's colours are tokens that flip with the night theme. If a surface was restyled with hardcoded hex it will not flip — that is the bug the token work fixed |
| Fresh clone, hooks silent | `git config core.hooksPath .githooks` |
| Stage wifi dead | `replay` needs no network at all — that's the point |
| Morning replan shows the night script | URL has no `startDay` or `checkins` — add them |
