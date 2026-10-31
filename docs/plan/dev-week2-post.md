<!-- DEV submission post — Hacktoberfest Open-Source AI Challenge: Week 2 (Side Hustle).
     Structured to the official template. ALSO serves as the Graph Hacks "best blog post"
     entry (AirPods 5): covers what was built, how it works, what was learned.

     ORDERING: publish on DEV first; link the live URL in the Graph Hacks submission Sunday
     (their 23:59 IST = 19:29 BST deadline precedes DEV's 23:59 PDT). Posts stay editable —
     video/session links can be added later. SOLO BUILD — no team credits needed.
     Strip this comment block before pasting. -->

---
title: "Meridian: an open-model agent crew that plans around your jet lag — and remembers what went wrong"
published: false
tags: devchallenge, hf26challenge, opensource, ai
---

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 2: Side Hustle](https://dev.to/challenges/hacktoberfest-week2-2026-10-12)*

## What I Built

Meridian is a jet-lag planning service for travel advisors — a crew of five AI
agents, all running on open-weight models, that turns a flight itinerary into a
day-by-day circadian shift plan grounded in peer-reviewed literature, the
traveller's calendar, and a graph memory of what actually worked last time.

The side hustle it's built for: independent travel advisors — a real, growing
niche — compete on service, not price. Anyone can book an LHR→HND fare; nobody
hands their client a plan that says *"seek bright light 06:10–07:40 Tokyo time
on day -2, avoid it after 11:00 — and here's the paper that backs it."* That
kind of research takes an advisor hours per client. Meridian compresses it
into a ~2-minute crew run that produces a scored plan, real DOIs, and an
`.ics` file that drops into the client's calendar — a £20–50 premium add-on
they can resell per trip.

People already pay for this: Timeshifter sells consumer jet-lag plans at
$9.99/trip, $24.99/yr; corporate travel desks pay far more for duty-of-care
reporting. Meridian is that product rebuilt as a tool a one-person business
can mark up.

## Demo

**Live:** https://meridian.trustfall.xyz — pick a route, watch a plan come
together, download the `.ics`.

The app has a depth dial, and it's the fastest way to see what makes this
different:

- **`/` (Calm)** — the traveller's face. Just the daily nudges: light windows,
  sleep times, caffeine cutoffs.
- **`?depth=guided` (Guided)** — every nudge gets a "Why & details" drawer:
  the scorer's gate score, whether the draft was rejected and retried, the
  backing citation, and the memory hop path when a past trip shaped it. The
  ribbon under each day reads like a receipt: *"Crew: drafted 2× · scorer
  rejected 1× · locked at 0.91 · trip memory consulted."*
- **`/crew` (Operator)** — the full agent surface: live crew feed, world lens,
  ledger. This is where you watch the model work.

The public URL runs the deterministic replay transcript — zero cost, can't
burn tokens on a judge's phone. A live open-model run is one env var away:
`AGENT_PROVIDER=nebius bun run dev` locally, or the same variable flipped on
the Render service.

<!-- [ADD when ready] **Video:** ~3 min — shot list in tracker: calm face →
     why-expansion → /crew feed → scorer rejection → hop path → .ics → MCP.
     Post publishes fine without it (live URL satisfies the demo rule). -->

## Code

https://github.com/sneldao/meridian — public; first commit 2026-10-15, built
start-to-finish inside the challenge window.

{% github sneldao/meridian %}

## How I Built It

The open-weight core: the whole crew runs on **NVIDIA Nemotron 3 Ultra**
(orchestrator) + **Nemotron 3 Super** (specialists) via Nebius Token Factory,
or **Qwen3-32B** via Featherless as the dev default. One env var
(`AGENT_PROVIDER`) swaps the whole crew between providers — Anthropic exists
as a comparison provider, which turned out to be the most useful thing in the
project.

The design decision underneath: **agents propose, code disposes.** Five
agents, but none get to freestyle the plan — a deterministic placement solver
drafts the skeleton and a circadian phase-response scorer gates every day
before it commits:

- **Mara (Analyst)** — reads the traveller's baseline and adherence profile
- **Jun (Researcher)** — pulls real papers via ScienceMadeReadable →
  Firecrawl; every claim carries a DOI, no vibes
- **Otto (Planner)** — drafts interventions one day at a time, grounded in
  what the destination offers (Qloo taste data)
- **Iris (Evaluator)** — fresh-context judge who explains the scorer's
  verdict, including rejections
- **Rex (Negotiator)** — reschedules movable calendar events, commits the
  final plan as `.ics` (real Google Calendar writes via Composio MCP)

**The part that remembers.** Each traveller gets a per-tenant FalkorDB graph
(`meridian:{tenant}` — isolation is a graph, not a WHERE clause). Trips, days,
interventions, citations, check-ins, and findings become nodes and edges. The
analyst gets a fixed catalogue of tools — `recall_findings`, `prior_failures`,
`calendar_conflicts`, `record_finding` — with human-written Cypher underneath;
agents never compose queries, every name is resolved against the graph before
reasoning, and every answer returns its hop path. An empty traversal returns
"not in graph," not a guess. Check-ins write `CheckIn→ABOUT` edges back into
the graph, so what a traveller actually did on the last trip becomes what the
next plan knows — recall surfaces things like *"05:30 light ask failed again"*
and *"early light asks before 07:00 are unreliable for this traveller,"* each
with the path it came from.

Around the crew: ElevenLabs gives each agent a voice over the live feed, an
MCP server (`POST /api/mcp`) exposes the whole thing as eight tools, Supabase
persists run history, and it's a Next.js PWA that works offline once a plan is
saved.

**Deployed on Render** as infrastructure-as-code — a `render.yaml` Blueprint
describing the web service plus a private FalkorDB service, auto-deploying
from `main`, ~$7/month. Render is the project's AI runtime: the long-lived
Node process is what makes 300-second SSE crew streams work where a serverless
timeout ceiling would kill them.

## Why Does Open Innovation Matter?

Open models aren't a nice-to-have here — they're what make the business case
close.

**The unit economics only work on open weights.** A crew run is ~18–20 tool
calls plus reasoning across five agents. On a frontier closed model that's
roughly a dollar a run; on Qwen3-32B or Nemotron it's pennies — and on
Featherless's flat-rate plans it's effectively zero marginal cost. At a £20–50
resale price, the closed-model version burns the advisor's margin on
inference. The open-model version leaves room for a business.

**The scorer gate is what makes cheap models safe.** The result that sold me
on the architecture: a full crew run on Nemotron — 143 seconds, 18 tool calls,
**two drafts rejected by the deterministic scorer**, retry recovered, 4/5 days
locked at 0.91 with 15 citations — landed on the exact same
physiological-limit outcome as the identical run on Claude. The gate holds
regardless of provider. You don't need the smartest model; you need a cheap
model inside a loop that cannot ship a physiologically impossible plan. Open
weights plus a deterministic verifier is a different architecture, not a
downgrade.

**No lock-in, by construction.** Provider-agnostic crew means an advisor's
tool can't be repriced out from under them. The open toolchain —
ScienceMadeReadable for literature, FalkorDB for memory, a standard MCP
surface — keeps every layer inspectable and replaceable.

## What I Learned

- **A cheap model inside a verifier beats an expensive model freestyling.**
  The scorer caught real mistakes (SHIFT_TOO_FAST violations) on both
  providers — the model's job is intent and judgment, not arithmetic.
- **Memory belongs in tools, not prompt prose.** The flat JSON brief stays in
  the prompt as a fallback, but the graph is the evidence: tool results carry
  rows, milliseconds, and the hop path, which is what lets the UI show
  *"answered from memory — here's the path"* instead of a vibes-based claim.
- **Provenance is a product feature, not a debug view.** The Calm/Guided/
  Operator split came from realising the evidence *is* the differentiator —
  so every nudge carries score/rejection/citation/memory-path chips rather
  than burying them in a dashboard. And the honest version mattered: we
  deleted the fallback that attached index-picked citations to nudges that
  hadn't earned one. A nudge with no citation says so.
- **Design for the demo failing.** Everything graph-related sits behind
  `FALKORDB_URL` and no-ops cleanly — FalkorDB's free cloud tier dropped its
  port mid-sprint while reporting "Healthy," and the app kept working; the
  durable path is a private FalkorDB service in the same Render Blueprint. A
  replay transcript covering both night and morning runs means the live URL
  can never burn tokens or die on stage.

## My Agent Session

<!-- [ADD when ready] Save a session with DevRelay and embed:
     {% agent_session <url> %} — also unlocks the Entire category below.
     Built almost entirely by an agent, so this is an honest fit. -->

## My First User

Honest answer: nobody has paid yet — this was built inside the challenge
window. What I can point to is that the willingness to pay is already proven
by someone else's revenue (Timeshifter's $24.99/yr consumer plan), and the
pricing hypothesis is set: free for one trip, ~£8–10/trip or ~£12/mo for
travellers with replans and wearable sync, ~£20–30/seat/mo for a travel
manager watching a fleet of crews. The first real user test is next.

