# Home signature pass — hero, honesty, depth dial

2026-10-17 · Follow-up to [home-page-overhaul.md](home-page-overhaul.md)
(structure + accuracy, shipped). This pass is about the *visual signature*:
the page is honest and one-flow now, but the ghost terminator — the product's
namesake — still isn't carrying meaning on the home page.

## Status (updated 2026-10-17)

| Item | Status | Where |
|---|---|---|
| P0 light step fix | Done — on `main` | `3986ff9` |
| P1 hero ghost-terminator panel | Not in PR #5 — Dev 2 | — |
| P2 "Land at 100%" | Decided: option (1). Hero/handoff copy owner: Dev 2 | — |
| P2a voice ramp | Done in PR #5 | `src/app/page.tsx` |
| P2b nudge→impact loop | Not started — domain half is Dev 1 | — |
| P3 depth control | Done in PR #5 | `src/app/page.tsx`, `globals.css` |
| P4 leftovers | Narrowed: `.view` deleted. Sheet chrome, extra orphans, accent: open (see below) | `globals.css` |

PR: https://github.com/sneldao/meridian/pull/5 (branch `signature/home-pass`).

The P0 fix lives on `main` and isn't in this PR. Voice never switches on from
the depth dial; the traveller's own toggle is the only way to turn it on.

## P0 — bug first: light step showing wake time

Observed on `main` (deployed): "Get outside light · 05:15 London — Outside by
05:15" while the floor cap should place light at **07:00** for LHR→HND.

- `src/domain/nudges.ts`: `lightStart = lightIv?.startMin ?? wakeMin` — the
  fallback masks a missing `light_exposure` intervention and puts the step at
  the wake target instead.
- Check `previewPlan` for the live departure (today+3) in a test, not just
  `DEMO_TRIP`: a different `dayIndex` alignment may leave a day without light.
- If the intervention is genuinely absent, the honest answer is no step —
  never the fallback. Assert in `tests/nudges.test.ts`: a sunlight step's
  `startMin` equals the plan's light iv or the step doesn't exist.
- Verify on the live URL after merge: light ≥ 07:00 London on D-3.

## P1 — make the hero's left panel carry meaning

Today it's a dark card with a faint curve — mood, not information. The design
vision says the ghost terminator is where the product's identity lives.

- Render the real gap: the traveller's body-clock dawn vs the destination
  dawn, in the same card. Minimum viable: two terminator curves (real +
  ghost shifted by `ghostGapDeg`/banked shift) + the two cities, with one
  line under the card: *"Your dawn is Nh behind Tokyo's — the crew is closing
  it."* Pre-run N = residual owed at landing; as days lock, the gap visibly
  closes. Reuse `src/domain/sun.ts` + the `WorldLens` primitives (real
  terminator is a `geoCircle` — §3a of design-vision.md); an SVG mini-map,
  not a photo or a gradient.
- The panel answers "why this step now" at a glance: the next step's window
  marked on the curve (light step = where the beam lands).
- Reduced motion + `?depth=guided` users get the same info as a label, not
  an animation requirement.

## P2 — resolve "Land at 100%"

The tagline and the engine now disagree (floor cap: LHR→HND banks ~90 min of
8h pre-flight). Options in order of effort:

1. **Keep the tagline, add the truthful qualifier where it matters** — the
   hero copy and handoff say *"Land at 100% — that's the job. Pre-flight
   banks what you'll actually do; the rest lands in Tokyo daylight."*
   Cheapest; keeps the brand.
2. **Soften to "Land ahead"** or **"Land ready"** — tagline change in nav,
   README, video script sc01/sc08 (already reworded), pitch materials.
3. Deeper: reframe the readiness stat itself around residual-closing
   progress rather than arrival-state 100%.

