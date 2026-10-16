# Home page overhaul — accuracy, one flow, honest claims

> **SHIPPED 2026-10-17 — merged to `main` via `overhaul/main` (deployed).**
> Status annotations below are the historical record; don't implement from
> this doc. Current work: [home-signature-pass.md](home-signature-pass.md).

2026-10-16, updated same day after PR 0 merged, then again by lane 2 alongside
PR #2 and PR #4 so the status notes and `file:line` citations match the code on
`overhaul/main`. Derived from a critical
review of `/` against
[next-steps.md](next-steps.md), [consolidation.md](consolidation.md),
[consumer-appeal-implementation.md](consumer-appeal-implementation.md) and
[icp.md](icp.md). All three phases run now, in parallel, across three
developers. **Phase A items merge first (target: 17 Oct EOD, ahead of the
18 Oct Graph Hacks deadline)**; B and C follow in the same lanes.

**Branch state (updated 16 Oct, after lane 2's Phase B/C PR):** `overhaul/main`
is the integration branch — every lane PRs into it, and merging it into `main`
is the deploy step (Render auto-deploys `main`), which stays the orchestrator's
call. All three lanes are integrated there (`ec0b64a`, `7bf0757`, `e7f4b41`,
`42d3301`, `8ce0b80`, `1de835c`): lane 1's Phase A (`48223a0` → `96fe3b1`, plus the
scorer fixes `c548c9c`/`1d4c94c`), lane 3's 3.1–3.7 and 3.9–3.10 (`eac1a23`,
`0d6d1f4`, `3aecb12`, `bb6a2d5`) and lane 2's 2.1–2.4 (`5f3cc83`, PR #2).
`8ce0b80` fixed the last integration bug — the feed opened on `days[1]` rather
than the day `todayDayIndex` says is today. Dev 3's follow-up `1de835c` carries
the final QA pass (`118a92e`) and the eval fail-fast fix (`414b587`).
Lane 2's 2.5–2.8 are open as **PR #4** (`overhaul/dev2-today-b`).
`adherence` is passed at the call
site now (`page.tsx:645`), which closes 3.1 — but the prop **stays optional**,
because `TripData.adherence` is itself optional (`page.tsx:43`); see "The React
prop contract" below. **CSS lane blocks:** `lane: shell` landed with `eac1a23`
and `lane: today` lands with PR #4; Dev 1's `lane: engine` block
is still missing, so 3.10 still owes that reconciliation.

## Why

