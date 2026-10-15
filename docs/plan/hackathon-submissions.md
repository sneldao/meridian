# Hackathon circuit — submission targets

Live tracker of external hackathons Meridian is eligible for, ranked by
fit-to-effort. Researched 2026-10-15 via Tavily; verify rules pages before
submitting — Devpost deadlines shift.

**Already in flight:** Graph Hacks (FalkorDB × WeMakeDevs), deadline
**2026-10-18** — see [graph-hackathon.md](graph-hackathon.md) and
[graph-memory.md](../reference/graph-memory.md). Same-day deadline:
**DEV Hacktoberfest Open-Source AI Challenge, Week 2 (Side Hustle)** —
deliverable is a DEV post, not a Devpost package. Post draft:
[dev-week2-post.md](dev-week2-post.md).

## DEV Challenge — Hacktoberfest Week 2: Side Hustle

- Contest page: https://dev.to/challenges/hacktoberfest-week2-2026-10-12
  · rules: `/page/hacktoberfest-week2-2026-10-12-contest-rules`
- Entry period **Oct 12 12:00 PDT → Oct 18 11:59 PM PDT**; winners week of
  Oct 19. One entry per participant. **Max one prize per participant** —
  entries may *declare* multiple categories but win at most one, so declare
  every category genuinely used and let judges award the best.
- Target: **Best Use of Render, $200** (featured). Already deployed —
  Render is the AI runtime per `render.yaml` (web + private FalkorDB
  service, autodeploy on main, ~$7/mo). Also genuinely qualifies:
  ElevenLabs ($100 — voice layer shipped) and Entire ($100 — DevRelay
  session link needed).
- Eligibility verified 2026-10-15: repo started + completed inside the
  window (first commit Oct 15). Rules: "repositories must be started and
  completed within the challenge window"; commits after the deadline must
  be noted in the README or it's a DQ risk.
- Required elements: template post w/ `#devchallenge` + `#hf26challenge`,
  live URL or video ✓, public repo ✓ (sneldao/meridian is public),
  open-innovation explanation, team DEV handles if any.
- Judging: writing quality weighted most; tiebreak = post reactions.
- Open-model angle: provider-agnostic crew (Qwen3-32B/Featherless default,
  Nemotron/Nebius); scorer gate holds identical outcomes on Nemotron vs
  Claude (verified run: 18 tool calls, 2 rejections, score 0.91, 15
  citations) — "cheap model + deterministic verifier" IS the pitch.

### Meridian angle — post drafted, actions open

- [ ] Publish `docs/plan/dev-week2-post.md` before Oct 18 11:59 PM PDT
- [ ] Decide: keep public URL on `AGENT_PROVIDER=replay`, or add a second
      Render service on `featherless` so judges hit live open-model
      inference (strengthens the Render claim; ~pennies/run risk)
- [ ] ~2–3 min demo video (reuse shot list below, Render voiceover)
- [ ] DevRelay session link for Entire category
- [ ] "First user" bonus: one real traveller/advisor runs a trip, quote it
- [ ] README note about any post-deadline commits
- [ ] Optional cheap adds: free .tech domain → $100 category; Gemma swap
      via Featherless (`FEATHERLESS_*_MODEL` to a Gemma ID, verify with
      `bun run provider:check`) → $200 category

## Top three targets

| # | Hackathon | Deadline | Prize | Why Meridian |
|---|---|---|---|---|
| 1 | **Amazon Developer Hackathon** | **Oct 23, 12:00 PDT** | $138K cash + AWS credits · only ~678 participants | Alexa+ track accepts a *simulated* agentic experience in a web app — Meridian already is one |
| 2 | **Nebius × NVIDIA Global AI Hackathon** | **Oct 30, 13:00 EDT** | $50K cash ($20K grand) + $3K "Best Use of Tavily" | Personal AI track is literally Meridian: persistent memory, reusable skills, always-on assistant |
| 3 | **Qloo Agentic Hackathon** | **Oct 30, 23:45 EDT** | $25K cash | Rules explicitly allow "integrates the Qloo API into an existing agent" — travel/taste domain is a natural fit |

Stretch: **PayPal AI Hackathon** (Nov 12, $67.5K) — needs PayPal integration
to be *central* (agentic commerce: Rex pays for itinerary changes). Bonus
categories suit us: "Best Use of Render" ($1K credits — we're already on
Render), "Best Demo Delivery" ($5K). Revisit after the Oct 30 cluster.

