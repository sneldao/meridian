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
| `ELEVENLABS_API_KEY` | Voice layer — reserved, not yet wired |

## Cost notes

- `replay` is fully offline — safe default for UI work.
- `featherless` keeps tool-call shape identical while iterating prompts.
- `anthropic` spends real credits; a full crew run is on the order of tens of
  tool calls. Keep `replay` for CI-style checks (`bun run replay:check`).
