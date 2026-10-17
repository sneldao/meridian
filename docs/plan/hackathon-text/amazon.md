# Amazon Developer Hackathon — submission variant

Uses the base template from `template.md`. This file replaces the
**Sponsor-tech delta** paragraph.

Deadline: **2026-10-23, 12:00 PDT**.

## Sponsor-tech delta
The whole Meridian crew surface is a self-hosted **MCP server** — Streamable
HTTP, protocol 2025-11-25, exposed at `POST /api/mcp` against the live
Render deployment. Eight tools ship today: `preview_trip`, `plan_shift`,
`evaluate_plan`, `record_check_in`, `search_literature`, `crew_memory`,
`recall_findings`, `latest_plan`. Verified live: `initialize` → `tools/list`
→ `tools/call plan_shift` returns a real briefing, real .ics, real
citations. **Any agent** — Claude, an Alexa+ skill, an in-house voice
assistant — can call the same crew the product UI calls. The MCP server is
the Alexa+ surface, not a simulated fallback. A demo shot in the video shows
the live terminal call against the live URL; the JSON-RPC envelope is the
entire integration.

## Track
Alexa+ track — agentic skill surface.

## Optional bonus
AWS Builder mini-challenge (Bedrock / AgentCore) — not pursued this window.
The MCP path already qualifies for the main track; pursuing Bedrock would
require an extra dependency we don't need to win this one.
