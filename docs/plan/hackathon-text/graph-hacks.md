# Graph Hacks (FalkorDB × WeMakeDevs) — submission variant

Uses the base template from `template.md`. This file replaces the
**Sponsor-tech delta** paragraph.

Deadline: **2026-10-18 23:59 IST (= 19:29 BST)** — first binding deadline.

## Sponsor-tech delta
Meridian runs on a FalkorDB graph as its cross-run memory layer. Every
check-in and selected findings can be nodes or edges — and, when configured,
the graph is **named per browser session** (`meridian:{hashed-session}`), so
your second trip differs from whoever used that session last, and the planner
reads your adherence history, not a global pool. The `crew_memory` /
`recall_findings` MCP tools answer with session-scoped memory and hop-path
provenance. `falkordb` is wired into the compose stack
(`docker-compose.base44.yml`); deployments report graph memory as disabled
when no backend is configured rather than faking persistence.
FalkorDB-off is the honest degraded mode — the planner degrades to
`not_in_graph`, never to a fabricated answer.

## Track
Best Use of FalkorDB. Side-prize: best blog post wins AirPods 5.

## Links to include
- Blog post (already live, published 2026-10-16): https://dev.to/papajams/meridian-the-ai-travel-crew-that-learns-from-your-jet-lag-30o2
- Graph memory reference: https://github.com/sneldao/meridian/blob/main/docs/reference/graph-memory.md