`/` is supposed to be the Calm rung: *"tell me your trip; I tell you the one
thing to do now so you land fresh"* — with the scorer authoritative and no
fabricated evidence. It broke that in five ways (all verified in code).
**All five are closed on `overhaul/main`** — the last one by lane 3's one-flow
rewrite (`0d6d1f4`). What is left is Phase B/C polish: one view, city-labelled
times, copy.

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
   Setup side ✅ closed by `eac1a23` (3.2, merged in `ec0b64a`): `|| 3`, `"2/2"`,
   `62 ms`, `52 bpm` and the duplicate hardcoded flight array are gone from
   `TripSetupScreen.tsx` (re-grepped 16 Oct), absent values render "—", and a
   "Demo profile" tag names the fixture numbers (`TripSetupScreen.tsx:198`).
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
first. Current state: all three Phase A lanes are on `overhaul/main` (see
**Branch state** above); lane 2's 2.5–2.8 are open as PR #4.

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
// src/components/NudgeFeedScreen.tsx — export the props type (landed: `:30` at
// `8ce0b80`, `:26` after lane 2's Phase B; it was unexported at line 22 when
// this was written) with exactly these deltas:
export interface NudgeFeedScreenProps {
  // …existing props…
  + adherence: AdherenceProfile;      // task 2.1 — landed *optional*, see status
  - chosenFlightId: string;           // task 2.6 — landed, the real prop was `selectedFlightId`
  ? ics?: string;                     // task 2.4 — landed; then dropped by 2.6 with the flight block
}
```

Dev 3 already holds `adherence` + `baselineSource` in `TripData` (task 3.1)
and is blocked only on passing `adherence` down — see the commit message on
`eac1a23`. Merge order stays lane 1 → lane 3 → lane 2, so Dev 3's call-site
change rebases onto Dev 2's export.

**Status: landed in PR #2 (`5f3cc83`) with one deliberate deviation, and that
deviation is now permanent.** `NudgeFeedScreenProps` is exported
(`NudgeFeedScreen.tsx:26`) and `ics?` arrived as specified. **`adherence` shipped
*optional* (`:48`) and stays optional.** The note written here in PR #2 — "drop
the fallback and tighten to required once 3.1 merges" — is **void**: 3.1 did
merge (`42d3301`, passing `adherence={data?.adherence}` at `page.tsx:645`), but
`TripData.adherence` is itself optional (`page.tsx:43`), so the caller has no
value before `/api/trip` resolves. Making the prop required would either break
typecheck or push a fabricated default into lane 3; the `ADHERENCE_PROFILE`
fallback (`NudgeFeedScreen.tsx:97`) is what keeps the preview floor-correct
during that window. Revisit only if `TripData.adherence` becomes required
end to end.
The contract's `- chosenFlightId` line named a prop that never existed — the real
one was `selectedFlightId`, and 2.6 dropped it together with the route/flight
summary block, the feed's own `.ics` download (the post-run handoff banner is now
the only ".ics" affordance, which is exactly the "no button without a real plan"
rule) and `onOpenTripSetup` (the trip-summary chip's *Edit* opens the sheet).
That deletion is in lane 3's file — three lines at the call site, nothing else
touched.

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
| 2.5 | B | ✅ Landed (lane 2's Phase B PR). Timeline is the only view: `GuideViewMode`, the focus/cards modes, the card-deck stepper, the default-view star + `meridian:defaultGuideView`, and the category chip row are all gone, so `filteredNudges`/`categoryFilter` went with them and the day renders as one chronological rail (`NudgeFeedScreen.tsx:553`, `.tl` in the new `lane: today` CSS block) sorted by `startMin` (`:178`) instead of category. Each row: `time + city — title — Done — Why & details`, the drawer keeping `actionSummary`/`whyItHelps`, the evidence chips and `expandAllWhy` (at guided depth the drawer is open and the toggle is not rendered, so it never lies about what a click will do). ⚠ **Kept on purpose:** the `meridian:completedNudges` write — 2.5 only named the *default-view* storage. Its ids are relative day labels (`D-3-sunlight`), so checkmarks leak from one trip to the next; that is a real bug, but it is not this task's, and it needs a key scheme (trip-scoped, or per-date) rather than a deletion. Filed for the next lane-2 pass. |
| 2.6 | B | ✅ Landed (same PR). The route/city/arc/flight-window block is out of `.hl`; `selectedFlightId`, `ics` and `onOpenTripSetup` are off the props (three-line deletion at the call site in lane 3's file — `page.tsx` still passes `adherence` and the rest unchanged). `.ics` now exists only in the post-run handoff banner (`HandoffBanner.tsx:141`) and the guided deep-dive, which is the strict form of "no .ics button without a real plan"; *Edit* on the trip-summary chip is the way into setup. The left panel keeps the terminator art and renders its stat **only** when `readinessPct > 0` (`:283`), so the done count appears exactly once (the meter) instead of twice. "Personalise with the crew" kept. |
| 2.7 | C | ✅ Landed (same PR). Every rendered time goes through `fmtMin(startMin)` + `dayPlace().city` (`:144`) — hero line, missed rows and every rail row, so the same day reads "07:00 London" before the flight and "07:00 Tokyo" after it. `friendlyDayLabel` (`:58`) now puts the date on the flight day (`✈ Mon 19 Oct`) and the day pills render it for every day, so "✈️ Fly" is gone. |
| 2.8 | C | ✅ Landed for the feed (same PR); `nudges.ts` copy is 1.6 (lane 1). The deck's decorative `<img>`s left with the view, so the file has no alt text to fix and the "Evening linen"-style labels are gone; the hero SVGs were already `aria-hidden`. Copy sweep: "This is the solver's preview…" → plain wording about the times the crew would lock, "done today" only when the selected day *is* today (`doneWhere`, `:238`), the guided ribbon drops its bare score number, and the "All done" heading names the day. |

### Dev 3 — Shell, setup & data

**Owns:** `src/app/page.tsx`, `src/components/TripSetupScreen.tsx`,
`src/components/RoutePicker.tsx`, `src/components/TripSummary.tsx` (new),
`src/components/DeepDiveVisuals.tsx` (new), `src/app/api/trip/route.ts`,
`src/app/crew/page.tsx` (date default only), `README.md`,
`docs/reference/architecture.md`, final `globals.css` cleanup.
(`TripPassport.tsx` was owned here and is now deleted.)

| # | Phase | Task |
|---|---|---|
| 3.1 | A | ✅ **Landed (`eac1a23` + `42d3301`)** — `baselineSource: "fixture"` in `/api/trip`; `TripData` holds `baselineSource` + `adherence`; `baselineSource` threads to `TripSetupScreen`; the integration commit passes `adherence={data?.adherence}` at `page.tsx:645`, which closes the last outstanding half. The prop stays optional and the feed keeps its fixture fallback — see the props contract. |
| 3.2 | A | ✅ **Landed (`eac1a23`)** — `|| 3`, `"2/2"`, `23:30–06:45`, `62 ms`, `52 bpm` all removed; absent values render "—"; a "Demo profile" tag appears when `baselineSource`/`calendarSource` is `fixture` (`.demo-tag` in the `lane: shell` CSS block). |
| 3.3 | B | One flow in `page.tsx`: delete the titlebar, the Guide/Setup pills, `activeScreen`, `goSetup` scrolling and `?screen=setup`. No trip → render setup (route, date, Personalise). Trip → Today. Voice/Muted become one toggle button. Nav: brand · Crew · voice · menu; menu items renamed per vocabulary. | 🟢 **Landed (`0d6d1f4`)** — titlebar, Guide/Setup pills, `activeScreen`, `?screen=setup` and `goSetup` scrolling all gone; Voice/Muted collapsed to one toggle reading "Voice on"/"Voice off"; nav is brand · Crew · voice · menu; menu items renamed. |
| 3.4 | B | New compact `TripSummary` chip above Today ("LHR → HND · Mon 19 Oct · 8h east · Edit" — the date is today + 3 after 3.7, not the fixture's 18 Oct) opening a sheet whose body is the refactored `TripSetupScreen`: route, date, flight windows, wearable/calendar summary — no section numbers. Delete `TripPassport.tsx` (currently unimported — confirmed by grep on 16 Oct). | 🟢 **Landed (`0d6d1f4`)** — `TripSummary` chip above Today, opening a `role="dialog" aria-modal` sheet carrying the refactored `TripSetupScreen`. `TripPassport.tsx` deleted (grep confirmed zero references). |
| 3.5 | B | Extract the deep-dive visuals (globe, swimlane, week) out of `TripSetupScreen` into `DeepDiveVisuals`; `page.tsx` renders it only when `depth === "guided"`. | 🟢 **Landed (`0d6d1f4`)** — new `DeepDiveVisuals.tsx`; `page.tsx` renders it only at `?depth=guided`. Verified in Chrome: deep-dive tabs absent on Calm, present at guided. |
| 3.6 | B | ✅ **Landed (`f744b66`)** — pre-run "Morning Check-in" was a second button wired to the same `onStart`; it now renders only when `phase === "done"`. |
| 3.7 | B | Default departure = client-local today + 3 in `page.tsx` (was `page.tsx:57`) **and `src/app/crew/page.tsx:52`** — after 18 Oct a `/crew` visit would otherwise default to a past trip. `api/crew/run/route.ts:19` reads the query param and needs no change. Fixtures in `src/domain/fixtures.ts` + `src/state/fixture-events.json` stay frozen (test/replay inputs). URL `?date=` still wins. **Verify** `bun run replay:check`, `bun run eval` (`scripts/eval.ts:29-31` hardcodes `2026-10-18` in all three scenarios) and a replay-provider run still work for a non-`DEMO_DEPARTURE` date before merging; report if replay is pinned to the fixture date. (Replay's floor policy already landed — `replay.ts:172`, `replay-plan.ts:25` thread `adherence` — so a `replay:check` failure after your change is a new regression, not the old script.) | 🟢 **Landed (`f744b66`)** — today+3 local default on `/` and `/crew`, set in the mount effect (no hydration mismatch), fetch guarded on a non-empty date, `?date=` still wins. ⚠ **`bun run eval` hangs by default**: it runs `AGENT_PROVIDER=featherless` and blocks on the provider. Use `AGENT_PROVIDER=replay bun run eval` — then all 3 scenarios pass. Pre-existing, reproduced on the base commit. Worth defaulting eval to replay when no key is present. |
| 3.8 | C | ✅ **Already satisfied** — cards render `badge` + `bestFor` + `departsLocal` → `arrivesDest` only (`TripSetupScreen.tsx`, unchanged by lane 3). |
| 3.9 | C | Copy sweep of `page.tsx`, `TripSetupScreen`, menu, `RoutePicker`; remove orphan labels ("8 flexible", "biologically ready" → "3 movable events", "Pitch: ready"). | 🟢 **Landed (`3aecb12`)** — section numbers dropped, "Circadian guidance" reworded, "Personalize" → "Personalise", "N flexible" → "N movable", "biologically ready" → "meetings ready", menu items renamed; also collapsed a `hasSavedPlan` conditional whose branches were identical. |
| 3.10 | C | 🟡 **Partial (`bb6a2d5`)** — `.titlebar` rules deleted (incl. the responsive override); README "Active" link landed in `6b7989f`. **Kept deliberately:** `.pill` (the nav still uses it for the Crew link) and the view-mode/filter styles (Dev 2 still renders that row until 2.5). Delete those after 2.5 merges. **2.5 is up as PR #4**, so the orphan list is: `.chips`, `.view`, `.deck` (+ its two `@media` rules), `.tile` and its children (`.ph`, `.ph0`, `.ph1`, `.ph2`, `.tb`, `.cat`, `.tk`, `.chk`, `.sleep-span`), `.arc`, `.flt`, `.acts` (⚠ the new rail row uses `.tl-acts`, so match `className="acts"` or `.acts {` rather than a bare token grep), `.city`. **Not orphans:** `.route` (`TripSummary.tsx:37` renders `className="route"` and inherits the bare rule at `globals.css:359` — the amber uppercase label, which is what the chip wants), `.meter`, `.mini`, `.drawer`, `.evrow`, `.evchip` (all still used by the rail and the hero). |

## Sequencing

Phase A is **integrated** on `overhaul/main` and the demo-safe correctness bug is
closed. What is left is Phase C plus the two deferred items at the bottom.

```
Done    lane 1: PR 0 domain half (48223a0) → 1.2/1.3/1.4 floor work (4a12fa9,
        4532c60, 775eb1f) → 1.7 (4cbe946) → preview stops at the flight day
        (96fe3b1) → scorer fixes (c548c9c, 1d4c94c)
Done    lane 3: 3.1/3.2 (eac1a23) → one flow + summary chip + deep-dive split
        (0d6d1f4) → today+3 default (f744b66) → copy sweep (3aecb12) → .titlebar
        cleanup (bb6a2d5)
Done    lane 2: PR 0 props half + 2.1–2.4 (5f3cc83, PR #2)
Done    integration: ec0b64a / 7bf0757 / e7f4b41 / 42d3301 (adherence wired,
        after-landing residual copy, quiet loading spacer, Esc closes the sheet)
        → 8ce0b80 (open Today on the day todayDayIndex says is today)
Done    lane 2 Phase B/C: 2.5–2.8 (this PR) — timeline-only, flight block gone,
        city-labelled times, copy + `lane: today` CSS block
Open    PR 0's `lane: engine` CSS block (lane 1) — the only lane block still
        missing; `lane: shell` and `lane: today` are in
Open    1.4 remainder: the `previewPlan` < 50 ms budget test
Open    1.6 (lane 1): copy sweep of `nudges.ts` strings
Final   Dev 3: 3.10 orphan-class deletion (list is in that row) + integration QA
        pass + re-check the stage path in `docs/reference/demo.md`
```

**The 17 Oct demo-safe checkpoint is met:** no fabricated times, a correct next
step, one honest progress number and provenance tagging are all on
`overhaul/main`. Nothing merges into `main` (deploy) without the orchestrator.

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

- [ ] Fresh visit, replay provider, no keys: a populated Today in < 10 s for a trip starting today. *(left open: Chrome hydrates and populates, but the timing itself is unverified — CDP `ws.send` no-ops under this Bun/Chrome pair, so there's no reliable client-side timer here.)*
- [ ] `previewPlan` over the demo trip < 50 ms client-side (**test still owed — 1.4 remainder**); the feed's memo recomputes only when trip/calendar/adherence/baseline change — landed in `5f3cc83` (`NudgeFeedScreen.tsx` memo deps), no re-solve on unrelated state.
- [x] No preview step before 07:00 London when a later legal slot exists; no step overlaps a fixed calendar event; every preview day passes the gate. *(lane 1: asserted at `tests/nudges.test.ts:50`, `tests/solver.test.ts:208-219`. Re-verified on the integrated build: earliest ask is 08:30; the lone 06:30 is the sleep-window wake — "lights out 23:40, up 06:30" — which the Decisions table exempts. No 04:50/05:20 asks.)*
- [x] "Your next step" is never a passed window; passed ones sit under "Missed". *(landed `5f3cc83`; re-verified in Chrome on both the integrated build ("in 59m") and this PR — hero "in 32m · 23:40 London", and "Missed (3)" expands to "08:30 London · Get outside light" etc.)*
- [x] One progress number; no 6%; eastbound readiness shows "of shift locked" after a run. *(no 6% confirmed by Dev 3 on the integrated build: the feed reads "0 of 4 done today". 2.6 makes it structural — the hero-left stat renders only when readiness > 0 (`NudgeFeedScreen.tsx:283`), so the done count exists exactly once. Verified with a completed replay run: left panel "19% of shift locked", meter "0 of 4 done".)*
- [x] No invented values anywhere — assert on rendered values, not source shape (see the grep note below); demo data is tagged "Demo profile". *(feed-side strings deleted in `5f3cc83`; the "Demo profile" tag is 3.2 — lane 3 verified in Chrome on both rungs: `62 ms`, `52 bpm`, `2/2`, `23:30` all absent)*
- [x] No ".ics" button without a real plan. *(landed `5f3cc83`, no "Add .ics" in the pre-run DOM; 2.6 went further — the feed has no `.ics` affordance at all, so the only ones left sit behind a completed run: `BriefingCard.tsx:167`, the guided deep-dive that embeds it, and `HandoffBanner.tsx:141`)*
- [x] No "Trip & Flight Setup" title, no section numbers, no Guide/Setup pills; setup lives in the trip-summary sheet. *(landed `0d6d1f4`, `3aecb12` — verified in rendered DOM on `/`)*
- [x] Flight windows show Best / Workable / Hardest, no percentages. *(landed `48223a0`; cards render badge + bestFor + times only)*
- [x] Every time is labelled with its city; the flight day shows a date. *(was still unlabelled on the integrated build — that is 2.7, landed here: `fmtMin` + `dayPlace().city` at `NudgeFeedScreen.tsx:144`, and `friendlyDayLabel` (`:58`) puts the date on the flight chip. Chrome: "07:00 London" on D-2/D-3, "07:00 Tokyo" on D+1, chip "✈ Mon 19 Oct".)*
- [x] Screen reader pass: no "Evening linen"-style alt text; DOM order = visual order. *(2.5 deleted the deck, so the component has no `<img>` left and the hero art is `aria-hidden`; the a11y tree reads hero → day pills → ribbon → check-in → rail rows in visual order. A voice-over listen is still worth a human pass.)*
- [x] `/crew` and `?depth=guided` still work (evidence drawers open, deep-dive visuals visible). *(checked in headless Chrome: deep-dive tabs absent on Calm, present at `?depth=guided`; `/crew` renders with the today+3 default `2026-10-19` and no runtime errors. Evidence-drawer *open/close* itself still needs a human click-through.)*
- [x] `page.tsx` is the only `NudgeFeedScreen` caller and typechecks against the exported props type. *(`NudgeFeedScreenProps` exported at `NudgeFeedScreen.tsx:26`; caller is unique — `grep -rn "<NudgeFeedScreen" src/` → `page.tsx:16` + `:630`. `adherence` is passed at `:645` since `42d3301`, so lane 3 task 3.1 is complete; 2.6's three-prop deletion is applied at that same call site in this PR.)*

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