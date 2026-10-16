# Home page overhaul — accuracy, one flow, honest claims

2026-10-16, updated same day after PR 0 merged. Derived from a critical
review of `/` against
[next-steps.md](next-steps.md), [consolidation.md](consolidation.md),
[consumer-appeal-implementation.md](consumer-appeal-implementation.md) and
[icp.md](icp.md). All three phases run now, in parallel, across three
developers. **Phase A items merge first (target: 17 Oct EOD, ahead of the
18 Oct Graph Hacks deadline)**; B and C follow in the same lanes.

**Branch state (`48223a0`, on `overhaul/dev1-contract`, clean):** the contract
shipped with more than stubs — landed: `previewPlan` full body **and the
solver's eastbound floor cap** (the "Cap the shift, don't chase 100%"
decision — `LIGHT_START_MAX_OFFSET_MIN`, `solver.ts:55,238-255`), the
solver-side destination-clock conversion for the first post-flight day
(`solver.ts:123-126`), all `today.ts` helpers, `TravelerNudge.endMin`,
`buildDailyNudgesForDay`'s `adherence` param (still ignored, not destructured —
1.2 makes it operative), the qualitative flight shape, `baselineSource` in
`/api/trip`, and tests for `today.ts` + `previewPlan`. **Not yet landed, all
in PR 0's scope:** the `adherence` *sentinel* floor rule in nudges (1.2), the
nudge-level floor test (1.4), `previewPlan`'s floor-candidate + budget tests
(1.4), the props-type export (1.0), and the CSS lane blocks. Everything else
below is the open work.

## Why

`/` is supposed to be the Calm rung: *"tell me your trip; I tell you the one
thing to do now so you land fresh"* — with the scorer authoritative and no
fabricated evidence. Today it breaks that in five ways (all verified in code).

**Every claim below cites `file:line`.** If an implementation contradicts one,
the *code* wins — update this doc in the same PR rather than picking silently.

1. **The pre-run preview bypasses the solver and the scorer.**
   `src/domain/nudges.ts:193` — `const stepMin = (east ? -65 : 65) * (dayIndex + 1)`,
   consumed at `:196-197` (`wakeMin = plan ? plan.targetWakeMin : wrap(baseWake + stepMin)`).
   When there is no plan, Alex (compliance floor 07:00) is told to get light at
   04:50 and run at 05:20, and is offered "Move standup 09:30 → 07:35" — straight
   into the fixed *Team breakfast* 07:30–08:30 on the same day.
2. **Fabricated numbers.** `NudgeFeedScreen.tsx:239` (`Math.max(6, …)` → "6% done"
   beside "0 of 5"); `TripSetupScreen.tsx` (invented HRV 62 / RHR 52, `|| 3`,
   `"2/2"`, a duplicate hardcoded flight array); `NudgeFeedScreen.tsx`
   `downloadIcs` (empty calendar pre-run); fixture Garmin data never labelled as
   demo; `FlightOptionRecommendation.landingReadinessPct` hardcoded percentages
   *(the percentages are gone since `48223a0` — qualitative badges/`bestFor`
   landed; the 6% floor, invented setup fallbacks and empty `.ics` remain)*.
3. **"Your next move" is wrong.** The hero picks the first incomplete nudge by
   *category* order, not by time, and `NudgeFeedScreen.tsx:224` compares
   `activeDaySpec.date === new Date().toISOString().slice(0, 10)` — UTC, and
   `slice(0,10)` truncates to a date rather than comparing instants. Result: the
   hero shows a window that has already passed.
4. **Readiness never works eastbound.** `NudgeFeedScreen.tsx:250` — the
   denominator *already* has `Math.abs`; the failure is the **numerator**:
   `lockedShiftMin` sums negative `shiftMin` for eastbound advances, so the
   `shiftPct > 0` gate at `:251` never passes and readiness silently falls back
   to the "of today done" progress label. (`today.ts:shiftLockedPct` documents the
   correct cause — take `Math.abs` on *both* sides.)
