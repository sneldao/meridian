<!-- LIVE reference — keep in sync with the code. -->

# Providers & configuration

One runtime (`src/agents/runtime.ts`), four model backends selected by
`AGENT_PROVIDER` (`src/agents/providers.ts`). Copy `.env.example` → `.env.local`.

## `AGENT_PROVIDER`

| Value | Use | Keys needed |
|---|---|---|
| `featherless` | OpenAI-compatible open models. **Cheap dev default.** | `FEATHERLESS_API_KEY` |
| `nebius` | NVIDIA Nemotron via Nebius Token Factory. Configured fallback. | `NEBIUS_API_KEY` |
| `anthropic` | Live Claude crew. Highest quality, real per-token cost. | `ANTHROPIC_API_KEY` |
| `replay` | Scripted transcript, zero tokens. Stage insurance + UI dev. | none |

## `AGENT_PROVIDER_FALLBACK`

Comma-separated live provider names (`featherless` / `nebius` / `anthropic`).
If the primary crew run throws, `runCrew` emits a recoverable `error` event
and retries the whole run on each fallback in order before draining the
replay transcript — the demo never dies on stage. Unknown names, duplicates
and the primary itself are dropped. The chain is `AGENT_PROVIDER` → each
`AGENT_PROVIDER_FALLBACK` entry in order → replay;
each `orchestrate` emits `run_start` with the provider actually in use, and
the artifacts record the provider that finished the run.

In replay mode the transcript is the night script by default. A morning run
(check-ins supplied or `startDay > 0`) streams the recorded replan instead
(`src/agents/morning-replay.ts`).

**The replay path's plan is the solver's plan** — the same `solveDay` the live
path hands its planner, so the demo, the eval and the video run on the same
placement the product does. The transcript is scripted; the *plan* is the
deterministic solver's, and the verdicts are the real gate's.

## Models

Two roles, env-overridable per provider:

```bash
MERIDIAN_ORCHESTRATOR_MODEL        # anthropic — default claude-sonnet-4-5
MERIDIAN_SPECIALIST_MODEL          # anthropic — default claude-haiku-4-5
FEATHERLESS_ORCHESTRATOR_MODEL     # default Qwen/Qwen3-32B
FEATHERLESS_SPECIALIST_MODEL       # default Qwen/Qwen3-32B
NEBIUS_ORCHESTRATOR_MODEL          # default nvidia/Nemotron-3-Ultra-550b-a55b
NEBIUS_SPECIALIST_MODEL            # default nvidia/nemotron-3-super-120b-a12b
```

Orchestrator = planner/evaluator/negotiator, specialist = analyst/researcher.
Featherless model IDs must match the live catalog (`GET
https://api.featherless.ai/v1/models` is unauthenticated) **and** actually
serve — several catalogued models return `no_response` at inference time, so
verify with a real chat completion before bumping. Featherless limits how
many distinct models an account can switch between
(`model_switching_limit_exceeded`), so both roles share `Qwen/Qwen3-32B`.
Verify Nebius IDs against the Token Factory catalog the same way. Fastest
sanity check for whatever is configured: `bun run provider:check` — resolves
the provider, forces one tool call, prints the round-trip.

## Other env vars

| Var | Purpose |
|---|---|
| `FEATHERLESS_BASE_URL` | Default `https://api.featherless.ai/v1` |
| `NEBIUS_BASE_URL` | Default `https://api.tokenfactory.nebius.com/v1` |
| `AGENT_PROVIDER_FALLBACK` | Comma-separated live providers retried in order before replay — see above |
| `FIRECRAWL_API_KEY` | Optional second science provider. Chain: ScienceMadeReadable (free, no key) → Firecrawl → verified static citations |
| `TAVILY_API_KEY` | Live web search — gives Jun a `searchWeb` tool (and MCP `search_web`). Hits inform the read; never enter the citation set |
| `QLOO_API_KEY` · `QLOO_BASE_URL` | Destination taste for Otto via `destinationTaste` (and MCP `destination_taste`). Hackathon keys only work against `hackathon.api.qloo.com` with the `X-Api-Key` header |
| `ELEVENLABS_API_KEY` | Voice layer — `POST /api/voice` streams PCM per crew member, chunk-sized so speech overlaps token generation (`timestamps:true` returns char-aligned NDJSON for feed karaoke; `{lines:[{agent,text}]}` runs multi-voice text-to-dialogue for the handoff). Config in `src/lib/voice/`: voices `ELEVENLABS_VOICE_ID`/`ELEVENLABS_VOICE_<AGENT>`; models `ELEVENLABS_MODEL_ID` (default `eleven_v4_turbo` — tags need v3/v4), `ELEVENLABS_DIALOGUE_MODEL_ID` (`eleven_v3`); `MERIDIAN_VOICE_SEED` pins determinism, `MERIDIAN_VOICE_TAGS`/`KARAOKE` are kill-switches; audio cached by content hash (memory + Supabase Storage bucket `MERIDIAN_VOICE_BUCKET`). `GET /api/voice` returns 204 when unset; `POST` requires a session, is IP-rate-limited, and returns 503 with no key |
| `REPLAY_BEAT_MS` | Replay pacing — ms between streamed events (default `60`; see [demo.md](demo.md)) |
| `PUBLIC_ORIGIN` | Comma-separated public origins the proxy's Origin check accepts on mutating API requests (default `https://meridian.trustfall.xyz`). Required when the deployed domain differs — behind Cloudflare→Render `nextUrl.origin` is the internal host, so the public domain must be named or every browser POST is 403 |
| `NEXT_PUBLIC_AGENT_PROVIDER` | Client-side fallback label when a run doesn't report its provider |

