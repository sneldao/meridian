# Agent-native — making the crew's work legible, and the world personal

*Plan following field feedback (round 55): test users landed on the feed but
didn't glom onto the jetlag + Qloo combination — the culture aspect reads as
garnish, the base state reads as empty, and nothing about the product learns
who is standing in front of it. Scope: landing + feed surfaces. The Altitudes
architecture stays as shipped.*

---

## 0. What the field test actually measured

Three complaints, one root:

1. **"The crew decides when · Qloo decides what" is a claim, not a
   mechanic.** The taste crate is a tertiary form field
   (`Pack a taste crate · optional`, three chips) — the single most
   distinctive input in the product, presented as decoration. Qloo's payoff
   lives in the `discover` room — the last room, after the plan is already
   made — where the room itself confesses "Destination picks · not
   personalized yet."
2. **The base state is dead.** "No route yet — the sun rises when the trip
   does" is honest but reads as empty. The example day sits behind "Just
   looking around?" — the visitor is asked to act before seeing anything
   work. Meanwhile we already know their timezone, their clock, their
   season — none of it lights anything.
3. **The agentic aspect is invisible.** Otto and Iris speak in captions, but
   nobody sees the crew *work*: the trajectory computation, the conflict
   scan, the place resolution all happen in a black box between "See my
   trip plan" and the feed appearing. The work is real
   (`computeTripTrajectory`, `attestation` scorer inputs, conflict
   detection, `resolvePlaceChoice`) — it's just never shown.

The remedy is not more copy explaining the crew. It is making the work —
and the taste — *legible*: a trace that replays real computation, provenance
chips on everything retrieved, and an opt-in ladder where each granted
signal visibly changes the world.

## 1. The agent-native vocabulary, mapped to real surfaces

Reference kit shared by field (Thinking/Loader/TaskRows/ContextCards/
InsightCards/RecordsTable). Meridian's "tool calls" are the crew computing
the trip — the trace replays real domain steps, so it is provenance with
staging, not theatre:

| Reference pattern | Meridian surface | What it shows |
|---|---|---|
| ThinkingState (expandable trace, settles, stays expandable) | **"The crew's account"** on `See my trip plan` → the boot state | "Read the route — 6h behind → computed 5 light windows → flagged the gallery opening against curfew → matched your crate to 3 places." Runs once, settles to "Planned in 1.8s", expandable after. |
| LoaderGrid + elapsed timer (and the Surfer variant — loader over a video) | The plan-build loading state | Pixel-grid drive loader + honest elapsed timer; below it the featured traveller's advert plays — waiting becomes watching. |
| ContextCards (chunks with source badges) | Provenance chips under the plan header | "Calendar: 3 meetings · Crate: Björk × Luke Combs · Body clock: −6h" — the same disclosure law as EXAMPLE/FICTIONAL: where things came from is visible. |
| TaskRows (status pills + expandable detail + failure/retry) | `AgentDrawer` | Otto / Iris / scout jobs as live rows: "Scanning conflicts — 2 flagged", "Qloo rate-limited — retry", detail steps drop down. |
| InsightCards (prose + mini-viz + action pill) | Crew findings in `next` / `discover` rooms | "The gallery opening lands at 18:00 body time — Iris flagged it" + shift-curve mini chart + "Shift the plan back a day" pill. |
| RecordsTable (computed columns resolving row-by-row) | The `plan` room's day table | Days as rows; computed columns (light window, conflict, place pick) resolve staggered while the crew calculates — the calculation made visible. |
| ToolChips | — | Skip; the expand-to-see-what-happened law is already covered by TaskRows/Thinking. |

## 2. Wake the base state

The instrument's sleeping read is honest but empty. Replace the dormant
first paint with a **visitor read** — signals we already hold, zero opt-ins:

- Device timezone + clock → the medallion wakes for *you*:
  "Your body is on London time — it thinks it's 09:12." The sun-self is lit
  for a person before any trip exists.
- The example day stays reachable, but the world's first read is personal,
  not generic.
- Crate chips in the form get a visible payoff the moment a favorite is
  typed — a "12 places found" line under the field, re-ranking live.
  Personalisation you can't see is surveillance with extra steps; every
  granted signal must visibly change the world.

## 3. The opt-in ladder (personalisation sources, ranked)

All compatible with the no-account, same-device identity model already in
the contract. Ranked by signal-per-effort:

