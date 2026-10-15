<!-- LIVE reference — keep in sync with the code. -->

# Demo runbook

## The safe path

```bash
AGENT_PROVIDER=replay bun run dev    # verified end-to-end, zero tokens, works offline
```

Click **start the night shift**. ~45 s of scripted-but-honest transcript: the
scorer really runs, the rejections are real verdicts against real plans, and
the `.ics` is a genuine artifact. Two visible recoveries (`CALENDAR_CONFLICT`
on D-2 and D-1) — each one bounces red, goes back under Iris's scan line on the
retry, then snaps locked — and five day locks. The mission clock ticks on wall
time even while the model is quiet.

Pacing knob: `REPLAY_BEAT_MS` env var (default `60`, read in `replay.ts` and
`morning-replay.ts`) — ms between streamed events. Default is too fast to
narrate (~7.5 s for a full night shift); set `REPLAY_BEAT_MS=300` in
`.env.local` on the stage machine (~40 s, narratable). Keep the default for
tests and fixture recording — see `docs/plan/hackathon-plan.md` §11.

## The morning replan (replay)

The recorded morning beat needs no keys. Open the run with a start day and a
check-in (base64 JSON array of `CheckIn`):

```
https://meridian-afud.onrender.com/?startDay=2&checkins=<base64 of [{"id":"c1","dayIndex":1,"kind":"light_exposure","startMin":300,"status":"skipped","text":"skipped the 5am light","at":0}]>
```

The feed shows `wearer reported: …` then `replan — …`. On the board, the
dropped days' plans visibly dissolve (the old sleep bars fade out) and re-draft;
D-1, Flight and D+1 are re-locked; D-3 and D-2 carry over as lived.

## The live path

```bash
ANTHROPIC_API_KEY=... AGENT_PROVIDER=anthropic bun run dev
```

If the provider throws, the run falls back to replay mid-stream — the audience
sees an `error` event and the show continues. Still: do one full live run
before judging; the planner prompt assumes exactly one `submitDayPlan` call
per day and may need tuning.

## Routes for the pitch

- `/pitch` — the slide deck (scrollytelling, self-contained)
- `/` — the run: sun-track scene + crew feed + eval verdict cards
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

## Troubleshooting

| Symptom | Fix |
|---|---|
| Stream dies instantly | Provider misconfigured → check `.env.local`; replay needs nothing |
| Plan stuck locked at 0 | `bun run replay:check` — prints every eval verdict |
| Fresh clone, hooks silent | `git config core.hooksPath .githooks` |
| Stage wifi dead | `replay` needs no network at all — that's the point |
| Morning replan shows the night script | URL has no `startDay` or `checkins` — add them |