## Calendar backend

The negotiator's calendar is fixture-backed in this beta.
`googleCalendarEnabled()` is force-off even with a Composio MCP consumer key,
and the guarded exec path throws before any external request — there is no
server-wide calendar connection in the personal-data beta. The future
google-backed path stages each move first; after verification the run emits
`approval_request` and pauses. `POST /api/crew/approvals` either patches the
staged events and creates the locked `Meridian — …` blocks, or rejects and
emits `calendar_restore`. If an apply fails part-way, already-patched moves
are reverse-patched best-effort and the result says whether rollback
succeeded. Transport is the MCP endpoint (`connect.composio.dev/mcp`,
`x-consumer-api-key` header → `COMPOSIO_MULTI_EXECUTE_TOOL`); a future
implementation must connect per traveller, not reuse one server account.

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
| `FALKORDB_HOST` + `FALKORDB_PORT` | Alternative to the URL — Render wires a private service's host/port separately (see `render.yaml` `pserv`) |
| `MERIDIAN_GRAPH_ID` | Fallback graph name — defaults to `meridian:demo`; session-scoped requests map to `meridian:{hashed-session}` |
| `MERIDIAN_SESSION` | Session label stamped on graph writes (seed uses `run-1`; default `run-2`) |

Seed local data with `bun run seed:graph`. The agent never composes Cypher;
fixed tools live in `src/domain/graph-memory.ts`. If the database is down or
unset, Meridian falls back to `crew-memory.json` silently.

Current state, gap vs the plan, and the sprint to the 2026-10-18 deadline:
[graph-memory.md](graph-memory.md).

## Supabase persistence (optional)

When `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set, run history and
check-ins are written to `public.meridian_events` (single JSONB table — spec in
`src/tools/supabase.ts`) with `payload.ownerTenant` assigned server-side.
`GET /api/persistence/runs` requires the anonymous session and returns only
that owner's rows; unowned legacy rows stay hidden. The browser/localStorage
path remains the fallback, so offline/replay runs still work. Live status:
`GET /api/persistence/runs` returns `{"enabled":true,...}` when wired up.

Two more tables back the surfaces that leave the browser:

- `public.meridian_feeds` (`src/lib/feed-store.ts`) — calendar/assistant feeds:
  `ics`, `trip`, `days`, hashed write key, per-surface read tokens. Falls back
  to `artifacts/feeds/*.json` on disk when Supabase isn't configured.
- `public.meridian_push_subscriptions` (`src/lib/push.ts`) — Web Push
  subscriptions (`endpoint`, `keys`, `sent` dedup map) tied to a feed id.
  Required for pushed reminders; without it reminders still work while the
  app is open.
- `public.meridian_shares` (`src/lib/share.ts`) — durable `/plan/{id}` cards
  (`briefing`, `trip`, `arrival` payloads) plus the share funnel:
  `view_count` (recipient page loads — the OG image path deliberately does
  not count) and `recipient_count` (visits that ended in a committed trip).
  Falls back to `artifacts/share/*.json` on disk — which means Render's
  ephemeral FS without keys: links work until the next deploy, and the
  counters simply don't exist.

| Var | Purpose |
|---|---|
| `SUPABASE_URL` | Project URL (`https://<ref>.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role key — never expose via `NEXT_PUBLIC_*` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push identity — binds subscriptions to us |
| `VAPID_PRIVATE_KEY` | Signs every push send — server-only |
| `VAPID_SUBJECT` | `mailto:` contact embedded in the VAPID JWT (spec-required) |
| `CRON_SECRET` | Bearer token guarding `GET /api/cron/dispatch` |

VAPID keys generate with `npx web-push generate-vapid-keys`. Push is optional:
without them `GET /api/push/subscribe` reports `{"enabled":false}` and the app
keeps its in-tab reminders.

Provisioned project: `meridian`, ref `vpeakvspljdoxbwfsdvw`, West Europe
(London), org `Imperfect`. Schema is versioned in `supabase/migrations/` — RLS
enabled and no policies on every table (only the service role, used
server-side, can read/write).

To recreate from a fresh clone:

```bash
supabase login
supabase link --project-ref vpeakvspljdoxbwfsdvw
supabase db push          # applies supabase/migrations/
# then set the two env vars in .env.local from Dashboard → Settings → API
```

## Cost notes

- `featherless` is the dev default — fractions of a cent per crew run.
- `nebius` as fallback keeps a failed primary from dropping straight to replay.
- `replay` is fully offline — keep it for CI-style checks (`bun run replay:check`)
  and the deployed service.
- `anthropic` spends real credits; a full crew run is on the order of tens of
  tool calls.