5. **Two screens stacked, not one flow.** The page title is the Setup heading,
   setup sections render 2 → 1 → 3 → 4, "Morning Check-in" pre-run just starts
   a run, and the hardcoded default `2026-10-18` (`page.tsx:57`, plus
   `api/trip/route.ts:16`, `crew/page.tsx:52`, `api/crew/run/route.ts:19`) means
   any visitor after that date gets no "today" at all.

## Decisions (settled — don't re-litigate in PRs)

| Topic | Decision |
|---|---|
| Preview source | **Solver + scorer.** `previewPlan` runs `solveDay` over the trip, locking each day. A day the solver can't place shows "not placed yet — personalise", never invented times. |
| Compliance floor | **Cap the shift, don't chase 100%.** Eastbound, the solver never picks a shift that puts the day's wake before `floor − 105 min` (so the light anchor can start at the floor); a hold day is always allowed. The rest of the shift happens after landing in destination daylight, and the UI shows the honest residual from `SolvedDay.result.coverage.residualMin` ("you'll land ~Nh short; the days after landing finish it"). The scorer is unchanged (floor stays a soft penalty there). The replay script is updated to the same policy. Within a placed day, no ask (light, run, calendar move) lands before the floor when a free slot at/after it exists; the sleep window is exempt. |
| Clock frames | Days up to and including the flight day are origin-local; days after are destination-local (`dayPlace`). The solver converts its reference schedule into destination time for the first post-flight day (the scorer already drops the sleep reference there). |
| No plan for a day | `buildDailyNudgesForDay` returns `[]` when there is no plan; the feed renders "not placed yet — personalise" when the day's `previewPlan` entry is null and there's no locked/draft plan. Flight day has no run step unless the plan includes an `exercise` intervention. Days after the flight are always null in `previewPlan` — the feed shows "Planned with you after you land" plus the residual, not "not placed yet". |
| Flight windows | **Qualitative only:** `Best` / `Workable` / `Hardest` + a one-line "best for". No percentages, no "Zero Jet Lag", no flight numbers. |
| Layout | **Full one-flow.** No trip → setup state. Trip set → **Today** (next step → timeline → readiness). Setup becomes a trip-summary chip + edit sheet. Guide/Setup pills and the "Trip & Flight Setup" title are removed; "Crew" stays as the depth link. |
| Views | Timeline is the only Calm view. Focus/Cards modes, the default-view star and category filters are removed. Deep-dive visuals (globe, swimlane, week) render only at `?depth=guided`. |
| Default trip date | Consumer default departure = **today + 3** (client local date) so D-3 is today. Fixtures (`DEMO_DEPARTURE`, `DEMO_TRIP`) stay fixed for tests/replay. |
| Vocabulary | "Today", "step" (not nudge/move/card), "Your next step", "Personalise" (British — the app is London-first), "Crew". No "circadian", "phase-advance", "melanopsin", "zeitgeber", "scorer" on Calm; those live in the Why drawer / `/crew`. |
| Times | Every time is labelled with the city it's local to ("04:50 London"). |

## Branches

One branch per lane, off `main` — **never a shared working tree** (lanes 1 and 3
both had uncommitted work in one tree on 16 Oct, which is how the merge-conflict
risk this plan exists to avoid gets created):

```
lane/engine   Dev 1   lane/today   Dev 2   lane/shell   Dev 3
```

PR 0 is the only PR that lands before the others start. Each subsequent PR must
name the contract items it consumes. A lane must not implement against a contract
item that isn't on `main` — if it's urgent, land the contract stubs as their own
commit first.

Merge order within a phase: **lane 1 → lane 3 → lane 2.** Lane 3 rewrites
`page.tsx`, which is lane 2's only call site (`page.tsx:646`); lane 2 rebases
last.

The contract currently sits on `overhaul/dev1-contract`, **not on `main`** —
finish PR 0 there (exported props type, CSS lane blocks) and merge it to
`main` before any lane branches, or the "don't implement against a contract
that isn't on `main`" rule forces everyone to branch off the feature branch
anyway.

## Shared contract — PR 0 (Dev 1, merge first, same day)

Types and signatures only, with stub/minimal bodies that compile, so Dev 2
and Dev 3 build against them immediately. Bodies + tests land in Dev 1's A
PRs.

