<!-- FROZEN — Graph Hacks participation plan. Historical record; see docs/reference/ for the current state. -->

# Graph Hacks hackathon — Meridian participation plan

**Event:** Graph Hacks (WeMakeDevs + FalkorDB)  
**Dates:** 2026-10-15 (starts) → **deadline 2026-10-18, 23:59 IST**  
**Format:** online / remote, individual or teams up to 4  
**Prize pool:** $20,000 across three tracks  
**Theme:** build an agent whose context lives in a graph; the graph must shape
what the agent does, not sit beside it.

Sources:

- Blog: https://www.wemakedevs.org/blogs/how-to-build-an-agent-that-reasons-over-a-graph
- Hackathon page: https://www.wemakedevs.org/hackathons/falkordb
- Database: FalkorDB (`docker pull falkordb/falkordb:latest`, browser at `:3000`)
- Clients: Python, Node.js, Java, Rust, Go, PHP, C#

## Tracks and fit

| Track | What it asks for | Meridian fit |
|---|---|---|
| 1. Agents That Act on Connected Data | multi-hop reasoning, agent acting on linked records, graph algorithms as tools, explainable results | Low as a product pivot — Meridian is not a dependency/service graph |
| 2. Agent Memory and Coordination | persistent episodic/semantic memory, handoffs between agents, per-user/per-tenant memory | **Best fit** — strongest match to existing architecture |
| 3. Company Brain | people/teams/projects/docs/decisions in one graph, decision traceability | Indirect — only if framed around the traveller's organisation |

Recommendation: **submit under Track 2**. Do not market Meridian as a
generic "company brain" or incident-triage agent; the graph must earn its
place as **cross-run memory + agent coordination**.

## Recommended scope (4 days, narrow on purpose)

Ship a graph-backed memory plane while keeping the circadian scorer in code.
The graph should drive what the agents recall and how they coordinate, but it
should never replace the physiological model.

### Core claim

> Meridian remembers *across runs*: failed interventions, adherence patterns,
> conflicting calendar events and citations become nodes; second-shift plans
> differ because the graph said so, and every answer carries the hop path.

### Minimal graph model

One graph per tenant/user: `select_graph(f"meridian:{userId}")`.

Nodes:
- `Trip`, `Day`, `Intervention`, `CalendarEvent`, `Citation`, `CheckIn`,
  `Finding`, `WearableBaseline`, `AdherenceProfile`

Edges:
- `(:Day)-[:HAS_INTERVENTION]->(:Intervention)`
- `(:Intervention)-[:CITES]->(:Citation)`
- `(:CheckIn)-[:ABOUT]->(:Intervention)`
- `(:CheckIn)-[:ON_DAY]->(:Day)`
- `(:Day)-[:CONFLICTS_WITH]->(:CalendarEvent)`
- `(:Finding)-[:ABOUT]->(:Intervention)` or `(:Day)`
- `(:Trip)-[:INCLUDES]->(:Day)`

### Graph-backed tools (fixed catalogue, human-written queries)

- `recall_findings(target, limit)` — `MATCH (f:Finding)-[:ABOUT]->(x {name:$target}) RETURN f.text, f.at ORDER BY f.at DESC LIMIT $limit`
- `prior_failures(kind, limit)` — walks `CheckIn -> Intervention -> Day -> Trip` for skipped/early asks
- `calendar_conflicts(dayIndex)` — returns overlapping fixed/movable events as paths
- `record_finding(text, at, session)` — `CREATE (f:Finding ...) CREATE (f)-[:ABOUT]->(s)`
- Optional: `shortest_path(from, to)` via `CALL algo.SPpaths` to explain why two interventions or days are connected

Rules from the article (keep them as architecture invariants, not prose):
- agents never generate Cypher
- every name is resolved against the graph before reasoning
- queries and algorithm calls are fixed tools with typed arguments
- every answer returns the path
- per-user/tenant isolation is a graph, not a `WHERE` clause

### Demo contrast

Run the same planner question twice:
- depth 1: only this run's interventions → looks like a join
- depth 3–4: failures → citations → conflicts → adherence notes → prior check-in

Then run a "not in graph" case and show the agent saying it does not know,
rather than inventing a dependency.

### Implementation order (build to check yourself)

1. `pip`/npm client + seed a 10–20 node graph locally
2. read-only traversals in Node from a FalkorDB instance
3. fixed-tool catalogue with entity resolution
4. memory read path replacing `memoryBrief`
5. write path for check-ins/findings
6. cross-session demo (two seeded sessions)

## Scope guardrails

Do not:
- turn the whole Circadian Scorer into graph logic (keep `evaluatePlan` deterministic in code)
- model the whole scientific citation graph or build GraphRAG
- add full calendar/wearable ingestion during the hackathon

Do:
- model memory, adherence and coordination
- keep `.ics` + current scorer as the trustworthy core
- show "answered from memory" with a date and path
- keep an offline replay escape hatch

## Success criteria for submission

- Graph is doing work the agent could not do with a pile of retrieved text.
- Trace shows tool, args, timing, and row count.
- Second run changes behaviour because of the graph.
- Empty traversal produces "not in graph / not modeled", not a guess.
- Cross-session recall visible.
- Tenant isolation visible (one graph per user ID).

## Risks

- Scope creep: the world-building graph is a trap; stick to memory.
- Dependency/runtime risk: requires Docker, schema assumptions, and a JS client against a preview-in-mind database. Environment setup must be scripted up front.
- Demo risk: live graph + live model can double-fail. Keep replay mode and seeded precedent data.
- Domain drift: health-adjacent personal memory needs care; do not store dosing/claims or diagnostic phrasing anywhere in graph nodes.

## If there is not enough time

Skip the hackathon integration and ship the already-working Meridian memory loop as the story, but do not pretend the JSON file is a graph. The current product value does not depend on FalkorDB; the graph track only adds value if it is live.