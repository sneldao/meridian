# Providers & configuration

One runtime (`src/agents/runtime.ts`), three model backends selected by
`AGENT_PROVIDER` (`src/agents/providers.ts`). Copy `.env.example` → `.env.local`.

## `AGENT_PROVIDER`

| Value | Use | Keys needed |
|---|---|---|
| `replay` (default) | Scripted transcript, zero tokens. Stage insurance + UI dev. | none |
| `anthropic` | Live Claude crew. **Demo path.** | `ANTHROPIC_API_KEY` |
| `featherless` | OpenAI-compatible open models for cheap dev iteration. | `FEATHERLESS_API_KEY` |

If a live provider throws mid-run, `runCrew` emits an `error` event and drains
the replay transcript to completion — the demo never dies on stage.

In replay mode the transcript is the night script by default. A morning run
(check-ins supplied or `startDay > 0`) streams the recorded replan instead
(`src/agents/morning-replay.ts`).

## Models

Two roles, env-overridable:

```bash
MERIDIAN_ORCHESTRATOR_MODEL   # planner/evaluator/negotiator — default claude-sonnet-4-5
MERIDIAN_SPECIALIST_MODEL     # analyst/researcher             — default claude-haiku-4-5
```

Featherless equivalents: `FEATHERLESS_ORCHESTRATOR_MODEL`,
`FEATHERLESS_SPECIALIST_MODEL` (defaults in `.env.example`).

## Other env vars

| Var | Purpose |
|---|---|
| `FEATHERLESS_BASE_URL` | Default `https://api.featherless.ai/v1` |
| `FIRECRAWL_API_KEY` | Optional second science provider. Chain: ScienceMadeReadable (free, no key) → Firecrawl → verified static citations |
| `ELEVENLABS_API_KEY` | Voice layer — `POST /api/voice` TTS per crew member (distinct stock voices per agent, `ELEVENLABS_VOICE_*` / `ELEVENLABS_MODEL` overridable, default `eleven_flash_v2_5`). Client queues utterances sequentially; 204 when unset |

## Calendar backend

The negotiator's calendar is fixture-backed by default. With Composio
configured it becomes a **real Google Calendar** — `proposeMove` patches actual
events and `commitPlan` writes every locked intervention as a `Meridian — …`
block. Any Google failure falls back to fixtures; a failed patch rolls the
local move back and surfaces as a tool error the negotiator can route around.

| Var | Purpose |
|---|---|
| `COMPOSIO_API_KEY` | Composio project key — enables the Google backend |
| `COMPOSIO_USER_ID` | Entity whose connected Google account is used |
| `CALENDAR_BACKEND` | `fixture` forces fixtures even with keys present |
| `GOOGLE_CALENDAR_ID` | Default `primary` |
| `MERIDIAN_CALENDAR_TZ` | Wall-time zone for read/write — default `Europe/London` |
| `COMPOSIO_GOOGLECALENDAR_VERSION` | Toolkit pin — default `20261010_00` |

Setup: create a Composio project, connect Google Calendar for the entity id,
drop the two env vars in `.env.local`. Events with attendees are treated as
fixed walls; personal blocks are movable — same semantics as the fixtures.
`send_updates: "none"` on every write, so the demo never emails attendees.

## Cost notes

- `replay` is fully offline — safe default for UI work.
- `featherless` keeps tool-call shape identical while iterating prompts.
- `anthropic` spends real credits; a full crew run is on the order of tens of
  tool calls. Keep `replay` for CI-style checks (`bun run replay:check`).