## 1. Amazon Developer Hackathon

- Devpost: https://amazonappdev2026.devpost.com · rules: `/rules`
- Deadline **Oct 23, 12:00pm PDT**; judging Nov 9–20; winners ~Dec 3.

### Requirement (Alexa+ track)

A working Agent Skill or self-hosted MCP server (MCP spec ≥ 2025-11-25,
Streamable HTTP) — **or** a simulated Alexa+ experience in a web app using any
agentic tools. The simulated path is exempt from the runtime-technology-hook
requirement; repo must still contain the simulation source and the demo video
must show it.

### Meridian angle — **done** (2026-10-15)

Shipped `POST /api/mcp` — a stateless MCP server (Streamable HTTP, protocol
2025-11-25, `src/mcp/server.ts`) exposing eight tools: `preview_trip`,
`plan_shift`, `evaluate_plan`, `record_check_in`, `search_literature`,
`crew_memory`, `recall_findings`, `latest_plan`. Verified live: `initialize`
→ `tools/list` → `tools/call` all work, `plan_shift` runs the real crew and
returns briefing + `.ics`. This is the *real* Alexa+ path, not the simulated
fallback.

Still needed before submit: demo video showing MCP calls (e.g. an MCP client
hitting the endpoint), public repo, submission text.

- Cheaper fallback kept in reserve: "Meridian as Alexa+" simulated track needs
  none of this — just the video.
- AWS Builder mini-challenge is a bonus entry if any Bedrock/AgentCore call
  is added, but not required.

## 2. Nebius × NVIDIA Global AI Hackathon

- Devpost: https://nebiusglobalaihackathon.devpost.com · rules: `/rules`
- Deadline **Oct 30, 1:00pm EDT**; judging Dec 1–15.
- Hard requirement: **runtime call to Nebius Token Factory inference API** (or
  Nebius AI Cloud compute) **and ≥1 NVIDIA open-source model** (Nemotron
  family).

### Meridian angle — **code shipped + key verified** (2026-10-15)

- `AGENT_PROVIDER=nebius` is live in `src/agents/providers.ts` — Token Factory
  (`api.tokenfactory.nebius.com/v1`, OpenAI-compatible), defaults Nemotron 3
  Ultra (orchestrator) + Super 120b (specialists). `NEBIUS_API_KEY` is set in
  `.env.local` and verified: both model IDs exist in the catalog, inference
  works (mind `max_tokens` — Nemotron spends reasoning tokens first), and
  `bun run provider:check` confirms JSON-schema tool calls work end to end.
- **Tavily prize ($3K):** `src/tools/tavily.ts` shipped — Jun gets a `searchWeb`
  tool (live guidance, destination practicalities) alongside `searchScience`;
  also exposed as MCP `search_web`. Deliberately non-citable: web hits inform
  the read but never enter the citation set — keeps the "papers with DOIs"
  claim clean.
- Enter **Personal AI track**: persistent memory (FalkorDB graph), reusable
  skills (crew tools), cross-run learning (`/outcome` loop). "Best Apps &
  Agents" is the fallback category.
- Free credits via the Nebius Builder Program (Token Factory + Tavily).
- **Multi-step coherence verified (2026-10-15):** full `plan_shift` on
  Nemotron in 143s — 18 tool calls all answered, scorer rejected 2 drafts and
  the retry loop recovered (4/5 days locked, score 0.91, 15 citations, .ics
  committed). Same D-1 physiological-limit outcome as the Claude run — the
  gate holds regardless of provider.
- Remaining: submission text only.

## 3. Qloo Agentic Hackathon

- Devpost: https://qloo.devpost.com · rules: `/rules`
- Deadline **Oct 30, 11:45pm EDT**; judging Nov 2–16; winners ~Nov 23.
- API access via Google Form (linked from the Devpost page / Qloo developer
  guide).

### Requirement

Working app that **integrates the Qloo API** and is agentic — explicitly
including "integrates the Qloo API into an existing agent." Live hosted demo
URL required (have it), public repo **with an open-source license visible in
the repo About**, text description.

### Meridian angle — **code shipped** (2026-10-15), needs key