**Status:** partially merged (`48223a0`) — the domain types/shapes below
shipped with full bodies and tests. Outstanding for PR 0: the props type
(see next subsection) and the CSS lane blocks.

```ts
// src/domain/solver.ts
export function previewPlan(input: {
  trip: Trip;
  calendar: CalendarEvent[];
  adherence: AdherenceProfile;
  baseline?: { avgBedtimeMin: number; avgWakeMin: number };
}): Map<string, SolvedDay | null>; // keyed by DaySpec.label, like run.locked / run.drafts

// src/domain/nudges.ts
interface TravelerNudge { /* existing */ endMin: number } // wrap-aware: endMin < startMin means it crosses midnight
// buildDailyNudgesForDay params gain:
  adherence: AdherenceProfile;

interface FlightOptionRecommendation {
  id: string;
  badge: "Best" | "Workable" | "Hardest";
  recommended: boolean;
  departsLocal: string;
  arrivesDest: string;
  bestFor: string;          // one line, e.g. "Lands in morning daylight"
  cabinSleepWindow: string;
  whyChoose: string;
  firstNudgeOnLanding: string;
  // removed: flightNumberExample, landingReadinessPct, headline
}

// src/domain/today.ts (new, pure)
export function dayPlace(trip: Trip, dayIndex: number): { city: string; utcOffsetMin: number };
export function todayDayIndex(trip: Trip, now: Date): number | null; // null = no trip day is today
export function nowMinOnDay(trip: Trip, dayIndex: number, now: Date): number;
export function pickNextStep(
  nudges: TravelerNudge[],
  completed: Set<string>,
  nowMin: number | null,   // null when the selected day isn't today
): { next?: TravelerNudge; missed: TravelerNudge[]; upcoming: TravelerNudge[] };
export function shiftLockedPct(trip: Trip, locked: DayPlan[]): number; // 0–100, sign-safe

// GET /api/trip response gains:
  baselineSource: "fixture" | "garmin";
```

`pickNextStep` semantics: when `nowMin` is null, `next` = first incomplete by
`startMin`, `missed` = []. When it's a number, a step is **missed** iff
incomplete and `nowMin >= end` (end unwrapped: `endMin < startMin ⇒ endMin +
1440`); `next` = first incomplete, non-missed step by `startMin`.

`dayPlace`: days before `trip.departureDayIndex` → origin; after → destination;
flight day → origin. **Verified before merge** (done — `tests/today.test.ts`
asserts flight-day-is-origin-local, and `fixtures.ts` places `ev-flight`
origin-local on the departure day; the solver's destination-clock conversion
matches). Nothing further to flag.

### The React prop contract (also PR 0)

Domain types alone don't cover the plan's largest conflict: `page.tsx:646` is
`NudgeFeedScreen`'s **only** caller, `page.tsx` is exclusively Dev 3's, and
task 2.x changes three of that component's 19 props. Freeze the shape now:

```ts
// src/components/NudgeFeedScreen.tsx — export the props type (currently
// unexported at line 22) with exactly these deltas:
export interface NudgeFeedScreenProps {
  // …existing 19 props…
  + adherence: AdherenceProfile;      // task 2.1
  - chosenFlightId: string;           // task 2.6 (dropped)
  ? ics?: string;                     // task 2.4 — rendered only when present
}
```

Dev 2 changes nothing about the prop *shape* after PR 0. If a task appears to
need another prop, it is a contract amendment: propose it in a PR 0.1 that
Dev 3 rebases onto before Dev 3 starts 3.3/3.4.

**Status:** not landed. `NudgeFeedScreenProps` is still unexported and has no
`adherence` (`NudgeFeedScreen.tsx:22`) — this export is PR 0's remaining
must-have; nothing in lane 2 can compile against the contract until it exists.

## Lanes

File ownership is exclusive — if you need a change in another lane's file,
ask its owner. `globals.css` is shared: **PR 0 appends three empty lane blocks
at EOF** (`/* ── lane: engine ── */`, `/* ── lane: today ── */`,
`/* ── lane: shell ── */`); no lane may append CSS before those blocks exist, and
classes are appended inside the owning lane's block. Only Dev 3 deletes obsolete
classes, at the end.

