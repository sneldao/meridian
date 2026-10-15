<!-- LIVE reference — keep in sync with the code. -->

# Graph memory & Graph Hacks sprint

Track-2 (Agent Memory and Coordination) submission for Graph Hacks.
Strategy, graph model, tool catalogue and guardrails are frozen in
[docs/plan/graph-hackathon.md](../plan/graph-hackathon.md) — this doc tracks
current state and the build to the deadline.

**Deadline: Sun 2026-10-18 23:59 IST = 19:29 BST.** Target submission ~15:00
BST Sunday, leaving ~4h buffer. Freeze deploys after submitting —
`autoDeploy` is on for the Render service.

## Current state (2026-10-15)

| Piece | State |
|---|---|
| `src/domain/graph-memory.ts` | `loadGraphMemory` (2 fixed read queries), `recordFinding`, `graphMemoryBrief`; all no-op without `FALKORDB_URL` |
| `scripts/seed-graph.ts` | Full seed (item B): London→Tokyo trip across 2 sessions — `Trip`, `Day`, `Intervention`, `CalendarEvent`, `Citation`, `CheckIn`, `Finding`, `AdherenceProfile`, `WearableBaseline` with edges; `SEED_TENANT=other` seeds a second traveller for the isolation demo; `--reset` wipes first. Written, not yet run against a live DB (`FALKORDB_URL` unset) |
| `GET /api/graph/health` | Reports enabled + findings/failures; 503 when unreachable |
| Runtime wiring | `runtime.ts` offers the analyst fixed tools (`recallFindings`, `priorFailures`, `calendarConflicts`) when `FALKORDB_URL` is set — no prompt prose; trace shows rows/ms/hop path via `tool_result` detail. Not yet exercised against a live DB |
| Env | ⚠️ **FalkorDB Cloud free instance was provisioned + seeded (28/5 nodes) and verified live ~17:05–17:20, then stopped accepting TCP 55865 despite console+audit saying Healthy; reboot didn't help; deleted. Recreate in progress.** `.env.local` has `FALKORDB_URL` for the OLD (deleted) endpoint — replace with the new host:port. Not yet set on Render |
| Tenant isolation | `?tenant=` on `/api/crew/run`, `/api/crew/checkin`, `/api/graph/health` → `meridian:{tenant}` graph; `MERIDIAN_SESSION` labels writes |

## Gap vs the frozen plan

Implementation order (plan §"Implementation order"):

| Step | Status |
|---|---|
| 1. Client + 10–20 node seed | ✅ Full seed written (all node types + edges, 2 sessions, 2 tenants); pending first run once FalkorDB is up |
| 2. Read-only traversals | ✅ `recallFindings`/`priorFailures`/`calendarConflicts` in `graph-memory.ts` — entity resolution, hop paths, "not in graph" notes; pending live verification |
| 3. Fixed-tool catalogue + entity resolution | ✅ Wired on the analyst (`runtime.ts`); agents never see Cypher |
| 4. Read path replacing `memoryBrief` | ⚠️ JSON `memoryBrief` still feeds the prompt alongside graph tools; deliberate — JSON is the fallback, graph is the evidence |
| 5. Write path for check-ins/findings | ✅ `recordCheckInToGraph` on the check-in route; `recordFinding` at end of run attaches to the resolved entity or a `Subject` fallback |
| 6. Cross-session demo | ⚠️ Seed now covers 2 sessions + a second tenant (`SEED_TENANT`); `MERIDIAN_GRAPH_ID` is still a static global (item E) |

Success criteria (plan §"Success criteria for submission") — code now exists
for all six (agent-called tools, trace with args/rows/ms/path, write path for
second-run deltas, "not in graph" notes, 2-session + 2-tenant seed) but none
is verified against a live DB — that is tonight's gate.

`tool_call`/`tool_result` events already stream to the feed —
`summarizeOutput` renders graph results as `N rows · Mms · hop path`, which is
the trace the track asks for.

## Sprint plan

**Deadline math:** ~3h Thu evening + Fri + Sat + Sun to ~15:00 ≈ 19–20h of
work. Feasible only if Friday is a full build day.

| # | Workstream | Est. |
|---|---|---|
| A | FalkorDB env up — **cloud free tier** (a localhost docker is unreachable from the Render demo URL) + `FALKORDB_URL` in `.env.local` and Render | 1h |
| B | Full seed: all node types + edges, 2 sessions, 2 tenant graphs | 1.5h |
| C | Fixed-tool catalogue: `recall_findings`, `prior_failures`, `calendar_conflicts` as real agent tools; entity resolution; hop path in results; rows+ms into `tool_call` detail | 4h |
| D | Write path: check-in route writes `CheckIn`+`ABOUT` edge; end-of-run `recordFinding` gets a caller | 2h |
| E | Per-user graph id (`meridian:{sessionId}` from request context, not one env var) | 1h |
| F | UI: "answered from memory" chip with hop path + date in crew feed/briefing | 2h |
| G | Demo contrast: depth-1 vs recalled run, "not in graph" case, rehearsal + recorded backup | 2h |
| H | Tests: `loadGraphMemory` fallback, seeded traversal, write path | 1h |

### Thu evening — derisk the unknown

- A done: FalkorDB Cloud instance live, `bun run seed:graph` verified,
  `/api/graph/health` → `enabled:true`
- B done: full seed written and run
- Verify the `falkordb` JS client's `roQuery`/`query` result shapes against a
  live DB — the plan flagged this as the preview-in-mind risk. Surface it
  tonight, not Friday.

### Fri — the graph becomes real (critical path)

- Morning: C (tool catalogue)
- Afternoon: D (write path) → E (tenant isolation)
- Late: H (tests); verify graph-down fallback still completes a run

**Go/no-go gate ~18:00 Fri.** If tools aren't wired and a check-in doesn't
land in the graph, invoke the plan's escape clause: ship the honest
JSON-memory story, keep `/api/graph/health` as "integration exists but off",
don't fake it. A thin live loop beats a broad story.

### Sat — make it visible

- Morning: F (UI surfacing)
- Midday: G — seed two contrasting sessions; the three money shots:
  **second run visibly differs → hop path shown → "not in graph" honesty**
- Afternoon: Render env vars, end-to-end run on the live URL, two rehearsals
  + recorded backup video
- Evening: buffer/bugfixes only

### Sun — submit

- Morning: README section + demo clip; submission text in the team's own words
- ~12:00 fresh-eyes sweep: seed → run → check-in → second run differs
- Submit by ~15:00, then freeze deploys

### Scope-cut ladder

1. Cut `calendar_conflicts` + `shortest_path` (optional in the plan) — keep
   `recall_findings` + `prior_failures` + `record_finding`
2. Cut F — a `tool_call` event with the path in `detail` already shows trace
3. Cut E — demo isolation with two seeded graphs via `MERIDIAN_GRAPH_ID` swap
4. Escape clause (Fri gate)

## Invariants

- Everything stays behind `FALKORDB_URL`; the main Meridian demo must survive
  FalkorDB being down mid-presentation. Already true — don't break it.
- Agents never compose Cypher; fixed human-written tools only.
- No dosing/claims/diagnostic phrasing in graph nodes.
- Commit or stash the outstanding UI design-pass files before Friday so graph
  work doesn't entangle with them.
