<!-- DRAFT — DEV submission post for Hacktoberfest Open-Source AI Challenge: Week 2 (Side Hustle).
     Deadline 2026-10-18 11:59 PM PDT. Paste body into DEV editor using the submission template.
     Required tags: devchallenge, hf26challenge.
     TODOs inline in brackets — resolve before publishing. -->

---
title: "Meridian: an open-model agent crew that plans around your jet lag"
published: false
tags: devchallenge, hf26challenge, opensource, ai
---

## What I Built

Meridian is a jet-lag planning service for travel advisors — a crew of five AI
agents, all running on open-weight models, that turns a flight itinerary into a
day-by-day circadian shift plan grounded in peer-reviewed literature and the
traveller's actual calendar.

Here's the problem it solves. Independent travel advisors — a real, growing
side-hustle niche — compete on service, not price. Anyone can book a
LHR→HND fare; nobody hands their client a plan that says *"seek bright light
between 06:10–07:40 Tokyo time on day -2, avoid it after 11:00, and here's why,
with citations."* Jet-lag planning is the kind of high-touch premium add-on
that takes an advisor hours to research per client. Meridian compresses that
into a ~2-minute crew run that produces a scored plan, real DOIs, and an `.ics`
file that drops straight into the client's calendar.

The proof people pay for this: Timeshifter sells consumer jet-lag plans at
$9.99/trip and $24.99/yr, and corporate travel desks pay far more for
duty-of-care reporting. Meridian is the same product rebuilt as a tool an
advisor can resell — £20–50 per client trip as a premium add-on, or bundled
into a monthly retainer.

## Demo

**Live:** https://meridian-afud.onrender.com — pick a route, watch the crew
work in real time, download the plan.

The public URL runs the deterministic replay transcript (it costs nothing and
can't burn tokens on a judge's phone). A live open-model run is shown in the
demo video below and can be reproduced locally in one command
(`AGENT_PROVIDER=nebius bun run dev`).

**Video:** [TODO: ~2–3 min demo — crew feed, scorer rejection, retry, .ics
handoff, one MCP `tools/call` against the live URL]

**Code:** https://github.com/sneldao/meridian (public; first commit 2026-10-15,
built start-to-finish inside the challenge window)

## How I Built It

The core design decision: **agents propose, code disposes.** Five agents never
get to freestyle the plan — a deterministic placement solver drafts the
skeleton, the crew fills in intent, and a scorer backed by a circadian
phase-response model gates every day before it's committed.

- **Mara (Analyst)** reads the traveller's baseline and adherence profile
- **Jun (Researcher)** pulls real papers via ScienceMadeReadable → Firecrawl —
  every claim carries a DOI, no vibes
- **Otto (Planner)** drafts each day's interventions one at a time, grounded in
  what the destination actually offers (Qloo taste data)
- **Iris (Evaluator)** is a fresh-context judge who explains the scorer's
  verdict — including rejections
- **Rex (Negotiator)** reschedules movable calendar events and commits the
  final plan as `.ics` (real Google Calendar writes via Composio MCP)

The whole crew runs on open-weight models — **NVIDIA Nemotron 3 Ultra**
(orchestrator) and **Nemotron 3 Super** (specialists) via Nebius Token
Factory, or **Qwen3-32B** via Featherless as the dev default. One env var
(`AGENT_PROVIDER`) swaps the whole crew between providers. Anthropic exists as
a comparison provider, which turned out to be the most useful thing in the
project — more on that below.

Around the crew: a FalkorDB graph gives the crew cross-run memory ("this
traveller never hits morning light windows — stop scheduling them"), ElevenLabs
gives each agent a voice for the live feed, an MCP server (`POST /api/mcp`)
exposes the whole thing as eight tools, and it's all a Next.js app with SSE
streaming and offline PWA support.

**Deployed on Render** as infrastructure-as-code: a `render.yaml` Blueprint
describing the web service plus a private FalkorDB service, auto-deploying
from `main`. Render is the project's AI runtime — the long-lived Node process
is what makes 300-second SSE crew streams work without a serverless timeout
ceiling, for about $7/month.

## Why Open Innovation Matters

This is the part where open models aren't a nice-to-have — they're what make
the business case work.

**The unit economics only close on open weights.** A crew run is ~18–20 tool
calls plus reasoning across five agents. On a frontier closed model that's
roughly a dollar a run; on Qwen3-32B or Nemotron it's pennies — and on
Featherless's flat-rate plans it's effectively zero marginal cost. At a
£20–50 add-on price point, the closed-model version burns the advisor's margin
on inference. The open-model version leaves room for a business.

**The scorer gate is what makes cheap models safe.** Here's the result that
sold me on the architecture: a full crew run on Nemotron took 143 seconds,
made 18 tool calls, had **two drafts rejected by the deterministic scorer**,
recovered, and locked 4/5 days at score 0.91 with 15 citations — landing on
the exact same physiological-limit outcome as the identical run on Claude. The
gate holds regardless of provider. That's the argument: you don't need the
smartest model, you need a cheap model inside a loop that can't ship a
physiologically impossible plan. Open weights plus a deterministic verifier is
a genuinely different architecture, not a downgrade.

**No lock-in, by construction.** Because the crew is provider-agnostic, an
advisor's tool can't be repriced out from under them by an API pricing change.
And the open toolchain — ScienceMadeReadable for literature, FalkorDB for
memory, a standard MCP surface — means the whole stack is inspectable and
replaceable.

## First User

[TODO — optional but "bonus points": get one real person (an advisor, a
frequent flyer, anyone flying long-haul this month) to run a trip and quote
what they said. Even "would you pay £25 to hand this to a client?" is data.]

## Prize Categories

- **Best Use of Render** — Render is the AI runtime: Blueprint-managed web
  service streaming five-agent SSE runs, plus a private FalkorDB service, on
  ~$7/mo. https://meridian-afud.onrender.com
- **Best Use of ElevenLabs** — per-agent voice layer (`src/lib/voice/`):
  five distinct voices streamed chunk-aligned over token generation, with
  char-aligned karaoke highlighting and a multi-voice dialogue mode for the
  plan handoff.
- **Best Use of Entire** — this project was built almost entirely by an agent;
  session: [TODO: DevRelay link]

## What I'd Build Next

Morning check-ins already trigger a replan loop (a traveller reports sleep,
the crew re-scores the remaining days). The missing piece for the advisor
workflow is multi-client management — the `/team` route is a first pass at a
fleet view. [TODO: 1–2 closing sentences]

<!-- PRE-PUBLISH CHECKLIST
- [ ] Resolve every [TODO]: video link, DevRelay session link, first-user note
- [ ] List DEV handles of any teammates (teams up to 4 — built at Accel with others?)
- [ ] Repo is public ✓ (github.com/sneldao/meridian)
- [ ] Note in README: any commits after Oct 18 deadline must be declared
- [ ] Tags auto-added by template: devchallenge, hf26challenge
- [ ] Decide: keep public URL on replay, or add a live featherless Render service
      (strengthens "AI runtime" claim — see tracker)
-->
