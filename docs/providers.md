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

The negotiator's calendar is fixture-backed by default. With a Composio MCP
consumer key it becomes a **real Google Calendar** — `proposeMove` patches
actual events and `commitPlan` writes every locked intervention as a
`Meridian — …` block. Transport is the MCP endpoint
(`connect.composio.dev/mcp`, `x-consumer-api-key` header →
`COMPOSIO_MULTI_EXECUTE_TOOL`); the consumer key is already bound to the
connected account, so no project API key or entity id is needed. Any Google
failure falls back to fixtures; a failed patch rolls the local move back and
surfaces as a tool error the negotiator can route around.

| Var | Purpose |
|---|---|
| `COMPOSIO_API_KEY` | MCP consumer key (`x-consumer-api-key` from the dashboard MCP panel) |
| `CALENDAR_BACKEND` | `fixture` forces fixtures even with the key present |
| `GOOGLE_CALENDAR_ID` | Default `primary` |
| `MERIDIAN_CALENDAR_TZ` | Wall-time zone for read/write — default `Europe/London`; should match the connected calendar's tz |

Setup: dashboard → MCP URL → copy the consumer key → connect a Google
Calendar account. Events with attendees are treated as fixed walls; personal
blocks are movable — same semantics as the fixtures. `send_updates: "none"`
on every write, so the demo never emails attendees.

## Graph memory (Graph Hacks track, optional)

Set `FALKORDB_URL` (e.g. `falkor://localhost:6379`) to back cross-run
memory with FalkorDB. `MERIDIAN_GRAPH_ID` defaults to `meridian:demo`;
each user/tenant should get a distinct graph id in production.

| Var | Purpose |
|---|---|
| `FALKORDB_URL` | FalkorDB connection URL — enables graph memory |
| `MERIDIAN_GRAPH_ID` | Per-user/per-tenant graph name — defaults to `meridian:demo` |

Seed local data with `bun run seed:graph`. The agent never composes Cypher;
fixed tools live in `src/domain/graph-memory.ts`. If the database is down or
unset, Meridian falls back to `crew-memory.json` silently.

## Supabase persistence (optional)

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, run history and
check-ins are written to `public.meridian_events` (single JSONB table — spec in
`src/tools/supabase.ts`). The browser/localStorage path remains the fallback,
so offline/replay runs still work. Live status: `GET /api/persistence/runs`
returns `{"enabled":true,...}` when wired up.

| Var | Purpose |
|---|---|
| `SUPABASE_URL` | Project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key — never expose via `NEXT_PUBLIC_*` |

Provisioned project: `meridian`, ref `vpeakvspljdoxbwfsdvw`, West Europe
(London), org `Imperfect`. Schema is versioned in `supabase/migrations/` — the
table DDL matches `src/tools/supabase.ts`, with RLS enabled and no policies
(only the service role, used server-side, can read/write).

To recreate from a fresh clone:

```bash
supabase login
supabase link --project-ref vpeakvspljdoxbwfsdvw
supabase db push          # applies supabase/migrations/
# then set the two env vars in .env.local from Dashboard → Settings → API
```

## Cost notes

- `replay` is fully offline — safe default for UI work.
- `featherless` keeps tool-call shape identical while iterating prompts.
- `anthropic` spends real credits; a full crew run is on the order of tens of
  tool calls. Keep `replay` for CI-style checks (`bun run replay:check`).