### Dev 1 — Engine (domain + tests)

**Owns:** `src/domain/solver.ts`, `src/domain/nudges.ts`, `src/domain/today.ts`
(landed in `48223a0`), `tests/*` for those, `docs/plan/icp.md`.

| # | Phase | Task |
|---|---|---|
| 1.0 | A | **PR 0** — the shared contract above, including the props type and the CSS lane blocks. **⚠ partially landed (`48223a0`)**: domain shapes + tests are in; the props-type export and the three CSS lane blocks are not. Finish those, then merge `overhaul/dev1-contract` → `main`. |
| 1.1 | A | ✅ Landed (`48223a0`) — `previewPlan` body as specified, **plus** the eastbound shift cap from the Decisions table (`LIGHT_START_MAX_OFFSET_MIN`, `solver.ts:55,238-255`) and the destination-clock conversion for the first post-flight day (`solver.ts:123-126`). The replay side of that decision also landed (`replay.ts:172`, `replay-plan.ts:25`). Nothing left unless 1.2's sentinel tests contradict it. |
| 1.2 | A | **Merges first, alone** — the live bug (Why #1). `buildDailyNudgesForDay`: delete the `wake − 65 × (i+1)` synthesis (`nudges.ts:193`). With no `plan`, emit only steps that don't need invented times (none, or a single "not placed yet" sentinel — Dev 2 renders it). With a plan: run = paired with the light block (same window) or the first slot ≥ floor with no blocking event; calendar suggestion only moves a `movable` event into a slot ≥ floor that overlaps no fixed event, else no calendar step. Populate `endMin` on every step. The `adherence` param exists but is never destructured (`nudges.ts:185`) — this task makes it operative. For slot placement **reuse the solver's overlap/floor helpers**; a second placement implementation in this function is the divergence bug waiting to happen. |
| 1.3 | A | ✅ Landed (`48223a0`) — `today.ts` bodies, `shiftLockedPct` taking `Math.abs` on both sides (see Why #4). |
| 1.4 | A | Mostly landed (`48223a0`): every non-null `previewPlan` day passes `evaluatePlan`; no preview step overlaps a fixed event on its day; all `pickNextStep` cases (before all, mid-window, after a window, crossing midnight, all done, `nowMin = null`); `shiftLockedPct > 0` eastbound, 0 with none locked, capped at 100; `todayDayIndex` null when no trip day is today. **Remaining:** light starts ≥ floor whenever the floor is inside the solver's light-start candidates; a 1.2-floor test — an eastbound no-plan day with floor 07:00 emits no step starting before 07:00 when a legal later slot exists (this fails until 1.2 makes `adherence` operative, which is the point); and the `previewPlan` budget test from Acceptance. |
| 1.5 | C | ✅ Landed (`48223a0`) — `getFlightRecommendations` → new shape; `bestFor` lines, no percentages. |
| 1.6 | C | Copy sweep of all strings in `nudges.ts` per the vocabulary rule (mechanism wording moves into `whyItHelps` only, plainly phrased). Drop unsupported precision ("~65–90 min", "~1.4x", "10x"). |
| 1.7 | C | `icp.md`: the demo trip is an **8h eastward advance** on 18 Oct (London still on BST; Tokyo +9), not "+9h" — the code's DST-aware `timezones.ts` already computes −8h in the east-negative convention, so keep the doc in human words. |

### Dev 2 — Today surface

**Owns:** `src/components/NudgeFeedScreen.tsx` (+ any components split out of
it).

| # | Phase | Task |
|---|---|---|
| 2.1 | A | New prop `adherence: AdherenceProfile` (frozen in PR 0). When a day has no locked/draft plan, use `previewPlan(...)` (memoised on trip/calendar/adherence/baseline) as `plan`; render the "not placed yet — personalise" state for null days. |
| 2.2 | A | Hero via `pickNextStep` with `nowMinOnDay(trip, dayIndex, new Date())` when `todayDayIndex === dayIndex`, else null. Missed steps collapse into a "Missed (n)" row. One completion button ("Done"), not two. Kill the UTC `toISOString` date check (`NudgeFeedScreen.tsx:224`). |
| 2.3 | A | Progress: remove the 6% floor (`NudgeFeedScreen.tsx:239`); one string everywhere — "N of M done today". Readiness uses `shiftLockedPct`; show "of shift locked" only when > 0, otherwise just the done count. |
| 2.4 | A | Hide "Add .ics" unless a real `ics` prop exists (delete the empty-calendar fallback). |
| 2.5 | B | Timeline is the only view: delete `GuideViewMode` focus/cards, the default-view star and localStorage, and the category filter row. Each timeline row: time (with city) — title — Done — expandable "Why & details" (keeps the evidence chips and `expandAllWhy`). |
| 2.6 | B | Remove the route/flight summary block from the feed (Dev 3's trip-summary chip replaces it); drop the `chosenFlightId` dependency. Keep the "Personalise with the crew" CTA, renamed per vocabulary. |
| 2.7 | C | Times labelled via `dayPlace` ("04:50 London"); flight-day chip shows its date ("✈️ Sun 18 Oct"). |
| 2.8 | C | Decorative images `alt=""` (Runner/Espresso/Evening linen/Sunlight on Face); copy sweep of every string in the file per the vocabulary rule. |

### Dev 3 — Shell, setup & data

**Owns:** `src/app/page.tsx`, `src/components/TripSetupScreen.tsx`,
`src/components/TripPassport.tsx`, `src/components/RoutePicker.tsx`,
`src/app/api/trip/route.ts`, `src/app/crew/page.tsx` (date default only),
`README.md`, final `globals.css` cleanup.

| # | Phase | Task |
|---|---|---|
| 3.1 | A | `/api/trip` returns `baselineSource: "fixture"` (Garmin wiring doesn't exist yet). `page.tsx` stores `adherence` + `baselineSource` in `TripData` and passes `adherence` to `NudgeFeedScreen`. |
| 3.2 | A | `TripSetupScreen`: delete invented fallbacks (HRV 62, RHR 52, `|| 3`, `"2/2"`, the duplicate hardcoded flight array) — show "—" when absent. Show a "Demo profile" tag when `baselineSource === "fixture"` / `calendarSource === "fixture"`. |
| 3.3 | B | One flow in `page.tsx`: delete the titlebar, the Guide/Setup pills, `activeScreen`, `goSetup` scrolling and `?screen=setup`. No trip → render setup (route, date, Personalise). Trip → Today. Voice/Muted become one toggle button. Nav: brand · Crew · voice · menu; menu items renamed per vocabulary. |
| 3.4 | B | New compact `TripSummary` chip above Today ("LHR → HND · Sun 18 Oct · 8h east · Edit") opening a sheet whose body is the refactored `TripSetupScreen`: route, date, flight windows, wearable/calendar summary — no section numbers. Delete `TripPassport.tsx` (currently unimported — confirmed by grep on 16 Oct). |
| 3.5 | B | Extract the deep-dive visuals (globe, swimlane, week) out of `TripSetupScreen` into `DeepDiveVisuals`; `page.tsx` renders it only when `depth === "guided"`. |
| 3.6 | B | "Morning Check-in" only renders when `phase === "done"` (pre-run it was a second Start button). |
| 3.7 | B | Default departure = client-local today + 3 in `page.tsx` (`page.tsx:57`) **and `src/app/crew/page.tsx:52`** — after 18 Oct a `/crew` visit would otherwise default to a past trip. `api/crew/run/route.ts:19` reads the query param and needs no change. Fixtures in `src/domain/fixtures.ts` + `src/state/fixture-events.json` stay frozen (test/replay inputs). URL `?date=` still wins. **Verify** `bun run replay:check`, `bun run eval` (`scripts/eval.ts:29-31` hardcodes `2026-10-18` in all three scenarios) and a replay-provider run still work for a non-`DEMO_DEPARTURE` date before merging; report if replay is pinned to the fixture date. (Replay's floor policy already landed — `replay.ts:172`, `replay-plan.ts:25` thread `adherence` — so a `replay:check` failure after your change is a new regression, not the old script.) |
| 3.8 | C | Flight-window cards render `badge` + `bestFor` + times only. |
| 3.9 | C | Copy sweep of `page.tsx`, `TripSetupScreen`, menu, `RoutePicker`; remove orphan labels ("8 flexible", "biologically ready" → "3 movable events", "Pitch: ready"). |
| 3.10 | C | Remove obsolete CSS (`.titlebar`, `.pill`, view-mode/filter styles) after lanes 1–2 merge; add this doc to README "Active". |

## Sequencing

Task 1.2 merges **alone and first** — it is the only still-open user-visible
correctness bug and the one the whole "honest claims" thesis rests on.

```
Day 0   PR 0 finish (props-type export, CSS lane blocks) — the domain
        half is already in `48223a0` — then merge `overhaul/dev1-contract`
        → `main`; lanes branch from `main`                      ← all three lanes
        │
        ├─► 1.2 (kill the 65-min synthesis) ── live bug, merges alone
        │   1.4 remainder · 3.1 · 3.2
        │   (previewPlan, today.ts, solver cap, flight shape are on `main`)
        │
        └─► Day 1: 2.1–2.4 Dev 2 · 3.3–3.7 Dev 3 · 1.6–1.7 Dev 1
Final   Dev 3: CSS cleanup + integration QA pass + re-check the stage path
        in `docs/reference/demo.md` (the pre-run preview changes shape).
```

**Merge all A by 17 Oct EOD — demo-safe checkpoint.** If 17 Oct slips, the
demo-safe subset is **1.2 + 2.2 + 2.3 + 3.1**: no fabricated times, a correct
next step, one honest progress number, provenance tagged. Everything else is
cosmetic and can move past 18 Oct.

3.8's dependency is gone — 1.5's type change is already merged; Dev 1's C
work is 1.6–1.7 only.

## Verification (every PR)

```bash
bun run typecheck && bun run lint && bun test
# or inside the base44 stack:
docker compose -f docker-compose.base44.yml exec -T web bun test
docker compose -f docker-compose.base44.yml exec -T web bun run typecheck
```

Lane 3 additionally: `bun run replay:check`, `bun run eval`, and
`curl -fsS localhost:3000/` + `/api/trip`.

## Acceptance — the integrated `/` (final QA, Dev 3)

- [ ] Fresh visit, replay provider, no keys: a populated Today in < 10 s for a trip starting today.
- [ ] `previewPlan` over the demo trip < 50 ms client-side (asserted in a 1.4 test); the feed's memo recomputes only when trip/calendar/adherence/baseline change — no re-solve on unrelated state.
- [ ] No preview step before 07:00 London when a later legal slot exists; no step overlaps a fixed calendar event; every preview day passes the gate.
- [ ] "Your next step" is never a passed window; passed ones sit under "Missed".
- [ ] One progress number; no 6%; eastbound readiness shows "of shift locked" after a run.
- [ ] No invented values anywhere — assert on rendered values, not source shape (see the grep note below); demo data is tagged "Demo profile".
- [ ] No ".ics" button without a real plan.
- [ ] No "Trip & Flight Setup" title, no section numbers, no Guide/Setup pills; setup lives in the trip-summary sheet.
- [ ] Flight windows show Best / Workable / Hardest, no percentages.
- [ ] Every time is labelled with its city; the flight day shows a date.
- [ ] Screen reader pass: no "Evening linen"-style alt text; DOM order = visual order.
- [ ] `/crew` and `?depth=guided` still work (evidence drawers open, deep-dive visuals visible).
- [ ] `page.tsx:646` is the only `NudgeFeedScreen` caller and typechecks against the PR 0 props type.

**Grep note.** The obvious single-line greps silently pass — `Math.max(6` is
split across lines, as are several of the others. Assert on rendered values, not
source shape:

```bash
grep -rn "Math.max($" -A2 src/ | grep -w 6          # the 6% progress floor
grep -rnE '"2/2"|\|\| 3' src/components src/domain # setup fallbacks
```

Plus a UI assertion: a fresh `/` renders "—" (not a number) for any
fixture-absent field.

## Out of scope

Phone check-in card (consumer-appeal #8), real flight data, real Garmin
wiring, video shot-list update (do after this lands — the layout it films
changes).