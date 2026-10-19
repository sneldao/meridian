# Nebius × NVIDIA Global AI Hackathon — submission variant

Uses the base template from `template.md`. This file replaces the
**Sponsor-tech delta** paragraph.

Deadline: **2026-10-30, 13:00 EDT**. Side prizes: **Best Use of Tavily ($3K)**
and Nebius Builder Program credits.

## Sponsor-tech delta
Meridian is provider-agnostic on purpose — the same deterministic gate
scorer, the same JSON-schema tool calls, the same multi-step plan run
delivers the same D-1 physiological-limit outcome on Claude Sonnet and on
**NVIDIA Nemotron 3 Ultra** (orchestrator) + **Super 120b** (specialists)
served by the **Nebius Token Factory** (`api.tokenfactory.nebius.com/v1`,
OpenAI-compatible). Verified end-to-end: 18 tool calls answered, scorer
rejected 2 drafts, retry loop recovered, 4/5 days locked, score 0.91, 15
citations, .ics committed — same numbers as the Claude run. The pitch is
"cheap model + deterministic verifier" — the model proposes, the code
disposes, and the model is swappable. **Tavily prize:** Jun has a
`searchWeb` tool (live destination guidance) alongside `searchScience`
(real papers with DOIs). Web hits inform the read but never enter the
citation set — keeps the "papers with DOIs" claim clean.

## Tracks
- Personal AI — persistent memory, reusable skills, cross-run learning
  (Meridian is literally this category)
- Best Use of Tavily ($3K side prize)
- Best Apps & Agents (fallback category)

## Provider badge
The deployed URL shows `nebius` in the header when `AGENT_PROVIDER=nebius`,
matching the demo video's close-up provider badge.