**Decided 2026-10-17: option (1).** Keep the tagline; the honest residual is
the story — the hero/handoff copy carries the qualifier ("that's the job —
pre-flight banks what you'll actually do; the rest lands in Tokyo daylight").
Don't touch README/video taglines.

## P3 — depth dial discoverability

`?depth=guided` and `/crew` exist but are undiscoverable on the page.

- Persistent footer/edge control on `/`: three quiet rungs — **Today ·
  See why · Watch the crew** — mapping to Calm / Guided (`?depth=guided`) /
  Operator (`/crew`). One control, named for curiosity, per
  [consolidation.md](consolidation.md)'s depth model. Persist choice in
  localStorage (the deferred item from that spec).
- Guided = evidence drawers open + deep-dive visuals; nothing else changes.

## P2a — voice intensity ramps with the depth dial

Today "Voice on" is a binary toggle and, when on, all five agents speak — five
voices over a full run is intense on first contact.

- **Default: off on Calm.** The consumer surface ships silent; one "🔊 hear
  the crew" affordance in the hero/menu opts in.
- **Guided: one narrator, available but never auto-on.** Single voice
  summarising the handoff — not per-agent token streaming. Shipped this way
  after review: depth changes never switch voice on.
- **Operator (`/crew`): the full huddle** — current per-agent sentence
  streaming stays; it belongs there.
- Tie the ramp to depth, not a separate setting: the dial already models
  "how much machinery you see"; voice is the same axis for the ears.
  Keep the explicit Voice toggle as the per-session override and persist the
  last choice. `ELEVENLABS_*` behaviour unchanged — only *who speaks when*
  moves.

## P2b — nudge→impact feedback loop

Make each step *felt*, not just listed (this is the design vision's core
claim — the gap drawn, closing on screen):

- Completing a step moves the hero's ghost line and the readiness number in
  the same beat: "Done — your dawn moved ~20 min closer to Tokyo's."
- A skipped/missed step states its cost in arrival units, not guilt:
  *"Skip tonight's wind-down → ~20 min less of Tuesday's shift."*
- The timeline should read as a causal chain toward a landing stat —
  "you're banking ~Xh of the 8h shift; the rest lands in Tokyo daylight" —
  not five independent chores.
- Copy stays in outcome language (Calacanis lens): "energy for day one",
  never "phase advance". Precision lives in Why & details.

## P4 — visual-system leftovers

- One accent governs state (terminator gold = "on plan"); stop reusing it
  for chrome.
- Day-strip chips get the `.day::before` terminator motif already in the
  codebase; timeline rows keep the same 7px bisected-circle token instead of
  category emoji as the primary identifier (emoji can stay secondary).
- The sheet/modal chrome (edit trip) should use the same frosted overlay
  language as the deep-dive visuals.

## Order + verification

P0 → P1 → P3 → P2 (copy decision) → P4.

## Lane split (same ownership as the overhaul)

| Dev | Owns | Tasks |
|---|---|---|
| **1 — Engine** | `src/domain/nudges.ts`, `src/domain/solver.ts`, `src/domain/today.ts`, tests | **P0** (light step = plan's light iv or no step; preview test for a live today+3 trip, not just DEMO_TRIP). **P2b domain half** — a pure helper returning each step's earned/owed minutes toward the shift so the feed can say "moved ~20 min closer" / "skip costs ~20 min". |
| **2 — Today** | `src/components/NudgeFeedScreen.tsx` + components split out of it | **P1** hero panel — real terminator + ghost curve from `src/domain/sun.ts` (`geoCircle`/`geoOrthographic`, WorldLens §3a primitives; SVG, no new deps), two cities, the "dawn is Nh behind" line, next-step beam on the curve. Go straight to code — no mockup gate. **P2b UI** — Done/missed copy with the impact numbers from Dev 1's helper; causal-chain framing. **P2 copy** — the honest qualifier line on hero/handoff. |
| **3 — Shell** | `src/app/page.tsx`, voice plumbing, `globals.css` | **P2a** voice ramp (Calm silent + "hear the crew" opt-in; Guided = one narrator; `/crew` = full huddle; persist last choice). **P3** depth control on `/` (Today · See why · Watch the crew → calm/guided/operator) + localStorage. **P4** visual leftovers (state accent discipline, sheet chrome, day-chip motif). |

P0 landed alone, first — it's live on prod. Branch `signature/home-pass` off
`main` (single deployable line; no integration branch needed). Verification unchanged: `bun run typecheck &&
bun run lint && bun test`, plus a live check at 1280px and 390px — the hero
panel is where visual regressions will land.

## Open decisions

1. **P4 sheet chrome.** `DeepDiveVisuals` has no backdrop blur, so the spec's
   target doesn't exist. Options: match `AgentDrawer` (`bg-ink/70
   backdrop-blur-sm`), or define one overlay token and use it for both.
2. **P4 extra orphans.** `.deck`, `.tile`, `.chips` have no class usages in
   `src/`. Delete in a follow-up if confirmed.
3. **Accent.** Gold is only on focus rings (`Button.tsx`, `AgentChip.tsx`).
   Left as an accessibility state. Confirm.
4. **Depth rung names.** Spec says Today · See why · Watch the crew. The
   review suggests outcome names for consumers (Today · Why this works ·
   Advanced). Pick one before the consumer launch copy is written.

## Consumer review (2026-10-17)

Positioning as a consumer offer, not just a demo:

**Working:** the promise is specific ("land ready for your 9am meeting"); the
scorer's honesty is a real trust asset; the one-flow home is the right shape;
progressive depth keeps the mechanism one click away.

**Gaps, in priority order:**

1. **Demo data on first run.** Baseline is a fixture until Garmin is wired;
   calendar is a fixture unless Google is connected. The UI tags it, but a new
   user's first plan is built on someone else's sleep. Either real connect or a
   clearly labelled sample traveller on first run.
2. **Headline vs. engine.** "Land at 100%" with a qualifier underneath gets
   skimmed. Consider leading with "Land ready" or "Arrive ahead" and making the
   honest residual the subhead. This is a tagline decision, not just copy, so
   it needs an owner before any launch copy is written.
3. **Voice is off by default.** Right for not overwhelming people, but it hides
   the demo's emotional moment. Offer one explicit "hear your plan" action on
   Guided, not a toggle labelled "Hear the crew".
4. **Operator language on the consumer path.** Named agents, tool calls, and
   graph memory are for builders. Keep them off Today; rename rungs for
   outcomes (open item 4).
5. **Medical-adjacent boundary.** Circadian timing sits near health advice.
   State it is planning help, not medical guidance, before asking for sleep or
   wearable data.
6. **Visual consistency.** Sheet overlay and accent (open items 1 and 3).

**Offer hypotheses (not decided):**

- Buyer: frequent business travellers who lose a day to jet lag. The value
  moment is before the trip, so the product is "plan my next trip", a repeat
  habit.
- Moat: check-ins and outcomes feed adherence and memory across trips. Show it
  to the user ("last trip you skipped the morning walk; this plan moves it").
- Pricing: per-trip or subscription with a free first plan. Don't price by
  agent runs; users don't understand that unit.

**Next, in order:** (1) first-run data honesty, (2) headline decision, (3) a
"hear your plan" moment on Guided, (4) medical boundary copy, (5) rung naming.
Re-open P1/P2b after (1) since they depend on the same first-run data.
