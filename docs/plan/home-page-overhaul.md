# Home page overhaul — accuracy, one flow, honest claims

2026-10-16. Derived from a critical review of `/` against
[next-steps.md](next-steps.md), [consolidation.md](consolidation.md),
[consumer-appeal-implementation.md](consumer-appeal-implementation.md) and
[icp.md](icp.md). All three phases run now, in parallel, across three
developers. **Phase A items merge first (target: 17 Oct EOD, ahead of the
18 Oct Graph Hacks deadline)**; B and C follow in the same lanes.

## Why

`/` is supposed to be the Calm rung: *"tell me your trip; I tell you the one
thing to do now so you land fresh"* — with the scorer authoritative and no
fabricated evidence. Today it breaks that in five ways (all verified in code):

1. **The pre-run preview bypasses the solver and the scorer.**
   `buildDailyNudgesForDay` synthesises times as `wake − 65 min × (dayIndex+1)`
   when there is no plan, so Alex (compliance floor 07:00) is told to get light
   at 04:50 and run at 05:20, and is offered "Move standup 09:30 → 07:35" —
   straight into the fixed *Team breakfast* 07:30–08:30 on the same day.
2. **Fabricated numbers.** `progressPct` floors at 6% ("6% done" beside "0 of
   5"); `TripSetupScreen` falls back to invented HRV/RHR/`|| 3`/`"2/2"`; "Add
   .ics" downloads an empty calendar pre-run; fixture Garmin data is never
   labelled as demo; flight windows are hardcoded percentages for every route.
3. **"Your next move" is wrong.** The hero picks the first incomplete nudge by
   *category* order, not by time, and "today" compares against the UTC date.
   Result: the hero shows a window that has already passed.
4. **Readiness never works eastbound.** `shiftPct` divides a negative locked
   shift by `|requiredShiftMin|` → negative → "of shift locked" never shows.
5. **Two screens stacked, not one flow.** The page title is the Setup heading,
   setup sections render 2 → 1 → 3 → 4, "Morning Check-in" pre-run just starts
   a run, and the hardcoded 2026-10-18 default means any visitor after that
   date gets no "today" at all.

## Decisions (settled — don't re-litigate in PRs)

| Topic | Decision |
|---|---|
| Preview source | **Solver + scorer.** `previewPlan` runs `solveDay` over the trip, locking each day. A day the solver can't place shows "not placed yet — personalise", never invented times. |
| Compliance floor | It's a soft penalty in the scorer, and an 8h advance pushes *wake* before 07:00 regardless. Rule: no **ask** (light, run, calendar move) lands before `adherence.ignoresInterventionsBeforeMin` when a legal slot at/after it exists. Sleep window is exempt. |
| Flight windows | **Qualitative only:** `Best` / `Workable` / `Hardest` + a one-line "best for". No percentages, no "Zero Jet Lag", no flight numbers. |
| Layout | **Full one-flow.** No trip → setup state. Trip set → **Today** (next step → timeline → readiness). Setup becomes a trip-summary chip + edit sheet. Guide/Setup pills and the "Trip & Flight Setup" title are removed; "Crew" stays as the depth link. |
| Views | Timeline is the only Calm view. Focus/Cards modes, the default-view star and category filters are removed. Deep-dive visuals (globe, swimlane, week) render only at `?depth=guided`. |
| Default trip date | Consumer default departure = **today + 3** (client local date) so D-3 is today. Fixtures (`DEMO_DEPARTURE`, `DEMO_TRIP`) stay fixed for tests/replay. |
| Vocabulary | "Today", "step" (not nudge/move/card), "Your next step", "Personalise" (British — the app is London-first), "Crew". No "circadian", "phase-advance", "melanopsin", "zeitgeber", "scorer" on Calm; those live in the Why drawer / `/crew`. |
| Times | Every time is labelled with the city it's local to ("04:50 London"). |

## Shared contract — PR 0 (Dev 1, merge first, same day)

Types and signatures only, with stub/minimal bodies that compile, so Dev 2
and Dev 3 build against them immediately. Bodies + tests land in Dev 1's A
PRs.

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
flight day → origin. **Dev 1 verifies** this matches how the solver, scorer
and `readiness.ts` interpret flight-day minutes before merging; if it
doesn't, flag it in the PR rather than picking silently.

## Lanes

File ownership is exclusive — if you need a change in another lane's file,
ask its owner. `globals.css` is shared: append new classes inside a
`/* ── lane: <name> ── */` block; only Dev 3 deletes obsolete classes, at the
end.

### Dev 1 — Engine (domain + tests)

**Owns:** `src/domain/solver.ts`, `src/domain/nudges.ts`, `src/domain/today.ts`
(new), `tests/*` for those, `docs/plan/icp.md`.

| # | Phase | Task |
|---|---|---|
| 1.0 | A | **PR 0** — the shared contract above. |
| 1.1 | A | `previewPlan` body: loop `trip.days`, `solveDay({ trip, spec, lockedDays, calendar, adherence, baseline })`, push each solved plan into `lockedDays`; null days don't advance the chain. |
| 1.2 | A | `buildDailyNudgesForDay`: delete the `wake − 65 × (i+1)` synthesis. With no `plan`, emit only steps that don't need invented times (none, or a single "not placed yet" sentinel — Dev 2 renders it). With a plan: run = paired with the light block (same window) or the first slot ≥ floor with no blocking event; calendar suggestion only moves a `movable` event into a slot ≥ floor that overlaps no fixed event, else no calendar step. Populate `endMin` on every step. |
| 1.3 | A | `today.ts` bodies (`dayPlace`, `todayDayIndex`, `nowMinOnDay`, `pickNextStep`, `shiftLockedPct` using `Math.abs` on both sides). |
| 1.4 | A | Tests: every non-null `previewPlan` day passes `evaluatePlan`; no preview step overlaps a fixed event on its day; light starts ≥ floor whenever the floor is inside the solver's light-start candidates; `shiftLockedPct > 0` for an eastbound trip with locked days; `pickNextStep` cases — before all, mid-window, after a window (missed), crossing midnight, all done, `nowMin = null`; `todayDayIndex` returns null for a past trip. |
| 1.5 | C | `getFlightRecommendations` → new shape; `bestFor` lines from existing headlines, no percentages. |
| 1.6 | C | Copy sweep of all strings in `nudges.ts` per the vocabulary rule (mechanism wording moves into `whyItHelps` only, plainly phrased). Drop unsupported precision ("~65–90 min", "~1.4x", "10x"). |
| 1.7 | C | `icp.md`: demo trip is −8h on 18 Oct (London on BST), not +9h. |

### Dev 2 — Today surface

**Owns:** `src/components/NudgeFeedScreen.tsx` (+ any components split out of
it).

| # | Phase | Task |
|---|---|---|
| 2.1 | A | New prop `adherence: AdherenceProfile`. When a day has no locked/draft plan, use `previewPlan(...)` (memoised on trip/calendar/adherence/baseline) as `plan`; render the "not placed yet — personalise" state for null days. |
| 2.2 | A | Hero via `pickNextStep` with `nowMinOnDay(trip, dayIndex, new Date())` when `todayDayIndex === dayIndex`, else null. Missed steps collapse into a "Missed (n)" row. One completion button ("Done"), not two. Kill the UTC `toISOString` date check. |
| 2.3 | A | Progress: remove the 6% floor; one string everywhere — "N of M done today". Readiness uses `shiftLockedPct`; show "of shift locked" only when > 0, otherwise just the done count. |
| 2.4 | A | Hide "Add .ics" unless a real `ics` prop exists (delete the empty-calendar fallback). |
| 2.5 | B | Timeline is the only view: delete `GuideViewMode` focus/cards, the default-view star and localStorage, and the category filter row. Each timeline row: time (with city) — title — Done — expandable "Why & details" (keeps the evidence chips and `expandAllWhy`). |
| 2.6 | B | Remove the route/flight summary block from the feed (Dev 3's trip-summary chip replaces it); drop the `chosenFlight` dependency. Keep the "Personalise with the crew" CTA, renamed per vocabulary. |
| 2.7 | C | Times labelled via `dayPlace` ("04:50 London"); flight-day chip shows its date ("✈️ Sun 18 Oct"). |
| 2.8 | C | Decorative images `alt=""` (Runner/Espresso/Evening linen/Sunlight on Face); copy sweep of every string in the file per the vocabulary rule. |

### Dev 3 — Shell, setup & data

**Owns:** `src/app/page.tsx`, `src/components/TripSetupScreen.tsx`,
`src/components/TripPassport.tsx`, `src/components/RoutePicker.tsx`,
`src/app/api/trip/route.ts`, `README.md`, final `globals.css` cleanup.

| # | Phase | Task |
|---|---|---|
| 3.1 | A | `/api/trip` returns `baselineSource: "fixture"` (Garmin wiring doesn't exist yet). `page.tsx` stores `adherence` + `baselineSource` in `TripData` and passes `adherence` to `NudgeFeedScreen`. |
| 3.2 | A | `TripSetupScreen`: delete invented fallbacks (HRV 62, RHR 52, `\|\| 3`, `"2/2"`, the duplicate hardcoded flight array) — show "—" when absent. Show a "Demo profile" tag when `baselineSource === "fixture"` / `calendarSource === "fixture"`. |
| 3.3 | B | One flow in `page.tsx`: delete the titlebar, the Guide/Setup pills, `activeScreen`, `goSetup` scrolling and `?screen=setup`. No trip → render setup (route, date, Personalise). Trip → Today. Voice/Muted become one toggle button. Nav: brand · Crew · voice · menu; menu items renamed per vocabulary. |
| 3.4 | B | New compact `TripSummary` chip above Today ("LHR → HND · Sun 18 Oct · 8h east · Edit") opening a sheet whose body is the refactored `TripSetupScreen`: route, date, flight windows, wearable/calendar summary — no section numbers. Delete `TripPassport.tsx` (currently unimported — confirm with a grep before deleting). |
| 3.5 | B | Extract the deep-dive visuals (globe, swimlane, week) out of `TripSetupScreen` into `DeepDiveVisuals`; `page.tsx` renders it only when `depth === "guided"`. |
| 3.6 | B | "Morning Check-in" only renders when `phase === "done"` (pre-run it was a second Start button). |
| 3.7 | B | Default departure = client-local today + 3 in `page.tsx` (URL `?date=` still wins). **Verify** `bun run replay:check` and a replay-provider run still work for a non-`DEMO_DEPARTURE` date before merging; report if replay is pinned to the fixture date. |
| 3.8 | C | Flight-window cards render `badge` + `bestFor` + times only. |
| 3.9 | C | Copy sweep of `page.tsx`, `TripSetupScreen`, menu, `RoutePicker`; remove orphan labels ("8 flexible", "biologically ready" → "3 movable events", "Pitch: ready"). |
| 3.10 | C | Remove obsolete CSS (`.titlebar`, `.pill`, view-mode/filter styles) after lanes 1–2 merge; add this doc to README "Active". |

## Sequencing

```
Day 0   Dev1: PR 0 (contract)  ─┐
                               ├─► Dev1 A (1.1–1.4)   Dev2 A (2.1–2.4)   Dev3 A (3.1–3.2)
                               │     merge all A by 17 Oct EOD — demo-safe checkpoint
                               └─► Dev1 C (1.5–1.7)   Dev2 B→C           Dev3 B→C
Final   Dev3: CSS cleanup + integration QA pass
```

Dev 2 can stub `previewPlan` returning an empty map until 1.1 lands; Dev 3's
3.8 depends on 1.5's type change — land 1.5 early in Dev 1's C work.

## Verification (every PR)

```bash
bun run typecheck && bun run lint && bun test
# or inside the base44 stack:
docker compose -f docker-compose.base44.yml exec -T web bun test
docker compose -f docker-compose.base44.yml exec -T web bun run typecheck
```

Lane 3 additionally: `bun run replay:check`, and `curl -fsS localhost:3000/`
+ `/api/trip`.

## Acceptance — the integrated `/` (final QA, Dev 3)

- [ ] Fresh visit, replay provider, no keys: a populated Today in < 10 s for a trip starting today.
- [ ] No preview step before 07:00 London when a later legal slot exists; no step overlaps a fixed calendar event; every preview day passes the gate.
- [ ] "Your next step" is never a passed window; passed ones sit under "Missed".
- [ ] One progress number; no 6%; eastbound readiness shows "of shift locked" after a run.
- [ ] No invented values anywhere (grep for `62 ms`, `52 bpm`, `"2/2"`, `|| 3`, `Math.max(6`); demo data is tagged "Demo profile".
- [ ] No ".ics" button without a real plan.
- [ ] No "Trip & Flight Setup" title, no section numbers, no Guide/Setup pills; setup lives in the trip-summary sheet.
- [ ] Flight windows show Best / Workable / Hardest, no percentages.
- [ ] Every time is labelled with its city; the flight day shows a date.
- [ ] Screen reader pass: no "Evening linen"-style alt text; DOM order = visual order.
- [ ] `/crew` and `?depth=guided` still work (evidence drawers open, deep-dive visuals visible).

## Out of scope

Phone check-in card (consumer-appeal #8), real flight data, real Garmin
wiring, video shot-list update (do after this lands — the layout it films
changes).
