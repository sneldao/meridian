# DoraHacks — submission variant

Uses the base template from `template.md`. DoraHacks BUIDL pages render
markdown, so this variant is written as one paste-ready description block.
Swap in the track/bounty names once the event is confirmed — the
**Sponsor-tech delta** paragraph is where a sponsor stack goes if the
hackathon has one.

## Project name
Meridian — agents that fly ahead of you

## Tagline
A crew of five long-running agents that shift your body clock as far as
you'll honestly go before you fly — gated by a deterministic phase-response
scorer that won't let the planner oversell your physiology.

## Description (paste into DoraHacks)

You land at 8 a.m. Tokyo. Your client walks in at 9. Your body thinks it's
midnight. The travel industry ships you a pillow and a melatonin gummy and
calls it wellness — nobody schedules the one thing that decides your week:
the multi-day circadian shift before and after the flight. $1.7T of
business travel rides on a problem no one solves.

**Meridian is a product, not a chatbot.** The same five-agent crew runs
every trip:

| Agent | Job |
|---|---|
| Mara · Analyst | Reads the CSV-derived sleep baseline + adherence profile |
| Jun · Research | Pulls real papers with DOIs (ScienceMadeReadable → Firecrawl) |
| Otto · Planner | Drafts each day's shift plan from a solver-placed skeleton |
| Iris · Eval | Fresh-context evaluator — argues back against the scorer's verdict |
| Rex · Negotiator | Reshapes the scheduled week and emits the .ics |

Otto drafts each day's plan; Iris challenges it; the deterministic scorer —
a closed-form phase-response model, **no LLM in the loop** — decides.
**Agents propose, code disposes.** Plans carry deterministic gate scores
and citations carry DOIs. There is no account: each browser gets an
anonymous HttpOnly session, and configured FalkorDB memory is scoped to
that hashed session (`meridian:{hashed-session}`), not a shared pool.

The loop doesn't end at the plan. Per-step did/skip check-ins re-solve the
day in real time; the plan and exported calendar reshape around what you
actually did. Live Google Calendar reads/writes stay disabled in this
beta. On arrival morning (`/arrival`), the trip is scored against what the
gate promised — and that number is what the next trip plans from. The
crew learns *you*.

Historically reproduced claims (rerun `bun run replay:check` on the
shipped build before pasting): the scorer rejected 2 of Otto's drafts
mid-run and the retry loop recovered — 4/5 days locked, score 0.91, 15
citations, .ics committed. Identical D-1 physiological-limit outcome on
Claude Sonnet and on open weights (Nemotron 3 Ultra via Nebius Token
Factory / Qwen3-32B via Featherless) — the gate holds regardless of
provider, so the model is swappable and the verifier is the moat.

Also shipped: a stateless MCP server (Streamable HTTP, protocol
2025-11-25) exposing 10 tools — `preview_trip`, `plan_shift`,
`evaluate_plan`, `record_check_in`, `search_literature`, `crew_memory`,
`recall_findings`, `latest_plan`, `search_web`, `destination_taste` —
scoped to the caller's anonymous session where personal data is involved.

## Links
- Live demo: https://meridian.trustfall.xyz
- Repo: https://github.com/sneldao/meridian
- Demo video: https://meridian.trustfall.xyz/video (or attach the .mp4)
- Replay harness: `bun run replay:check` — same crew, same routes, same
  outcomes deterministically (zero API keys required)

## Built with
- Next.js 16.4.1 · TypeScript · deployed on Render
- FalkorDB — optional cross-run graph memory, scoped by hashed session
- Open-weight models by default (Nemotron 3 Ultra / Qwen3-32B);
  provider-agnostic — verified identical outcomes on Claude and Nemotron
- ElevenLabs (voice handoff) · Tavily (live destination guidance) ·
  Qloo (taste-grounded places) · Web Push (VAPID) · MCP (Streamable HTTP)

## Honesty notes (don't paste)
- The public URL runs `AGENT_PROVIDER=replay` for zero-cost judging — say
  "the same run replays deterministically; live open-model inference is
  one env var".
- FalkorDB-off degrades to `not_in_graph`, never a fabricated answer.
- Identity is an anonymous HttpOnly session; `?tenant=` and stamped headers
  never select a traveller. Supabase history is owner-scoped; live Google
  Calendar and payments are force-off in the current beta.
- If the DoraHacks event has a sponsor track, add a one-paragraph
  **Sponsor-tech delta** here the same way `nebius-nvidia.md` /
  `qloo.md` / `graph-hacks.md` do.
