# Qloo Agentic Hackathon — submission variant

Uses the base template from `template.md`. This file replaces the
**Sponsor-tech delta** paragraph.

Deadline: **2026-10-30, 23:45 EDT**.

## Sponsor-tech delta
Otto's intervention notes are grounded in what the destination actually
offers, not in generic advice. `destinationTaste(city, lon, lat)` calls
Qloo's `/v2/insights` — `filter.location.query` restricts to places inside
the locality's shape, `signal.interests.entities` carries the destination
entity as the taste signal. Live demo: `destinationTaste("Tokyo")` returns
real places (Tokyo Tower, Mori Art Museum, observation decks) via
`hackathon.api.qloo.com`. The grounded note appears in the morning handoff
card — e.g. *"07:00 · light · Mori Art Museum"* — and travels through the
scorer untouched: Qloo grounds *what* the day suggests, never *when* — the
phase-response scorer still decides timing. The Qloo delta is visible in
the same frame as the citation DOI, so judges see one combined answer, not
two separate integrations. Also exposed as MCP tool `destination_taste`.

## Requirement verification
- Working app integrating the Qloo API ✓
- Agentic — multi-agent crew with tool calls ✓
- Live hosted demo URL ✓ (`https://meridian.trustfall.xyz`)
- Public repo with **OSI license visible in repo About** ✓ (`LICENSE` file
  at repo root, MIT)
- Text description — this submission text ✓

## Eligibility notes
Per the brief, the rules explicitly allow "integrates the Qloo API into an
existing agent" — Meridian is an existing agent (the public repo shipped in
August 2026, well before this window). The integration is Qloo-grounded
intervention notes; the planner and scorer were already shipping.
