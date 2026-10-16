# Home page overhaul — accuracy, one flow, honest claims

2026-10-16, updated same day after PR 0 merged, then again by lane 2 alongside
PR #2 so the status notes and `file:line` citations match the code on
`overhaul/main`. Derived from a critical
review of `/` against
[next-steps.md](next-steps.md), [consolidation.md](consolidation.md),
[consumer-appeal-implementation.md](consumer-appeal-implementation.md) and
[icp.md](icp.md). All three phases run now, in parallel, across three
developers. **Phase A items merge first (target: 17 Oct EOD, ahead of the
18 Oct Graph Hacks deadline)**; B and C follow in the same lanes.

**Branch state (updated 16 Oct, after lane 2's Phase A opened):** `overhaul/main`
is the integration branch — every lane PRs into it, and merging it into `main`
is the deploy step (Render auto-deploys `main`), which stays the orchestrator's
call. Dev 1's Phase A is **fully landed** there: `48223a0` (contract) →
`4a12fa9` → `4532c60` (1.2) → `775eb1f` → `4cbe946` (1.7) → `96fe3b1`.
`buildDailyNudgesForDay`'s `adherence` param is now **operative**
(`nudges.ts:195,206` — floor, `eventClash`, `freeSlot`), with floor tests
(`tests/nudges.test.ts:50`, `tests/solver.test.ts:208-219`). Lane 2's 2.1–2.4
are pushed as **PR #2** (`overhaul/dev2-today` @ `5f3cc83`).
**Still not landed from PR 0:** the CSS lane blocks — `globals.css` on
`overhaul/main` carries no `/* ── lane: … ── */` marker at all, so the sanctioned
append site never arrived. Lane 3 has already appended its own
`lane: shell` block on `overhaul/dev3-shell` (`eac1a23`), which means Dev 1 owes
the `engine` and `today` blocks *above* lane 3's, and 3.10's cleanup now has to
reconcile two histories. The props-type half of PR 0 landed *inside* PR #2
instead of as its own contract commit, with one deviation — recorded under
"The React prop contract" below. That export also unblocks the second half of
3.1 (`eac1a23` records it as blocked on task 2.1): `page.tsx` can now pass
`adherence`, and because the prop is optional it can do so before or after
PR #2 merges without breaking typecheck either way.

## Why

`/` is supposed to be the Calm rung: *"tell me your trip; I tell you the one
thing to do now so you land fresh"* — with the scorer authoritative and no
fabricated evidence. It broke that in five ways (all verified in code).
**1–4 are closed; 5 is open.**

**Every claim below cites `file:line`.** If an implementation contradicts one,
the *code* wins — update this doc in the same PR rather than picking silently.
Citations are against `overhaul/main`; re-derive them after a lane merges,
because these lines move — several already have.

1. **The pre-run preview bypassed the solver and the scorer.** ✅ Closed by
   `4532c60`. The `stepMin = (east ? -65 : 65) * (dayIndex + 1)` synthesis is
   gone; `buildDailyNudgesForDay` returns `[]` with no plan (`nudges.ts:199`)
   and places every ask at/after the compliance floor through the solver's own
   helpers (`nudges.ts:206-221`). Alex is no longer told to get light at 04:50
   or offered "Move standup 09:30 → 07:35" into the fixed *Team breakfast*.
2. **Fabricated numbers.** Feed side ✅ closed by `5f3cc83` (PR #2): the
   `Math.max(6, …)` progress floor, `downloadIcs`'s empty-calendar fallback, the
   hardcoded route / flight-window / time preview strings, the hardcoded
   five-day selector array and a fake "% body-clock shift aligned" stepper label
   are deleted, and a day the solver can't place renders "not placed yet —
   personalise". `FlightOptionRecommendation`'s percentages went with `48223a0`.
   **Still open (3.2):** `TripSetupScreen.tsx:98` (`|| 3`), `:101` (`"2/2"`),
   `:231` (`62 ms`), `:235` (`52 bpm`), the duplicate hardcoded flight array,
   and the missing "Demo profile" tag.
3. **"Your next move" was wrong.** ✅ Closed by `5f3cc83`. The hero comes from
   `pickNextStep(nudges, completed, nowMinOnDay(...))`, gated on
   `todayDayIndex(...) === dayIndex` (else `null`); the UTC
   `toISOString().slice(0, 10)` comparison and the category-order pick are gone,
   and passed windows collapse into a "Missed (n)" row.
4. **Readiness never worked eastbound.** ✅ Closed by `5f3cc83`. The feed calls
   `today.ts:shiftLockedPct` (`Math.abs` on both sides) instead of summing raw
   `shiftMin` into a negative numerator, and shows "% of shift locked" only when
   that value is > 0.
5. **Two screens stacked, not one flow.** The page title is the Setup heading,
   setup sections render 2 → 1 → 3 → 4, "Morning Check-in" pre-run just starts
   a run, and the hardcoded default `2026-10-18` (was `page.tsx:57`; also
   `api/trip/route.ts:16`, `crew/page.tsx:52`, `api/crew/run/route.ts:19`) means
   any visitor after that date gets no "today" at all.
   *(Items 3–5 are now fixed by lane 3 — `0d6d1f4`, `f744b66`, `3aecb12`. The
   citations are kept pointing at the pre-fix locations so the claim stays
   auditable; the date sites are now `defaultDepartureDate()`.)*

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

One branch per lane — **never a shared working tree** (lanes 1 and 3 both had
uncommitted work in one tree on 16 Oct, which is how the merge-conflict risk
this plan exists to avoid gets created). Lane 2 worked in its own
`git worktree` for exactly this reason.

The integration branch is **`overhaul/main`**, not `main`: lanes branch from it
and open PRs back into it. `main` stays untouched until Phase A is integrated
and checked locally, because Render auto-deploys `main` — that merge is the
orchestrator's call, not a lane's.

```
overhaul/dev1-engine   Dev 1   overhaul/dev2-today   Dev 2   overhaul/dev3-shell   Dev 3
```

PR 0 was the only PR that landed before the others started (as
`overhaul/dev1-contract` → `48223a0`). Each subsequent PR must name the contract
items it consumes; a lane must not implement against a contract item that isn't
on `overhaul/main` — if it's urgent, land the contract stubs as their own commit
first. Current state: Dev 1's Phase A is on `overhaul/main` through `96fe3b1`;
Dev 2's is open as PR #2 (`5f3cc83`); Dev 3's Phase A is still only in a local
branch.

Merge order within a phase: **lane 1 → lane 3 → lane 2.** Lane 3 rewrites
`page.tsx`, which is lane 2's only call site (re-grep `<NudgeFeedScreen` —
lane 3 keeps moving the line number); lane 2 rebases last.

The contract currently sits on `overhaul/dev1-contract`, **not on `main`** —
add the remaining CSS lane blocks there and merge it to `main` before any lane
branches, or the "don't implement against a contract that isn't on `main`" rule
forces everyone to branch off the feature branch anyway. Lanes 1 and 3 have in
practice branched off `overhaul/main`, which carries the same commit.

## Shared contract — PR 0 (Dev 1, merge first, same day)

Types and signatures only, with stub/minimal bodies that compile, so Dev 2
and Dev 3 build against them immediately. Bodies + tests land in Dev 1's A
PRs.

**Status:** domain half ✅ merged (`48223a0`, bodies + tests, `adherence` made
operative by `4532c60`). Props half ✅ merged inside PR #2 (`5f3cc83`) — see the
deviation below. **Outstanding for PR 0: only the CSS lane blocks** —
`lane: shell` exists (lane 3, `0d6d1f4`); `lane: engine` and `lane: today`
still need creating.

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

### The React prop contract (Dev 2, first commit in their lane)

Domain types alone don't cover the plan's largest conflict: `page.tsx` is
`NudgeFeedScreen`'s **only** caller, `page.tsx` is exclusively Dev 3's, and
task 2.x changes three of that component's props.

This lives in **Dev 2's** file, so it cannot be part of Dev 1's PR 0 — it is
Dev 2's first commit, and Dev 3 lands the matching call-site change after it:

```ts
// src/components/NudgeFeedScreen.tsx — export the props type (landed: it is
// exported at :30 as of `5f3cc83`; it was unexported at line 22 when this was
// written) with exactly these deltas:
export interface NudgeFeedScreenProps {
  // …existing props…
  + adherence: AdherenceProfile;      // task 2.1
  - chosenFlightId: string;           // task 2.6 (dropped)
  ? ics?: string;                     // task 2.4 — rendered only when present
}
```

Dev 3 already holds `adherence` + `baselineSource` in `TripData` (task 3.1)
and is blocked only on passing `adherence` down — see the commit message on
`eac1a23`. Merge order stays lane 1 → lane 3 → lane 2, so Dev 3's call-site
change rebases onto Dev 2's export.

**Status:** landed in PR #2 (`5f3cc83`), with one deliberate deviation.
`NudgeFeedScreenProps` is now exported (`NudgeFeedScreen.tsx:30`) and `ics?`
arrived as specified. **`adherence` shipped *optional* (`adherence?:
AdherenceProfile`, `:54`), not required.** Reason: the only call site
(`page.tsx:646`) is lane 3's file and 3.1 is not on `overhaul/main`, so a
required prop would leave every lane failing `bun run typecheck` until 3.1
merged — the deadlock PR 0 exists to prevent. Until then the feed falls back to
`ADHERENCE_PROFILE` (`:105`), so the preview still respects a floor rather than
silently using none. **Amendment to ratify when 3.1 merges:** drop the fallback
and tighten to `adherence: AdherenceProfile` in lane 2's Phase B PR. Separately,
the contract's `- chosenFlightId` line names a prop that never existed — the
real one is `selectedFlightId: string`, still required and still read by the
route/flight summary block, because removing it is 2.6 (Phase B). The `-`
half of this contract is therefore deferred, not violated.
>>>>>>> origin/overhaul/dev2-today

## Lanes

File ownership is exclusive — if you need a change in another lane's file,
ask its owner. `globals.css` is shared: each lane appends its own
`/* ── lane: <name> ── */` block at EOF (`lane: shell` exists as of the
3.3–3.5 commit; `lane: engine` and `lane: today` still need creating) and adds
classes only inside its own block. Only Dev 3 deletes obsolete classes, at the
end.

### Dev 1 — Engine (domain + tests)

**Owns:** `src/domain/solver.ts`, `src/domain/nudges.ts`, `src/domain/today.ts`
(landed in `48223a0`), `tests/*` for those, `docs/plan/icp.md`.

| # | Phase | Task |
|---|---|---|
| 1.0 | A | **PR 0** — the domain contract above, plus the `lane: engine` CSS block. **⚠ partially landed (`48223a0`)**: domain shapes + tests are in. Remaining: `lane: engine` (and `lane: today`, Dev 2's) CSS blocks. The props-type export is Dev 2's — see below. |
| 1.1 | A | ✅ Landed (`48223a0`) — `previewPlan` body as specified, **plus** the eastbound shift cap from the Decisions table (`LIGHT_START_MAX_OFFSET_MIN`, `solver.ts:55,238-255`) and the destination-clock conversion for the first post-flight day (`solver.ts:123-126`). The replay side of that decision also landed (`replay.ts:172`, `replay-plan.ts:25`). Nothing left unless 1.2's sentinel tests contradict it. |
| 1.2 | A | ✅ Landed (`4532c60`) — the live bug (Why #1) is closed. Synthesis deleted, `[]` with no plan (`nudges.ts:199`), `adherence` destructured and operative (`nudges.ts:195,206`), run/calendar asks placed through floor-aware helpers that reuse the solver's overlap logic (`nudges.ts:211-221`) rather than a second placement implementation, `endMin` populated on every step. Dev 2 renders the empty return as "not placed yet — personalise" (`5f3cc83`). |
| 1.3 | A | ✅ Landed (`48223a0`) — `today.ts` bodies, `shiftLockedPct` taking `Math.abs` on both sides (see Why #4). |
| 1.4 | A | Mostly landed. `48223a0`: every non-null `previewPlan` day passes `evaluatePlan`; no preview step overlaps a fixed event on its day; all `pickNextStep` cases (before all, mid-window, after a window, crossing midnight, all done, `nowMin = null`); `shiftLockedPct > 0` eastbound, 0 with none locked, capped at 100; `todayDayIndex` null when no trip day is today. `4532c60` added the floor half: `tests/nudges.test.ts:50` (every non-sleep step starts ≥ 07:00) and `tests/solver.test.ts:208-219` (east wake never before floor − 105 unless holding; light starts ≥ floor unless every ≥floor slot is blocked). **Remaining:** the `previewPlan` budget test from Acceptance (< 50 ms over the demo trip) — nothing in `tests/` asserts it yet. |
| 1.5 | C | ✅ Landed (`48223a0`) — `getFlightRecommendations` → new shape; `bestFor` lines, no percentages. |
| 1.6 | C | Copy sweep of all strings in `nudges.ts` per the vocabulary rule (mechanism wording moves into `whyItHelps` only, plainly phrased). Drop unsupported precision ("~65–90 min", "~1.4x", "10x"). |
| 1.7 | C | `icp.md`: the demo trip is an **8h eastward advance** on 18 Oct (London still on BST; Tokyo +9), not "+9h" — the code's DST-aware `timezones.ts` already computes −8h in the east-negative convention, so keep the doc in human words. |

### Dev 2 — Today surface

**Owns:** `src/components/NudgeFeedScreen.tsx` (+ any components split out of
it).

| # | Phase | Task |
|---|---|---|
| 2.1 | A | ✅ Landed (`5f3cc83`). `adherence` prop added — optional with an `ADHERENCE_PROFILE` fallback (deviation explained under the props contract). `previewPlan(...)` memoised on `[trip, calendarEvents, effectiveAdherence, baseline]`; the day's plan resolves `locked → drafts → preview`, and a null/absent entry renders "Not placed yet — personalise" (`NudgeFeedScreen.tsx:414`, `:798`) instead of invented times. |
| 2.2 | A | ✅ Landed (`5f3cc83`). Hero = `pickNextStep(allDayNudges, completedIds, nowMin)` with `nowMin = nowMinOnDay(...)` only when `todayDayIndex(...) === dayIndex`, else `null`. Missed steps collapse behind a "Missed (n)" toggle with `aria-expanded` (`:458-469`) and their own Done buttons; one "Done" button in the hero (`:451`), the duplicate "Mark Nudge Done" primary is gone; the UTC `toISOString` date check is deleted. Countdown derives from the wrap-aware `endMin`. |
| 2.3 | A | ✅ Landed (`5f3cc83`). `Math.max(6, …)` deleted; the meter and the stat both read "N of M done today". Readiness calls `shiftLockedPct` and shows "% of shift locked" only above 0, otherwise the done count — no silent fallback label. |
| 2.4 | A | ✅ Landed (`5f3cc83`). "Add .ics" renders only when `ics` is present; `downloadIcs` returns early without it and the empty-calendar fallback is deleted. |
| 2.5 | B | Timeline is the only view: delete `GuideViewMode` focus/cards, the default-view star and localStorage, and the category filter row. Each timeline row: time (with city) — title — Done — expandable "Why & details" (keeps the evidence chips and `expandAllWhy`). |
| 2.6 | B | Remove the route/flight summary block from the feed (Dev 3's trip-summary chip replaces it); drop the `chosenFlightId` dependency. Keep the "Personalise with the crew" CTA, renamed per vocabulary. |
| 2.7 | C | Times labelled via `dayPlace` ("04:50 London"); flight-day chip shows its date ("✈️ Sun 18 Oct"). |
| 2.8 | C | Decorative images `alt=""` (Runner/Espresso/Evening linen/Sunlight on Face); copy sweep of every string in the file per the vocabulary rule. |

### Dev 3 — Shell, setup & data

**Owns:** `src/app/page.tsx`, `src/components/TripSetupScreen.tsx`,
`src/components/RoutePicker.tsx`, `src/components/TripSummary.tsx` (new),
`src/components/DeepDiveVisuals.tsx` (new), `src/app/api/trip/route.ts`,
`src/app/crew/page.tsx` (date default only), `README.md`,
`docs/reference/architecture.md`, final `globals.css` cleanup.
(`TripPassport.tsx` was owned here and is now deleted.)

| # | Phase | Task |
|---|---|---|
| 3.1 | A | ✅ **Landed (`eac1a23`)** — `baselineSource: "fixture"` in `/api/trip`; `TripData` holds `baselineSource` + `adherence`; `baselineSource` threads to `TripSetupScreen`. **Outstanding:** passing `adherence` to `NudgeFeedScreen` — blocked on Dev 2's props export. One line at the call site once it lands. |
| 3.2 | A | ✅ **Landed (`eac1a23`)** — `|| 3`, `"2/2"`, `23:30–06:45`, `62 ms`, `52 bpm` all removed; absent values render "—"; a "Demo profile" tag appears when `baselineSource`/`calendarSource` is `fixture` (`.demo-tag` in the `lane: shell` CSS block). |
| 3.3 | B | One flow in `page.tsx`: delete the titlebar, the Guide/Setup pills, `activeScreen`, `goSetup` scrolling and `?screen=setup`. No trip → render setup (route, date, Personalise). Trip → Today. Voice/Muted become one toggle button. Nav: brand · Crew · voice · menu; menu items renamed per vocabulary. | 🟢 **Landed (`0d6d1f4`)** — titlebar, Guide/Setup pills, `activeScreen`, `?screen=setup` and `goSetup` scrolling all gone; Voice/Muted collapsed to one toggle reading "Voice on"/"Voice off"; nav is brand · Crew · voice · menu; menu items renamed. |
| 3.4 | B | New compact `TripSummary` chip above Today ("LHR → HND · Mon 19 Oct · 8h east · Edit" — the date is today + 3 after 3.7, not the fixture's 18 Oct) opening a sheet whose body is the refactored `TripSetupScreen`: route, date, flight windows, wearable/calendar summary — no section numbers. Delete `TripPassport.tsx` (currently unimported — confirmed by grep on 16 Oct). | 🟢 **Landed (`0d6d1f4`)** — `TripSummary` chip above Today, opening a `role="dialog" aria-modal` sheet carrying the refactored `TripSetupScreen`. `TripPassport.tsx` deleted (grep confirmed zero references). |
| 3.5 | B | Extract the deep-dive visuals (globe, swimlane, week) out of `TripSetupScreen` into `DeepDiveVisuals`; `page.tsx` renders it only when `depth === "guided"`. | 🟢 **Landed (`0d6d1f4`)** — new `DeepDiveVisuals.tsx`; `page.tsx` renders it only at `?depth=guided`. Verified in Chrome: deep-dive tabs absent on Calm, present at guided. |
| 3.6 | B | ✅ **Landed (`f744b66`)** — pre-run "Morning Check-in" was a second button wired to the same `onStart`; it now renders only when `phase === "done"`. |
| 3.7 | B | Default departure = client-local today + 3 in `page.tsx` (was `page.tsx:57`) **and `src/app/crew/page.tsx:52`** — after 18 Oct a `/crew` visit would otherwise default to a past trip. `api/crew/run/route.ts:19` reads the query param and needs no change. Fixtures in `src/domain/fixtures.ts` + `src/state/fixture-events.json` stay frozen (test/replay inputs). URL `?date=` still wins. **Verify** `bun run replay:check`, `bun run eval` (`scripts/eval.ts:29-31` hardcodes `2026-10-18` in all three scenarios) and a replay-provider run still work for a non-`DEMO_DEPARTURE` date before merging; report if replay is pinned to the fixture date. (Replay's floor policy already landed — `replay.ts:172`, `replay-plan.ts:25` thread `adherence` — so a `replay:check` failure after your change is a new regression, not the old script.) | 🟢 **Landed (`f744b66`)** — today+3 local default on `/` and `/crew`, set in the mount effect (no hydration mismatch), fetch guarded on a non-empty date, `?date=` still wins. ⚠ **`bun run eval` hangs by default**: it runs `AGENT_PROVIDER=featherless` and blocks on the provider. Use `AGENT_PROVIDER=replay bun run eval` — then all 3 scenarios pass. Pre-existing, reproduced on the base commit. Worth defaulting eval to replay when no key is present. |
| 3.8 | C | ✅ **Already satisfied** — cards render `badge` + `bestFor` + `departsLocal` → `arrivesDest` only (`TripSetupScreen.tsx`, unchanged by lane 3). |
| 3.9 | C | Copy sweep of `page.tsx`, `TripSetupScreen`, menu, `RoutePicker`; remove orphan labels ("8 flexible", "biologically ready" → "3 movable events", "Pitch: ready"). | 🟢 **Landed (`3aecb12`)** — section numbers dropped, "Circadian guidance" reworded, "Personalize" → "Personalise", "N flexible" → "N movable", "biologically ready" → "meetings ready", menu items renamed; also collapsed a `hasSavedPlan` conditional whose branches were identical. |
| 3.10 | C | 🟡 **Partial (`bb6a2d5`)** — `.titlebar` rules deleted (incl. the responsive override); README "Active" link landed in `6b7989f`. **Kept deliberately:** `.pill` (the nav still uses it for the Crew link) and the view-mode/filter styles (Dev 2 still renders that row until 2.5). Delete those after 2.5 merges. |

## Sequencing

1.2 merged (`4532c60`) and the demo-safe correctness bug is closed on
`overhaul/main`. What is left of Phase A is **3.1 and 3.2** (lane 3) plus
PR 0's CSS lane blocks (lane 1).

```
Done    PR 0 domain half (48223a0) → 1.2/1.3/1.4 floor work (4a12fa9,
        4532c60, 775eb1f) → 1.7 (4cbe946) → preview stops at the flight
        day (96fe3b1)                                        ← on overhaul/main
Done    PR 0 props half + 2.1–2.4 → **PR #2** (`overhaul/dev2-today` @
        `5f3cc83`), open against `overhaul/main`; blocked on review, not
        on lane 1
Open    3.1 · 3.2 (lane 3 Phase A) — written and committed on
        `overhaul/dev3-shell` (`eac1a23`) but **not pushed**, so they are
        not on `overhaul/main` yet. Merge them before PR #2 per lane
        order lane 1 → lane 3 → lane 2, then rebase PR #2 once 3.1 lands
        so `page.tsx` passes `adherence` and the fixture fallback goes
Open    PR 0 CSS lane blocks (lane 1) — required before 3.10
Next    Day 1: 2.5–2.6 Dev 2 · 3.3–3.7 Dev 3 · 1.6 Dev 1
Final   Dev 3: CSS cleanup + integration QA pass + re-check the stage path
        in `docs/reference/demo.md` (the pre-run preview changes shape).
```

**Merge all A by 17 Oct EOD — demo-safe checkpoint.** The demo-safe subset
(1.2 + 2.2 + 2.3 + 3.1) is three-quarters landed: no fabricated times, a
correct next step and one honest progress number are on-branch or in PR #2;
**provenance tagging (3.1/3.2) is the only open item.** Everything else is
cosmetic and can move past 18 Oct.

3.8's dependency is gone — 1.5's type change is already merged; Dev 1's C
work is 1.6 only (1.7 landed as `4cbe946`).

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
- [ ] `previewPlan` over the demo trip < 50 ms client-side (**test still owed — 1.4 remainder**); the feed's memo recomputes only when trip/calendar/adherence/baseline change — landed in `5f3cc83` (`NudgeFeedScreen.tsx` memo deps), no re-solve on unrelated state.
- [ ] No preview step before 07:00 London when a later legal slot exists; no step overlaps a fixed calendar event; every preview day passes the gate. *(lane 1: asserted at `tests/nudges.test.ts:50`, `tests/solver.test.ts:208-219`)*
- [ ] "Your next step" is never a passed window; passed ones sit under "Missed". *(feed side landed `5f3cc83`; re-verify on the integrated page)*
- [ ] One progress number; no 6%; eastbound readiness shows "of shift locked" after a run. *(feed side landed `5f3cc83`; needs a real run to show > 0)*
- [x] No invented values anywhere — assert on rendered values, not source shape (see the grep note below); demo data is tagged "Demo profile". *(feed-side strings deleted in `5f3cc83`; the "Demo profile" tag is 3.2 — lane 3 verified in Chrome on both rungs: `62 ms`, `52 bpm`, `2/2`, `23:30` all absent)*
- [ ] No ".ics" button without a real plan. *(landed `5f3cc83`)*
- [x] No "Trip & Flight Setup" title, no section numbers, no Guide/Setup pills; setup lives in the trip-summary sheet. *(landed `0d6d1f4`, `3aecb12` — verified in rendered DOM on `/`)*
- [x] Flight windows show Best / Workable / Hardest, no percentages. *(landed `48223a0`; cards render badge + bestFor + times only)*
- [ ] Every time is labelled with its city; the flight day shows a date.
- [ ] Screen reader pass: no "Evening linen"-style alt text; DOM order = visual order.
- [x] `/crew` and `?depth=guided` still work (evidence drawers open, deep-dive visuals visible). *(checked in headless Chrome: deep-dive tabs absent on Calm, present at `?depth=guided`; `/crew` renders with the today+3 default `2026-10-19` and no runtime errors. Evidence-drawer *open/close* itself still needs a human click-through.)*
- [ ] `page.tsx` is the only `NudgeFeedScreen` caller and typechecks against the exported props type. *(props type exported in `5f3cc83`; caller is unique — check with `grep -rn "<NudgeFeedScreen" src/` — but `adherence` is still not passed (3.1's last step).)*

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