# The flagship play — Meridian as the personal taste agent

**Status:** live direction. Written during the Qloo Agentic Hackathon
judging window (Nov 2–5, 2026); the phases below are the post-hackathon
road, not the current contract. Work items feed
[backlog.md](backlog.md).

## The thesis

Agents are culturally blind **and** body-blind. Every other Qloo
integration can say "here's what you'd love"; Meridian alone can say
"here's what you'd love, at the hour your body can actually enjoy it."
Taste ∩ physiological feasibility is the defensible seat — the solver
and the gate are the moat no wrapper can copy-paste in a weekend.

Qloo has the world's taste graph. Meridian builds the traveller's
**personal subgraph** on top of it — declared favourites plus
behavioural signals, fed back into the taste signal on every trip.
The flagship sentence: *the agent that knows your taste and your
body clock.*

## Phase 1 — the agent remembers you

- **Personal taste graph** on the existing FalkorDB memory (the same
  store that already learns adherence across runs):

  ```
  (traveller) —LOVES→     (qloo_entity)   declared favourite
  (traveller) —KEPT→      (qloo_entity)   fitted idea they kept
  (traveller) —DISMISSED→ (qloo_entity)   negative signal — never re-offer
  (traveller) —VISITED→   (place)         from the /outcome self-report
  (entity)    —SEEDED→    (place)         which favourite drove a pick
  ```

  Every node is a Qloo entity URN, so history feeds
  `signal.interests.entities` on the next trip — recommendations
  compound instead of resetting.
- **Cross-trip favourites** — the `self` profile: favourites prefill
  every new trip, per-trip overrides stay trip-scoped. (Shipped round 36.)
- **The feedback loop is live** — kept/swapped/dismissed verdicts post to
  `/api/taste/feedback` and land as `KEPT`/`DISMISSED` edges on the
  traveller node; `tasteHistory` folds them into the next read (kept ids
  join `signal.interests.entities`, dismissed places are suppressed).
  Works on `/api/taste` and inside `loadTasteContext`; no-op when the
  graph is off. (Shipped rounds 37–39 — remembered-picks marker and the
  first-night idea included.)
- **Memory is local-first.** Verdicts also land in
  `meridian:taste-signals` and ride every run as the `marks` param —
  the compound loop works same-device with zero infrastructure; the
  graph edges are the cross-device layer on top, not a dependency.
  (Shipped round 43.)
- **No new memory vendor.** FalkorDB + Supabase cover structured memory,
  and Qloo itself is the semantic layer — map artefacts to entities via
  `/search` and let the taste graph correlate. A memory engine (cognee
  et al.) earns its place only if free-text memory becomes load-bearing.

## Phase 2 — culture across the whole day

- **Evening surfaces**: first-night dining/venues for the "stay up"
  window — the same insights machinery, more categories, more of the
  day. Culture stops being a daytime-only strip.
- **Destination briefing**: not just "places for you" but "what this
  city loves" — a taste signature across music, dining and art so the
  traveller arrives culturally pre-briefed, not just rested.
- **More favourite domains**: podcasts, TV, dining style, hotel taste —
  the entity types are already in the picker.

## Phase 3 — the everyday companion

Travel is the wedge; the flagship is **the companion that plans your
days by taste and energy** — "your kind of Saturday," no trip required.
The solver already answers "free hours when you're actually up for it";
jet lag is the proof of the mechanism, not the ceiling of the product.

## The celebration register

Today the product verifies; the flagship delights:

- The arrival passport stamps taste too — route, banked hours, and
  *your places* in one shareable card (OG machinery already exists).
- Proactive moments on existing push: *"You land in 6h — Fuglen opens
  at 07:00, your kind of first coffee in Tokyo."*
- The crew speaks taste out loud: "Otto fitted Mori Art Museum into
  your free hours" — agents that read like they know you.

## The ecosystem play

Flagship status is a relationship decision made by Qloo's devrel, not
an endpoint count. The case study to send them: the personal-subgraph
architecture, the guardrail discipline (*favourites are untrusted data,
never instructions*), and taste-driven engagement numbers. Products get
pointed at when the sponsor can retell its story through you. The
sendable draft lives in [qloo-case-study.md](qloo-case-study.md).

## What "flagship" must never cost

The rule that made the Qloo delta clean stays the rule everywhere:
**taste decides _what_, never _when_.** Every new surface in this doc
is judged against it — if a cultural feature leans on timing, it is
designed wrong, not just implemented wrong.