## Prize Categories

- **Best Use of Render** — Render is the AI runtime: Blueprint-managed web
  service streaming five-agent SSE runs plus a private FalkorDB service,
  auto-deploy on `main`, ~$7/mo. https://meridian.trustfall.xyz
- **Best Use of ElevenLabs** — per-agent voice layer (`src/lib/voice/`): five
  distinct voices streamed chunk-aligned over token generation, char-aligned
  karaoke highlighting, multi-voice dialogue mode for the plan handoff.
<!-- [ADD when ready] - **Best Use of Entire** — agent session embedded above.
     Uncomment once the DevRelay link exists. -->

## What I'd Build Next

Morning check-ins already trigger a replan loop — report your sleep, the crew
re-scores the remaining days. The missing piece for the advisor workflow is
multi-client management; the `/team` route is a first pass at a fleet view.

The bet underneath all of it: the advisors who win the next decade won't be
the ones with the biggest budgets — they'll be the ones whose tools remember.
Open models are what make a five-agent crew with a graph behind it cheap
enough to be a side hustle instead of an enterprise contract.

*This post also serves as the project write-up for Graph Hacks (FalkorDB ×
WeMakeDevs), Track 2 — Agent Memory and Coordination.*

<!-- PRE-PUBLISH CHECKLIST
- [ ] Strip the comment blocks before pasting into the DEV editor
- [ ] README note: commits after Oct 18 must be declared (rules requirement)
- [ ] Sunday: paste the live DEV URL into the Graph Hacks submission (blog
      prize) — deadline 19:29 BST, earlier than DEV's
- [ ] Optional later adds (post stays editable): demo video, DevRelay →
      Entire category, first-user quote, .tech domain
-->