| Rung | Source | Signal | Cost | Status |
|---|---|---|---|---|
| 1 | Timezone + clock | home body clock, wake assumption, season | zero | free, today |
| 2 | Taste crate (better UX) | entity affinities → place ranking | type a word | exists, buried |
| 3 | Session behavior | place swaps, day locks, skipped nudges, adverts watched | zero (localStorage only) | collected today, used for nothing |
| 4 | Home airport + usual wake | real baseline for shift math | one field | trivial |
| 5 | Chronotype (2 questions) | real `anchor_wake` instead of assumed 07:00 | 20 seconds | trivial |
| 6 | Calendar connect | meetings, dinners, flights — the constraints the plan must bend around | OAuth consent | **built, behind `googleCalendarEnabled` beta flag** |
| 7 | Itinerary / boarding-pass upload | real flight times, real events — no OAuth | one file | medium build |
| 8 | Sleep export (Health) | real chronotype | heavy | later |

Rules:
- Every rung's payoff is immediate and visible (calendar → meetings appear
  on the timeline and Iris flags against them; crate → "12 places found"
  + re-rank; swap → different alternatives next day).
- Nothing leaves the device without the existing consent UI; the privacy
  posture already promises the opposite of hidden collection.
- `googleCalendarEnabled` is hard-off in this beta per AGENTS.md — and the
  recommendation is to **keep it off for now**. The code exists, but the
  real cost is not code: Calendar read is a Google *sensitive scope*, so
  production access requires OAuth app verification (privacy review,
  potentially a security assessment) — weeks of external process plus a
  heavier privacy story to sell at the exact moment the product is
  establishing "nothing leaves this device." Rung 7 (itinerary/boarding-pass
  upload) yields ~80% of the same signal — the event being travelled for,
  real flight times — for ~20% of the privacy surface, with consent that's
  literal file choice rather than account OAuth. Do rungs 1–5 and 7 first;
  revisit Calendar when there's an account model that makes the consent
  durable.

## 4. Build order

Cheapest-first, ordered so each phase dies-testable. Status: steps 1–6 shipped
(commits `1fa732c`, `209e6a8` + step 6 batch).

1. **Wake the visitor** ✅ — `sunSelfVisitor` lights the medallion for the
   device clock ("Your body is on X time — it thinks it's HH:MM"); crate
   selection answers live via `matchSampleProfileForTrip → splitSamplePlaces`
   with an `imagined sample` provenance suffix.
2. **The crew's account** ✅ — `CrewAccount` in the `aria-busy` region: pixel
   loader + real elapsed, four real rows measured off the `/api/trip` payload,
   settles "Planned in Ns", stays expandable; the traveller's clip plays
   muted below. No fake latency — dwell is presentation pacing.
3. **Provenance chips** ✅ — `provenanceChips` in `domain/provenance.ts`;
   a row of mono pills under the plan header quoting the account verbatim
   (route · body clock · light · conflicts · crate · calendar), deriving
   only what the trip honestly knows on restore and naming each source.
4. **Taste forward** ✅ — `dayPlacePin` (`lib/place-choices.ts`) puts the
   resolved pin on the current day's card ("· from your crate"); kept/
   swapped-in adjacency re-ranks `resolvePlaceChoice` alternatives per
   session. Crate pick-list/free-text stays an open gap (chips only today).
5. **TaskRows AgentDrawer** ✅ — `deriveCrewJobs` + `CrewJobs` Jobs tab:
   six rows (Mara baseline, Jun science, Otto windows, Iris conflicts, Rex
   calendar, Scout places-as-tool), Preview/Done/Failed pills from real
   evidence only, expandable substeps, retry = real `startShift`.
6. **InsightCards** ✅ — `insightCards` (`domain/insights.ts`) derives 0–3
   cards (gap+curve, conflict+strip, place pin) only where the fact exists,
   in the `next` room slab; prose → mini-viz → action pill, no autoplay.
7. **RecordsTable plan room** — pending: day table's computed columns
   resolve staggered while the crew calculates.
8. **Calendar flag** — product call; the engineering exists.

## 5. Explicitly not doing

- **No fake latency.** The trace replays real compute steps with real
  numbers; it does not insert sleeps to look busier. If the plan builds in
  400ms the trace says 400ms.
- **No chat box.** The crew is a set of workers with a visible account of
  work, not a conversational UI bolt-on.
- **No new ambient animation** — the LoaderGrid runs only while the boot
  state lives; the trace runs once and settles; consistent with the
  demand-drawn law.
- **No third-party trackers or fingerprinting** for the opt-in ladder —
  signals are declared, inferred on-device, or consented.
- **RecordsTable's full property-configurator** (popovers, prompt editing)
  — we inherit only "computed columns resolve row-by-row."

## 6. Acceptance

- Landing first paint shows a lit medallion reading *your* clock, not
  "No route yet."
- Typing one favorite in the crate field visibly re-ranks or counts places
  before submit.
- `See my trip plan` shows the crew's account — real steps, real numbers,
  real elapsed — then settles expandable.
- The plan header carries provenance chips naming every signal used.
- `discover` opens with place pins on the first day, ranked by session
  behavior.
- Every new surface reads in words under reduced motion; every signal is
  named where it's used (the disclosure law extends to personalisation).