- `src/tools/qloo.ts` shipped: `destinationTaste(city, lon, lat)` resolves the
  destination via `/search` then pulls places via `/v2/insights` —
  `filter.location.query` restricts to places inside the locality's shape,
  `signal.interests.entities` carries the destination entity as the taste
  signal (params verified against the entity-type guide + parameter
  reference, 2026-10-15). Otto gets a `destinationTaste` tool grounding
  intervention notes in what the place actually offers — never touches timing
  or the scorer. Also MCP `destination_taste`.
- ~~CRITICAL PATH~~ **key requested 2026-10-15** — provisioning is manual,
  "a few business days". Keys only work against `hackathon.api.qloo.com`
  (`X-Api-Key` header) — wired as `QLOO_API_KEY` + `QLOO_BASE_URL` in
  `.env.local`, drop the key in when the email lands.
- Once the key lands: smoke `destination_taste` for a real place list (params
  verified; response fields still need a live check), one `plan_shift` run,
  submission text.
- **Action needed before submit:** add an OSI license file (repo currently
  private/unlicensed — confirm with team) and describe the Qloo delta in the
  submission text.

## Not pursuing (and why)

| Hackathon | Deadline | Verdict |
|---|---|---|
| Life After Code (GitLab Transcend) | Oct 27 | DevSecOps automation theme — forced fit |
| AWS CDS Agentic AI Partner | Oct 28 | Requires AWS Partner org status |
| AMD ACT III | ~Oct 17–18 | Ends too soon, AMD GPU infra required |
| Vultr Agent Rush | Nov 8 | Code/browser-sandbox agents — wrong shape |
| Google Agents for Impact | Oct–Dec | In-person only (Toronto/Atlanta/Sunnyvale/NYC) |
| STEMergent, Arbiter, KUK | Nov–Dec | Student/restricted eligibility |
| YouCam Skin AI, Meta VR | Nov | Wrong domain entirely |

## One video for all

Record a single ~3-min demo (PayPal's cap; safe everywhere) where every
sponsor integration appears in one shot list. Record after Graph Hacks lands —
the memory hop-path answer is the strongest beat.

Post-consolidation arc — the app now has three depths (`docs/plan/
consolidation.md`): `/` consumer face, per-nudge evidence (Guided), `/crew`
operator surface. The video walks the dial — product first, agent infra
underneath, which is a stronger submission than dashboard-first.

1. **Cold open** — landing at `/` (calm face): pick LHR→HND, crew run
   starts. (5s)
2. **The face** — day nudges appear; Guided ribbon: "Crew: drafted 2× ·
   scorer rejected 1× · locked at 0.91". (10s)
3. **Show your work** — tap a nudge's "Why & details": the evidence row —
   gate score, rejection-and-retry, backing citation, memory hop path.
   *This is the consolidation arc's signature shot.* (15s)
4. **Crew feed** — flip to `/crew` (`?depth=operator` URL): Mara reads the
   baseline; Jun calls `searchScience` then `searchWeb` (Tavily hit in the
   feed). (20s)
5. **The gate** — Otto's draft rejected by the scorer, evaluator explains,
   retry locks. "Agents propose, code disposes." (30s)
6. **Memory** — `recall_findings` answer with hop path in the ledger. (15s)
7. **Taste** — Otto calls `destinationTaste`; a plan note grounds a light
   break in a real Tokyo venue category. (15s)
8. **Handoff** — briefing card + `.ics` download + calendar moves. (15s)
9. **The MCP surface** — terminal split: `tools/call plan_shift` against
   the live Render URL. (15s)
10. **Close** — "agents that fly ahead of you" + provider badge visible
    (`nebius` in the run header for the NVIDIA cut). (5s)

Tailoring per submission is just the voiceover + the last 10s frame — the
footage never changes.

## Cross-submission checklist

Every Devpost submission needs roughly the same assets — make them once:

- [ ] Public repo with an OSI license file (Qloo requires it explicitly)
- [ ] ~3 min demo video showing the app working (PayPal caps at 3 min)
- [ ] Live URL stays up through judging — Render free tier sleeps; pin it
- [ ] Submission text template: problem → crew → "agents propose, code
      disposes" → sponsor-tech delta → what's new this window
- [ ] Screenshot set: world lens, crew feed, `/review` plan, hop-path answer
