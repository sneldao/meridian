# Backlog — next steps and open items

**Current UX contract (supersedes historical rounds below).** Cold `/` is an
explicit trip entry — blank airports, date defaulting to today + 3, Continue —
or an honest example (`?example=1`, built locally, saves no traveller trip or
action data, cannot run the crew). Returning `/` restores the saved route (`meridian:activeTrip`, with
`lastTrip` legacy fallback); explicit malformed URL routes never fall back to
a stale trip. Today is always the only action checklist; the body-clock
projection is a read-only `<details>` explanation below it (`?view=clock`),
sharing one Home-owned, trip-scoped action ledger (`meridian:actions:*`,
migrating legacy `completedNudges`/`pendingCheckins`). Preview scopes are
memory-only — no writes, no durable check-ins. Phone nav is three links
(Today / My plan / Trips); "AI at work" is a menu route to `/crew`.

Verified so far: `bun test` (pure functions + SSR markup), typecheck, lint,
production build. **Open:** real visual/interactive QA — a browser pass over
entry, restore, the example, the clock disclosure and the mobile nav — plus
user validation; none has happened yet.

The dated implementation rounds below are historical. Open proposals and
unchecked tasks remain the backlog; the navigation contract above supersedes
their old UI descriptions. The 2026-10-15→17 home overhaul, signature pass,
and any-route pass shipped on `main` (commits are the record).

Design direction lives in [docs/vision.md](../vision.md); current-state facts
in [docs/reference/](../reference/).

**Demo film:** rev5 rendered, rev6 plan at
[video-rev6-plan.md](./video-rev6-plan.md) — registry primitives + sponsor
callouts in flight; cut reads as static without them. Submission text and
per-sponsor variants at [hackathon-text/](./hackathon-text/).

## How to split this between two

The split follows **file ownership, not topic**. Two files absorb almost every
item below, so each gets exactly one owner and nobody else opens them:

| File | Items that touch it |
|---|---|
| `src/app/page.tsx` (962 lines) | 1, 2, 4, 6, 7, 9 |
| `src/components/NudgeFeedScreen.tsx` (947 lines) | 6, 10 |

Everything behind those — `src/domain/`, `src/app/api/`, `/outcome`, a11y
infrastructure — is genuinely disjoint and parallelises without merge pain.

**Items 1–10 are all shipped.** What follows is the next round: the ICP read
(§Next — ICP read, items 11–16) under the same rule, with
`TripSetupScreen.tsx` moving to B.

**Track A — the landing journey.** Owns `page.tsx`, `NudgeFeedScreen.tsx`,
`HeroDawnPanel.tsx`, the depth dial. Surface and journey.

**Track B — domain & honesty.** Owns `src/domain/*`, `src/app/api/*`,
`TripSetupScreen.tsx`, readiness, the wearable upload. Shapes, contracts and
every test.

**TripSetupScreen moves to B for this round.** Otherwise A owns all six renders
and B idles — and it is the upload + biometrics surface, which is exactly B's
"no invented numbers" brief. Moving it also clears the only remaining overlap
between the lanes: with A on the feed and B on the setup body, the two file sets
are disjoint, so a cross-lane change is always a PR from its owner rather than a
drive-by edit.

**The seam — items 4, 6, 9 established the pattern: B lands the domain half
first, A renders second.** Item 4 is the cautionary tale: A decided the item's
*direction* before checking B's in-flight work, built a downgrade, and reverted
it. Read `git log` on `domain/fixtures.ts`, `domain/nudges.ts`, `api/trip` and
`api/crew/run` before deciding what an item should do, not just before
committing it.

**Balance is deliberately ~60/40 to A**, because five of six are surface. B is
paid back by owning **all tests and verification** — which is also the honest
home for them, since these items are presentation gates rather than scorer
changes, and `bun run eval` should not move.

**Definition of done, per item** — the same three assertions every time:
preview writes **zero** `CheckIns` (asserted, never eyeballed); absent
biometrics render `—` (screenshot); the hero meeting traces to a **real** fixed
calendar event, never a fixture title. Plus `bun run typecheck` and `bun test`
green.

**Sequence — round 1 shipped.** 1 + 2 (`4ba7b35`), 5 (`deee7d9`), 4 (`36563d0`
on top of `c675c45`), 9 + 10 (`0a0c680`), 6 (`9da72cd` on top of `9afa6c3`), 7
(`6ba74fc`), and from the other lane 3 (`4933774`), 8 (`1be902c`), the Garmin
upload path (`92299c3`). The sequence ran 1 → 10 and closed every item, 7 last
as planned: an arrival screen that claims "the crew learned from your week" is
worthless if the week belongs to whoever used the demo last, and 6 is what made
the first number on the page the traveller's own.

**Sequence — round 2 (items 11–16), which avoids the item-4 trap.** The lesson
was that a straddling item is a handoff, not a solo: B lands domain first, A
renders second. Applied here as a day-by-day:

- **Day 1 morning — contracts (B), which unblocks everything.** Define
  `isPreview = baselineKind === "demo-default"`, `DisplayBiometrics = null` on
  preview, and
  `HeroMeeting = { title, destTime, bodyTime, readiness } | null`.
  A reviews the contract and **does not code against main drift** — reads
  `git log` on `domain/fixtures.ts`, `domain/nudges.ts`, `api/trip` first.
- **Day 1–2 — parallel, no dependency.** A: 11 and 16, both isolated to the feed
  and the depth dial, behind `isPreview`. B: 12 whole, plus the data halves of 13
  and 15. B extends `tests/baseline.test.ts` with the preview-never-writes-
  ledger invariant and adds `tests/hero-meeting.test.ts`.
- **Day 3 — join.** A renders 13 and 15 on top of B's shapes, then 14 **last**:
  it touches every row, so it lands when the rows are stable.
- **Day 4 — harden, jointly.** `bun run replay:check`, `bun test`, typecheck, a
  phone-width and keyboard pass. B owns evals.

**Sequence — round 2 ran and shipped.** Plan `68e83b6` (the ICP read with
owners, contracts, day-by-day). A's render `63e8861` (items 11, 13, 14, 15, 16
plus tests asserting B's contract for items 11, 12, 13, 15). B's contracts
(`src/domain/preview.ts`, `src/domain/hero.ts`) ride in the same commit so the
assertions have something to bind to. Item 12's `TripSetupScreen` half is in
flight (B is wiring `baselineKind` forwarding — `page.tsx:856,915`) and stays
on B's board; the rest of round 2 closes once that lands and the Garmin CSV
affordance follows.

**Sequence — round 3 ran and shipped.** Three carried items from §6, the
follow-on to round-2's item 15, and item 12 closing on B's board. The split
was clean: A picked the first-impression and the globe; B picked the pre-lock
contracts. Plan: the proposal above (§Carried — the same disease, different
symptom, and item 15's pre-lock gap).

| Item | Owner | Commit | What shipped |
|---|---|---|---|
| 1,145-airport surfacing | A | `56965c1` | `RoutePicker` mounted on the first viewport; `TripSummary` removed. Demo trip is now the starting point, not the only option. The other setup-sheet settings stay behind Menu → Edit trip. |
| Globe rate (`HeroDawnPanel`) | A | `6d62d56` | `setInterval(60_000)` swapped for a throttled rAF at 250ms (4Hz). Reduced-motion travellers keep the 60s tick. The terminator now reflects real time continuously; the visible motion at Earth's rate is sub-pixel per frame, but the data is fresh and any state change updates the disc immediately. |
| Pre-lock hero meeting | B → A | `7b6cc7d`, `3bb8e94` | B added `previewLocked` to `heroMeeting`; A threaded the solver preview through. Pre-lock the hero subhead now reads e.g. `D+1 14:00 Client pitch = 06:00 body time · would have been 13:30 without the crew`. |
| Pre-lock readiness | B → A | `9651585`, `45a5918` | B added `previewLocked` to `shiftLockedPct`; A threaded the preview. The dawn card and the rail's done-count show the plan's promise (`38% banked on preview`) rather than a flat zero on first impression. |
| Item 12 (TripSetupScreen) | B | `49c6722` | The m3 grid replaced by `displayBiometrics()`; `Connect Garmin (CSV)` affordance + manual verification with a real export. The carried `Real integrations` remainder closes. |

**Coordination.** Only A edits `page.tsx` / `NudgeFeedScreen.tsx` /
`HeroDawnPanel.tsx`. Only B edits `domain/*`, `api/*`, `TripSetupScreen.tsx`.
Rebase on `main` daily; the second agent's drift last time was
`api/crew/checkin`, `adherence.test`, `fixtures` and `nudges` — check those four
first. **Do not split item 15 across both devs at once:** B's shape PR merges,
then A renders. Same rule that caught the second half of item 4's bug.

**Check `git status` and `git log` before deciding an item's *direction*, not
just before committing it.** On item 4 A read the code, concluded the picker
couldn't be made real, and built a downgrade to advisory content — while the
other agent was landing the engine support that made it real. The downgrade was
reverted the moment the collision was noticed, but it was a full wasted pass and
it nearly deleted a control. A straddling item is a handoff, not a solo item:
read the domain half's state *first*, and if the other lane owns the decision,
wait for it or ask.

The deeper trap on item 4: the picker was decorative **twice** — once in the
client, once in the server — and the second failure was invisible precisely
because the first fix made the API echo a plausible-looking valid id. Fixing a
layer and then trusting its success signal is how the second one survives.

**Don't** split item 7 (one surface telling one story; shared authorship is
mush), or treat a straddling item as solo (see Coordination — it cost a full
wasted pass on item 4), or split item 15 across both devs simultaneously (B's
shape merges, *then* A renders).

Item 9 used to be the "don't open with this" filler; that advice is retired, and
in round 2 the filler is item 16 (a rename) — cheap, isolated, and a good place
for B to start on tests while A waits on contracts.

## Do first — small, load-bearing

Cheap, mostly self-contained, and each one currently damages trust rather than
merely looking untidy. Verified against `main` on 2026-10-17.

1. ~~**A** · **Space keydown hijack**~~ — shipped `4ba7b35`: chips, links,
   buttons and contenteditable keep their own Space; Escape is handled first
   and unconditionally (which also fixes Escape doing nothing inside the edit
   sheet's fields). The three menu items were focusable divs with no
   activation behaviour — they take focus and did nothing on Enter/Space — so
   they are real buttons now, and `.menu button` joins the existing selectors
   with no visual change.
2. ~~**A** · **Reset phase on stream failure**~~ — shipped `4ba7b35`. The
   cause was **not** the network: the stream stays open while the server waits
   on an optional write, so `onerror` never fired. With FalkorDB down,
   `runtime.ts` blocked on the unbounded graph write *after* the briefing — no
   `done`, no artifacts, disabled button, no error. Every post-briefing write is
   now bounded the way the check-in route already is, `onerror` resets, and the
   client watches for silence as a failure in its own right (60s idle, 12s once
   the briefing has landed). The error is on Today, not only in the
   closed-by-default `AgentDrawer`.
3. ~~**B** · **Identify the traveller before "the crew learns"**~~ — shipped
   `4933774`: `meridian-tid` cookie → `x-meridian-tid` header via middleware;
   memory files, the fold, graph writes, run records, `/api/memory` all scope
   by it. `?tenant=` stays the explicit override.
4. ~~**B → A** · **Flight-window picker is decorative**~~ — **B's half `c675c45`**:
   every recommendation now carries `departMin`/`arriveMin`; `flightWindowFor`
   resolves ids direction-scoped (wrong-direction/stale ids → null);
   `?flight=<id>` works on `/api/trip` and `/api/crew/run` and the payload
   echoes the applied `flightId`. **A's half shipped `36563d0`**: the client
   sends the choice on both requests, and the default derives from the trip via
   `getFlightRecommendations(trip).find(r => r.recommended)?.id` — the old
   hardcoded `"midday-afternoon"` is an *eastbound* id, which is why no card
   rendered as selected for a westbound route.

   Fixing it exposed a **second** instance of the same bug one layer down:
   `applyFlightChoice` matched only the fixture ids `ev-flight`/`n-flight`, but a
   connected Google calendar returns hash ids and a carrier title
   (`BA005 LHR → HND`) — so it moved nothing while `/api/trip` still echoed the
   picked id back as **valid**. It now matches by shape too (an IATA route pair,
   or the word "flight"), and a calendar with no flight is returned untouched
   rather than having a slot invented for it. Four tests cover that shape, the
   route-less "Flight to Tokyo" title, and the no-flight calendar; the existing
   tests only ever exercised the fixture id.

   Worth remembering: the picker was decorative *twice* — once in the client and
   once in the server — and the second failure was invisible precisely because
   the first fix made the API echo a plausible-looking valid id.
5. ~~**A** · **Route-level failure surfaces**~~ — shipped `deee7d9`:
   `src/app/error.tsx` for the page segment (inside the root layout, so the
   document and stylesheet survive) and `src/app/global-error.tsx` as the last
   resort, styled inline because globals.css may be what failed. No root
   `loading.tsx` on purpose — no page suspends here, so it would be dead code
   that only flashes on navigation.

## Next — the product gaps

6. ~~**B → A** · **Ask the one personalisation question**~~ — **B's half `9afa6c3`**:
   `resolveBaselineState` returns `{ baseline, kind }` — garmin / wake-band /
   demo-default (a labelled state, not "absent"; replay needs the fixture);
   `baselineKind` rides `run_start` → run state and `/api/trip` exposes it.
   **A's half shipped `9da72cd`**: the question appears inline on Today, directly
   under the demo tag that admits the numbers are invented, and retires once
   answered (the Edit sheet still allows a change). `/api/trip` can't report a
   `wake-band` kind because it never sees `wake`, so the band is applied
   client-side via `resolveBaseline` and the preview re-plans instantly.

   Asking it exposed a bug that made the feature *harmful*: **answering emptied
   the day's plan.** `resolveBaseline` computed bedtime as `wake + sleep - 1440`
   instead of `wake - sleep`, putting a 06:45 riser to bed at 13:35. Nothing
   threw and every band produced a well-formed baseline — the only symptom was a
   solver that couldn't place anything. The existing tests asserted wake time
   and chronotype and **never the bedtime**, which is exactly how the sign
   survived; `tests/baseline.test.ts` now pins the invariant (`wake - sleep ===
   bedtime`, sleep duration preserved, never a daytime bedtime, and `6to8`
   reproducing the fixture's own 23:55).

   All three answers now keep the day intact and move the numbers correctly: the
   caffeine cutoff lands at 14:25 / 14:55 / 16:10 for early / mid / late.
7. ~~**A** · **The landing payoff**~~ — shipped `HEAD`: `/arrival` is the first
   morning in the destination, scored against what the gate promised, and it is
   reachable three ways — automatically from Today's hero once the last planned
   day has passed, from the Menu, and by URL. The vision's Window Seat ending.

   Scoring it needed the promise to exist: the briefing has always carried
   `coverage`, but `meridian:lastPlan` dropped it, so after landing the only
   number available was the traveller's own recollection. Both `coverage` and
   `savedAt` are persisted now, and `arrivalRead` reads them back — degrading
   honestly, since a plan saved before `coverage` existed reports *no promise*
   rather than a zeroed one that would claim the crew promised nothing.

   Today stops offering steps once the trip is over: the countdown, the step and
   its Done button are all suppressed, because past the last day "your next step
   is 07:00" is fiction.

   Two off-by-ones found and fixed while building it. Arrival is judged at the
   **destination's** clock, so a 21:00 Tokyo landing isn't still "D-1" because
   it's lunchtime at home. And days-remaining counts **calendar dates** rather
   than dividing elapsed minutes — the division drifts by one whenever the local
   time isn't midnight, which made a finished trip claim "1 day left" while the
   copy underneath it said "That's the trip". Both are now pinned by tests.

   Kept out of the component so they can be asserted: `domain/arrival.ts` (the
   read) and `domain/arrival-rows.ts` (the cells), because an arrival screen
   that flatters is worse than not having one. `?arrived=1` pretends the trip is
   over so the payoff can be looked at without waiting a week for it.
8. ~~**B** · **Gate `/outcome`, and stop lying in it**~~ — shipped `1be902c`:
   no saved plan → "nothing to grade yet" card; sliders start unset and save
   stays disabled until both are real answers; "saved" only fires when the
   check-in POST lands, otherwise it admits the local-only record.
9. ~~**B → A** · **Announce the run**~~ — **shipped `0a0c680`**: B's half
   (`RunAnnouncer` diffing run state into polite sentences, `useFocusTrap`)
   existed and did nothing; A mounted both. `RunAnnouncer` now sits on the page
   rather than in the drawer, which is closed by default — so the run was silent
   to assistive tech for its whole duration. Verified speaking during a live run.
   The Edit sheet honoured `aria-modal` for the first time: opening moves focus
   to the close button, Tab from the last of nine focusables wraps to the first
   and stays inside, Escape restores focus to the opener.
10. ~~**A** · **Colour-only verdicts**~~ — shipped `0a0c680`:
    `.evchip.pass` and `.evchip.warn` rendered byte-identical text and differed
    only in hue, so a failed gate read as a passed one. The label now carries a
    glyph and the issue count, and the tooltip names the violations. Pinned by
    `tests/eval-chip.test.ts` — which needed the label extracted to
    `src/components/ui/eval-chip.ts`, because evidence is *absent pre-run by
    design*, so on a machine whose provider is failing the chip cannot be
    rendered at all and only a test holds the line.

## Next — ICP read (Alex, 2026-10-17)

From `docs/vision.md §6`: the landing pasted 2026-10-17 shows sample science
before it knows Alex, asks for work before earning calendar rights, and buries
the two things he pays for — the meeting and the calendar. Ordered by bounce
risk, not by file. Each states the A/B split from `How to split this between
two` so ownership stays clean.

11. **A · Preview is not a promise** — on `baselineKind === "demo-default"`,
    Today renders preview: no Done/Skip, no `0 of 4`, no `PendingMark` /
    ledger / `CheckIn` writes; affordance reads `Preview from sample — answer
    1 question to lock yours`. Same gate shape as item 8 (`1be902c`). Wake
    question moves *above* the first dependent number with the floor promise
    (`Never before 07:00 unless you say so`). Previews `21:30 / 22:30` bedtimes
    against a `23:55` late type are exactly the failure this gates.
    **Shipped `63e8861`.** The rule is split across two functions in
    `domain/preview.ts` so the *display* gate (`isPreview`) and the *write*
    gate (`tapBecomesCheckIn`) cannot drift — `tests/preview.test.ts`
    enumerates the truth table and pins the agreement. Hero button reads
    `Try this / Tried ✓`; meter says `Preview from the sample · N of M
    tried`; missed-list buttons say `Tried / Skip`. Wake-question copy
    sits above the first dependent number (Rule 1's trust clause, §6).
12. **B · No invented biometrics** — `/api/trip` already answers
    `baselineSource`/`baselineKind`; keep fixture HRV / resting HR out of the
    contract on `demo-default` (absent reads "—", per `TripSetupScreen.tsx:81`).
    B replaces the `m3` grid pre-personalisation with
    `Connect Garmin (CSV export for now) or answer 1 question` — the upload
    path (`92299c3`) gets its affordance in `TripSetupScreen` at the same time
    (closes the carried `Real integrations` remainder). **Whole to B, not a
    handoff:** it is one file and one brief, so splitting it would create a
    dependency for no gain.
    **Contract shipped `63e8861`.** `domain/preview.ts::displayBiometrics()`
    returns `null` for every measured cell on preview / unknown / missing
    baseline, so `HRV 48 ms · Resting HR 58 bpm` cannot render as the
    traveller's numbers; `tests/preview.test.ts` pins the matrix.
    **`TripSetupScreen` half in flight (B)** — `baselineKind` is now
    forwarded through `page.tsx` so the setup sheet can read its own gate;
    the `m3` grid replacement and the `Connect Garmin (CSV)` affordance
    follow.
13. **A render (B shape) · Calendar is the compliance surface** — B guarantees
    `N movable / M fixed` + `readinessLabel` + a previewable `.ics` shape
    pre-run, from data that already exists in `TripSetupScreen`. A changes the
    sticky primary to `Fit to me → to calendar` and surfaces those counts above
    the timeline, instead of hiding the `.ics` behind a 45s run. No new
    notification infra — don't fake the control (stays deferred); sell the
    `.ics` as the adherence path.
    **Shipped `63e8861`.** `domain/hero.ts::calendarSummary()` is the
    B-shape; A renders `N movable / M fixed / X/Y post-flight meetings ready`
    above the timeline and changes the CTA to `Fit to me → to calendar`.
    `tests/hero.test.ts` pins the movable/fixed split, the empty case
    (`—`, never invented), and the readinessLabel.
14. **A · Promise the floor, window the asks** — every ask renders as a window
    (`07:00–07:30`), never an instant; light/coffee/wind-down rows carry end
    times + movable/fixed tags so the day looks calendar-shaped. Solver
    already holds `floor − 105min` and tries at/after-floor first
    (`architecture.md`) — surface it, don't re-derive it.
    **Shipped `63e8861`.** Rail reads `07:00–07:30`, every row carries a
    `movable`/`placed` tag. The wake question carries the floor promise
    (`Nothing before your floor unless you say so. Evenings do the heavy
    lifting.`).
15. **B data → A hero · The meeting is the product** — B ensures
    `meetingReadiness` resolves pre-run for one real fixed event with attendees;
    A renders the hero subhead under the residual
    (`Tue 09:00 workshop = 01:00 body time · 38% → 82% if locked`). This is the
    `commercial.md` red badge — `Land at 100%` cashed on Today (§2), not just
    in the nav. **Sequential: B's shape merges, then A renders. Never both at
    once** — the same rule that caught item 4's second bug.
    **Shipped `63e8861`.** `domain/hero.ts::heroMeeting()` is the B-shape
    (earliest post-flight non-movable non-flight event, with `bodyMin` and
    `bodyWithoutPlanMin`); A renders the hero subhead under the dawn card.
    `tests/hero.test.ts` pins: `null` when nothing post-flight is fixed; the
    flight itself is never the meeting; agreement with `meetingReadiness`;
    moved events follow their new slot. Pre-lock, the "without the crew"
    half is empty (bodyWithoutPlanMin === bodyMin) — that gap is the
    *sales* line and is the next thing to surface.
16. **A · Crew backstage on Calm** — depth renames to `Plan / Why / Crew`;
    `Hear the crew`, named agents and voice leave the first viewport for
    `Why / Crew`. Calm defaults to words + one number + one CTA (Rule 3 +
    Rule 4, labels fixed).
    **Shipped `63e8861`.** Depth dial reads `Plan / Why / Crew`; the voice
    toggle and `Hear the crew` leave the first viewport (their home is
    `/crew`, which already owns its voice control). Rule 4's mechanics hold;
    its labels are fixed.

### Owners for round 2

| Item | Owner | Why this lane |
|---|---|---|
| 11 Preview is not a promise | **A** | Pure surface gate. `baselineKind` already rides run state and `/api/trip`, so no domain change is needed. |
| 12 No invented biometrics | **B, whole** | Not a handoff. B strips fixture biometrics from the contract on `demo-default` **and** lands the `Connect Garmin (CSV)` affordance in `TripSetupScreen` — the same file, the same brief ("no invented numbers"), so splitting it across two lanes would just create a handoff for no gain. Closes the carried `Real integrations` remainder. |
| 13 Calendar is compliance | **A** render, **B** shape | B guarantees movable/fixed counts + `readinessLabel` + a previewable `.ics` shape pre-run from data that already exists in `TripSetupScreen`. A surfaces them above the timeline and changes the sticky primary to `Fit to me → to calendar`. |
| 14 Promise floor, window the asks | **A** | Formatting and copy only. The solver already holds `floor − 105min` and tries at/after-floor first (`architecture.md`) — surface it, do not re-derive it. |
| 15 The meeting is the product | **B** data, then **A** hero | B ensures `meetingReadiness` resolves pre-run for one real fixed event with attendees; A renders the hero subhead on it. **Sequential, never simultaneous.** |
| 16 Crew backstage | **A** | Isolated to the dial and the first viewport. Filler while B is on tests. |

### Also in this round

The globe is real but inert. The terminator moves **0.25° of longitude a minute**
— about a quarter of a pixel on a 320px disc — so the 60s interval guarantees
nothing appears to happen, and the hero reads as a still image. The clock should
move continuously (a rAF at this scale is cheap; the interval was the wrong
call), and the shift lane should animate the ghost sliding onto the terminator
*while dragging*, not only on release. **Unassigned:** it is A's file
(`HeroDawnPanel.tsx`) but touches no contract, so it is a genuine either-lane
opportunity once 11 and 16 are done.

Related and already real but buried: 1,145 airports are wired into
`searchAirports` and reachable only via **Edit → Edit trip**, while the landing
assumes LHR → HND. The input layer exists; it is a surfacing problem, not a
build — and it belongs with item 13's "calendar is compliance" argument that the
*path to configuring your own trip* is the thing missing above the fold.

## Next steps (carried)

- **Real integrations** — **Garmin: upload path shipped `92299c3`** —
  `POST /api/wearable` takes a sleep CSV → per-tenant baseline →
  `/api/trip` answers `baselineSource: "garmin"` + kind `garmin`. Item 12
  ships the contract (`displayBiometrics` returns null on preview); the
  `Connect Garmin (CSV)` affordance in `TripSetupScreen` and the `m3` grid
  replacement are the B-side surface work to close the carried remainder.
  Worth a manual pass with a real export file rather than trusting the happy
  path — the upload route has zero callers today.
  **Flight inventory**: windows are now real planning inputs
  (`?flight=` threads through `c675c45`); live inventory remains deferred
  by design.

## Carried — the same disease, different symptom

Two findings from the §6 ICP read that aren't ICP complaints but the same
class as the calendar: a capability present and not felt.

- ~~**The globe is real and reads as inert.**~~ — shipped `6d62d56`. The
  60s `setInterval` swapped for a throttled rAF at 250ms (4Hz); reduced-
  motion travellers keep the 60s tick. The visible motion at Earth's rate
  is sub-pixel per frame regardless of update rate — but the data is
  fresh and the disc reflects state changes (slider, drag, lock) in real
  time. The shift lane already animates the ghost onto the terminator
  while dragging (native range input → React render → path recompute).
- ~~**1,145 airports are wired into `searchAirports` and reachable only via
  Edit → Edit trip.**~~ — shipped `56965c1`. `RoutePicker` is mounted on
  the first viewport in place of `TripSummary`; the demo trip is the
  *starting point*, not the only option. The other setup-sheet settings
  (wearable, wake band, flight window) stay behind Menu → Edit trip,
  since they aren't first-impression problems.

## Round-3 follow-on — closed in the same round

Two items from the round-2 ICP read surfaced in round 3 once contracts
landed; both closed as a paired contract + render.

- ~~**Item 15 — pre-lock hero meeting gap.**~~ — shipped `7b6cc7d`,
  `3bb8e94`. B added `previewLocked` to `heroMeeting`; A threaded the
  solver-backed preview through. Pre-lock the hero subhead now reads
  `D+1 14:00 Client pitch = 06:00 body time · would have been 13:30
  without the crew` on demo-default — the gap between `bodyMin` and
  `bodyWithoutPlanMin` is the sales pitch.
- ~~**Pre-lock readiness — hero shows promise not 0.**~~ — shipped
  `9651585`, `45a5918`. B added `previewLocked` to `shiftLockedPct`;
  A threaded the preview. The dawn card and the rail's done-count show
  the plan's promise on first impression (`38% banked on preview`)
  rather than a flat zero.

## Round 4 — the 9/10 plan (trust, craft, proof)

Ratings after round 3: design 8, UX 6.5, proposition 7.5. The gap to 9/10
is not new capability — it is trust (provenance labels), craft (dead ends,
first-viewport parsing load), and proof (one traveller through trip two
with a connected calendar). Three tracks, same file-ownership rule as
round 3. B's contracts exist (`previewLockedOf`, `heroReadiness` in
`4090d7c`); A adopts them.

### Track A — craft + trust labels (A's files, shipped)

Shipped `50f786c` (RoutePicker cream surface), `0451330` (marks-waiting
banner + scannable hero-meeting two-column split), `337d2e4` (arrival
promise-vs-account split).

Still open on this track:

- **Provenance labels via `heroReadiness`.** `4090d7c` returns
  `{ pct, source: "locked" | "preview" | "none" }` so the renderer never
  says "locked" about a plan nobody locked. Adopt `previewLockedOf` for
  the single shared extraction (replaces both inline `flatMap`s), drive
  the dawn stat off `heroReadiness`, branch the label:
  `"X% of shift locked"` / `"X% banked on preview"` / the zero copy.
  Until this lands, pre-lock claims "locked" about a preview — the one
  trust gap round 3 left open.
- **First-viewport parsing load.** The vision doc's own critique (§6):
  six concepts before one action. Calm defaults to words + one number +
  one CTA; crew names and voice stay on `/crew`. Copy + layout, no
  contract.
- **Orphaned routes.** `/dev` and `/team` have zero inbound links;
  `/crew`'s setup pill points at `?screen=setup`, which nothing reads.
  Link or hide — dead ends in a product this small read as abandonment.

### Track B — proof + performance (B's files, untouched — starting now)

- **B1. Wake-answer acknowledgement (delight, contract-testable).**
  `resolveBaseline` re-plans the preview instantly with no refetch, but
  nothing on the hero says the numbers moved when the traveller answers.
  Contract: a pure `wakeAck(baselineKind, wakeBand)` shape in
  `domain/preview.ts` returning the acknowledgement copy (or null when no
  answer is in play); A renders one line. Test: demo-default + band →
  acknowledgement names the re-plan; garmin → null; demo-default alone →
  null.
- **B2. `/api/trip` refetch-storm guard (performance).** — closed
  2026-10-17, no change needed. Verified: `RoutePicker`'s `onChange`
  fires only on committed picks (list selection, swap, valid date);
  keystrokes stay in `AirportField`'s local `query` state and never touch
  `origin`/`dest`, so no fetch fires per keystroke. The storm this item
  predicted does not exist. No gate, no debounce, no test — adding one
  would be code against a phantom.
- **B3. Second-trip memory proof (value proposition).**
  Cross-trip summary needs a second real trip's data; #3 already scopes
  memory per traveller. Contract: extend the memory read path with a
  pure `secondTripProof(runs)` shape — "the crew remembers X from trip 1"
  or honest null when there is no prior trip. Test both. This is the
  Traveller-tier justification made visible; without it the retention
  loop is claimed, not closed.

Sequence: B1 → B2 → B3 (each independent; B1 smallest, lands first).
A's in-flight work never blocks B — disjoint files throughout.
B1 shipped `c95a5fe` (`wakeAck` + tests). B2 closed with no change
(RoutePicker only fires on committed picks — no storm exists). B3 shipped
as `src/domain/second-trip.ts` + `tests/second-trip.test.ts`
(`secondTripProof` + `secondTripCopy`, 9 tests green) — pure, duck-typed
onto the supabase `listRuns()` rows, skips same-route re-entries and
corrupt rows. Both renders landed in `837b613` (wakeAck line + proof line
on the hero, `pastRuns` plumbed `page.tsx` → `NudgeFeedScreen` via the
`/api/persistence/runs` read; without Supabase keys the proof stays null —
the honest first-trip state).

## Round-4 ratings (post-ship, 2026-10-17)

Design 8.5 (was 8): cream surface kills the imported-chrome read; arrival
reads in two passes; hero delta is glanceable. UX 7.5 (was 6.5):
marks-waiting banner is the biggest win (the check-in loop was closed but
invisible); wake acknowledgement closes a feedback hole; second-trip proof
is correctly scaffolded but mostly potential until Supabase-backed history
exists. Still capping a 9: provenance labels (`heroReadiness` unadopted),
first-viewport parsing load, orphaned routes, unverified mobile.

## Round 5 — browser-session findings (verified 2026-10-17, all cited to source)

External review across Home (desktop + mobile), `/arrival`, `/crew`,
`/review`, `/history`, traced to source before filing. Every item below
was verified in the tree: class cited → `grep` in `globals.css` →
confirmed absent/present as claimed. Priority is the reviewer's, kept
because it is right: cheapest visual wins first.

### 5A. Shipping-blocker visual bugs (all verified — the classes are truly missing)

> **Closed 2026-10-20, and they were closed before the dial work began.**
> Re-checked against the code: `.tl-tag` has 5 rules in `globals.css` and
> `.cal-summary` 12 (5A1, 5A2); the history score is banded — `✓ Passed
> checks` / `Below our standard` / `Didn't pass` with matching colours (5A5);
> the history rows key on a composite, not `it.id` (5A6); the zero-case
> meetings copy and the light-on-light headings are gone (5A3, 5A4). The
> items below are kept as the record of what the review found.

- **5A1. `.tl-tag` undefined — "Get outside lightplaced" on every step.**
  `NudgeFeedScreen.tsx:1303` applies `tl-tag placed|movable`; `grep`
  finds zero `.tl-tag` rules in `globals.css` (the only stylesheet).
  Intended pill renders as unstyled inline text jammed against the title.
  Fix: define `.tl-tag` (+ `.placed` / `.movable` variants) in the cream
  idiom. Sweep suggests siblings: `hero-meeting`, `marks-waiting`,
  `cal-summary`, `cal-summary-num` also count zero in CSS — likely the
  same dropped block. Audit: every `className="…"` literal in the feed
  against `globals.css`; define or remove each miss.
- **5A2. `.cal-summary` / `.cal-summary-num` undefined — "1movable" /
  "1fixed".** `NudgeFeedScreen.tsx:1250–1267`, same verification: zero
  rules. Number glued to label, no grid. Same fix, same sweep.
- **5A3. Zero-case copy — "—post-flight meetings ready".**
  `calendarSummary` returns `"—"` for `readinessLabel` when `total` is 0
  (contract in `domain/hero.ts`, asserted in `tests/hero.test.ts`).
  Honest but cryptic in the unstyled block. Fix at the render: "0 of N
  meetings ready" or "No post-flight meetings today" — contract keeps
  returning `"—"`, renderer translates. B's contract untouched; A's copy.
- **5A4. Light-on-light headings — TRIP HISTORY / MERIDIAN / HANDOFF
  REVIEW near-invisible.** `history/page.tsx:60`, `review/page.tsx:121,140`
  use `text-paper` (#e8eaf2 cream) on `body` #F5EFE6 cream ground.
  Verified: `body { background: #F5EFE6 }`, `--color-paper: #e8eaf2` —
  near-zero contrast, as reported. Fix: dark ink token on light surfaces.
  Note: `/history` + `/review` cards still use dark `Card` chrome
  (`bg-ink-2/3`, `text-paper` inside) — correct on those surfaces; only
  the page-level headings + back-links sit on cream and fail.
- **5A5. History score always green, even 0.00.** `history/page.tsx:114`
  renders `text-pass` unconditionally; three 0.00 "shift complete" runs
  with no day-chips read as passing. Fix: threshold colour
  (fail/warn/pass) + consider filtering zero-day 0.00 runs from the
  user-facing log (failed runs leaking). B-side filter contract if the
  rule needs asserting; A's colour otherwise.
- **5A6. Key warning on /history.** `key={it.id}` (`history/page.tsx:82`);
  localStorage entries use `id: Date.now()`, Supabase rows may lack `id`
  → collision/undefined. Fix: composite key (`savedAt` + index fallback).
  One line, A's file.

### 5B. UX friction (structural — needs a decision each, not just CSS)

- **5B1. CTA over-promises.** "Fit to me → to calendar" triggers a ~45s
  crew run before any `.ics` exists (vision doc already flags: the `.ics`
  is inside the run). Fix options: preview the `.ics` shape pre-run, or
  relabel to the step it triggers ("Lock the plan →"). Product call.
- **5B2. Depth dial is a footer.** Rule 4 calls the dial the interface;
  it sits below the entire timeline. Consider surfacing near the hero.
  Layout, A's file.
- **5B3. Disclaimer stacking.** Sample-tag → "Preview from the sample" →
  "Try this" × N → "banked on preview": four hedges before the fold.
  The wake question answers all of it in one tap — frame as "answer one
  question to make this yours" once, not a disclaimer per element. Copy,
  A's file.
- **5B4. Back-to-back 07:00 asks.** Light 07:00–08:00 + run 07:00–07:40
  read as "a lot at once". Check whether the solver should space them —
  B's domain if the rule changes, otherwise copy mitigation stands.

### 5C. Priority (reviewer's order, verified sensible)

1. 5A1 + 5A2 (CSS definitions — biggest win, smallest effort, main screen).
2. 5A4 + 5A5 (headings + score colour).
3. 5A3 + 5A6 (zero-case copy + key).
4. 5B structural calls (CTA, dial, disclaimers, solver spacing).

Lane note: 5A is almost entirely `globals.css` + `NudgeFeedScreen.tsx` /
`history` / `review` (A's files) with one B-adjacent contract question
(5A5 filter rule, 5A3 translation boundary). B picks up 5B4 only if the
solver rule changes; otherwise allA.

## Round 6 — the four bets (shipped 2026-10-17)

The ranked shortlist — graduate the globe, destination-taste surface,
shareable body-clock passport, arrival as re-engagement — all four now
have committed code. Ship order below, not ranking; bet 2 landed first.

| Bet | Commit | What shipped |
|---|---|---|
| 2 — destination taste | `35724ee` | "Spend your daylight here" strip in the feed, arrival day only, capped at five taste-ranked Qloo venues. No key / no places / thin source renders nothing; destination name falls back to the trip's. Notes only — never feeds scorer or timing. |
| 4 — arrival debrief | `71ac8c5` | `tripDebrief` on `/arrival`: gate score, the single strongest adherence lesson (no done marks → no lesson, never generic praise), carried-in proof from a prior different-route trip, and the "plan your next trip" CTA. Hooks sit above the early returns so the section is null-safe pre-arrival. |
| 3 — body-clock passport | `5f8ea70`, `eb7f6a6` | The share payload carries the hero meeting's body-time delta; `/plan/{id}` leads with "My body thinks it's HH:MM". `opengraph-image.tsx` renders the passport as the link preview (og + twitter cards), from the same share payload — never a figure the card doesn't show. Old shares fall back to the plan summary. |
| 1 — globe graduation | `837c619`, `18b1a35` | The WebGL dawn globe is the home hero, behind one WebGL probe (`src/lib/webgl.ts`). It draws the hero's exact inputs — scrubbed-or-live date, real-or-overridden gap — with the route arc + brand pins (`RouteArc`) and the camera framed on the route through the port-tested `viewBasis` (`center`/`fitSpanDeg`); orbit is off so the canvas never steals page scroll. No WebGL or `?svg=1` → the shipped SVG hero. The sky model + Window Seat ride in the same layer (`tests/sky.test.ts`). `/spike/globe` stays the side-by-side proving ground and flight bench. |

What the round does **not** do: reminder-channel infra (bet 4 ships the
surface the reminder would land on — the channel is still deferred
below), WebGL perf verification on genuinely low-end hardware, and the
real Supabase-backed second trip that lights `carriedFrom` outside the
demo. 368 tests green at `18b1a35`.

## Round 7 — the delight and intuitiveness pass (shipped 2026-10-17, `6d43b41`)

The globe's tooltip becomes an instrument, and the flight gets narration:

- **`localClock` in `domain/timezones`** — a city's own wall clock via
  `Intl` (half-hour zones, DST edges included), pinned by four tests
  against London's real Oct 2026 clock change.
- **Tooltip read-out** — local time, twilight band word + sun altitude
  from the shared solar model, and "one light for N airports" for merged
  metros instead of an em dash. Band vocabulary is unified:
  `SKY_BAND_LABEL` (`domain/sky`) is the single source the tooltip and
  the Window Seat both read.
- **`HoverRing`** — one breathing gold ring anchored at the hovered dot;
  cities stay round and steady, the ring is the only hollow thing.
- **Flight feedback** — hairline along the frame bottom, first-contact
  drag hint that retires on pointer-down and never returns, grab cursors.
- **Window Seat a11y** — panes are labelled figures carrying the computed
  band and altitude.
- **Reduced motion** — the page sits inside `MotionConfig
  reducedMotion="user"`, matching the hero's standard. The WebGL ring
  pulse rides with the globe itself, which is inherently motion.

What no headless check can prove: the ring pulse, hairline and fades
render correctly. One visual pass at `/spike/globe` remains. 372 tests
green at `6d43b41`.

**Follow-up — the landing reads as desktop on desktop.** `.root` carried
a phone-artboard export (`max-width: 868px; min-height: 1543px`), so the
home page rendered as a narrow cream column with forced phone scroll on
laptops — while `/crew` (full viewport, dark) felt right, and travellers
noticed. The hero is already a two-column grid that collapses below
720px; the artboard was strangling it. Released: `max-width: 1140px`,
min-height dropped. Phones are unchanged (the root was 100% wide below
868px anyway). The day-side cream / night-side ink split stays — the
consistency fix is per surface, not one uniform chrome.

## Round 8 — the clock, the loop, and one planner (shipped 2026-10-20)

The four-phase dial brief, landed as six PRs in three groups, plus the two
findings it produced. The commits on `main` are the record.

**The phases.** The domain (the body-clock projection, the citation
catalogue, the evidence seed table, the shift week), the surfaces (the
24-hour dial, the mascot, the daily action card), the wiring (the Clock view,
the mode switcher), and the setup (the five steps, the real provenance tags,
the disclosure). The restyle that came with them was **dropped** — ~1,000
lines of churn in files no phase asked for, with hardcoded hex that broke
night mode and a green "CHECKED" pill on a failing plan.

**The loop.** `/arrival` was repeating the plan's *declared* shift back at the
traveller while the clock showed what the body clock would actually be — two
models answering the same question, and the payoff using the weaker one. The
landing now runs the same projection the clock does, from the same saved plan
and the same baseline, and says the same number. The claim sits beside the
model's answer rather than replacing it.

**One planner.** The replay path — the no-API-key default, and the one the
demo, the eval and the video run on — kept a second, weaker planner of its
own. It could not place a day around a fixed commitment, could step over a
hold, and put an arrival-morning light in the wrong phase zone. With one
planner: shift delivered 50% → **56%** (LHR→HND), 62% → **76%** (LHR→JFK),
64% → **96%** (LHR→MEX), and the landing gap 4.0h → **3.5h**, 1.9h → **1.2h**,
2.5h → **0.3h**.

**The gate.** A day that declares no shift was never checked for the wrong-way
cues, so a light in the wrong phase zone could pass. `WRONG_WAY_CUE` closes
it — and the eval is unchanged, which is what a stricter gate should look
like when the plans in the repertoire are already right.

**The draft is the default.** The live path hands Otto a solver draft, but a
draft in a prompt is a suggestion an LLM can ignore, and nothing said whether
the solver's work survived. The submission's fields are now all optional, so
what the planner does not mention keeps the solver's value, and the drift
rides the `plan_candidate` event for the transcript and the eval.

**Still open, and it is the same kind of thing:**

- **The live path's numbers are unmeasured here.** The `draft kept` column
  needs a provider key to exist. Everything above was verified on the replay
  path, where the plan *is* the solver's.
- ~~**The projection ignores the traveller's own marks.**~~ — **shipped**: the
  clock reads the persisted check-ins (`domain/marks.ts`) and a day whose
  light was missed is no longer counted as shift banked.
- **The shift mode's copy.** "15h of delay owed" is technically right and
  reads like a bug; it wants a treatment, and the per-commitment trade-offs
  only just landed.
- **`SHIFT_OVERSTATED`'s 45-minute tolerance** still lets a plan over-claim
  by three quarters of an hour, and a day's declared zero is still exempt
  from that check. Left alone deliberately: the tolerance is the gate's
  existing contract.

## Round 9 — the crew in view, and the refit (2026-10-31)

- **The crew run is visible on Today.** `CrewTrace` renders the run's newest
  steps inline while the crew works, and collapses to one line when it
  settles (`Crew finished · N days locked · M steps`), which expands on tap.
  The `AgentDrawer` is unchanged and still closed by default. Each run starts
  collapsed, and the page clears its entries at every path that starts a run.
  Not checked in a browser; no test pins the running, expanded, or collapsed
  states yet.
- **Changing the meeting time shows a refit.** The toggle and "Try 16:00" both
  show a "Refitting the day around the 10:00/16:00 meeting…" status for 600ms.
  Reduced motion skips it, using the repo's existing `useReducedMotion`. This
  is a timed message over a synchronous solve, not a real staged reveal of
  windows, clocks and body time. Those would need `DayScene` restructured.

## Round 10 — the crew's work as the artifact, not a feed (2026-10-31)

The run is shown as a feed of events. The field's consensus is to show the
work on the thing it changes. Ideas below are proposals; none are built except
where marked.

- **The contested day (proposed, prototype next).** The day card is the stage.
  The solver's draft (`solverDraft` on `plan_candidate`) renders as ghosted cue
  slots; Otto's merged submission animates the cues from ghost to final
  position. The `drift` fields (`minutesMoved`, `kindsChanged`, `cuesKept`) are
  the animation spec. A FAIL bounces the day back with the violation pinned to
  the cue that broke. **Gap:** the reducer keeps only the latest candidate, and
  the recorded fixture carries no `solverDraft`, so the prototype needs either
  a live recording or a fixture change first.
- **Lanes with a baton pass (proposed).** One lane per agent on a shared time
  axis. A handoff is drawn as a visible baton showing what moved and what was
  dropped. Better than stacked rows for a fixed sequential pipeline only if the
  handoff is the point; a full node graph adds little here and is skipped.
- **Run replay as a labelled film (proposed).** `artifacts/crew-runs/*.jsonl`
  and `Last-Event-ID` already allow replay. A scrubber with playhead, speed and
  pause, labelled "watch a recorded night shift", makes replay honest rather
  than passed off as live.
- **Steering on the artifact (proposed).** Tap a cue and mark it "can't do
  this" or "too early". The unlocked days go back to drafts, re-solve, and
  re-lock on the same stage. Reuses `startDay` and the folded check-ins.
- **The crew asks one question (proposed).** Reuse the `approval_request`
  pause for a single informed question before planning, for example "anchor
  light before or after the 7:30 standup?". The cheapest change with the
  clearest "this is live" signal.
- **Live state outside the run view (proposed).** A menu row such as "Crew ·
  Otto drafting D-2 · 2/5 locked". The run already survives navigation; the UI
  does not say so.
- **Provenance per cue (proposed).** One tap shows who placed, kept and passed
  a cue, with its citation. Extends the existing `evline` data.

What we are not doing: generative UI that has agents emit component JSON. It
solves "no surface exists", which is not this app's gap.

## Round 10 — the agentic surface (direction set 2026-10-31, prototype live on `/dev`)

The user feedback, verbatim: *"it doesn't feel agentic"* and *"not built with
users at its heart."* Both are accurate, and both are structural, not tonal:
the consequential decisions are made by code (solver places, gate judges,
evaluator narrates), the default provider replays a script, and the user's
only channels into the loop are trip params, one wake question, and did/skip
marks. An agent you can't steer, interrupt, or argue with reads as a batch
job with a progress bar — however good the feed's copy is.

**Research base** (named patterns, not vibes): agentic-ux.com (Progress
Ledger), agenticuxpatterns.com (Execution Progress View), affectUI (Agent
Lanes, Plan vs Actual), LukeW's Bench/Intent postmortem — full tool-call
disclosure was "too much," the winning move is work-as-progress-indicator
that collapses once output arrives. Consensus that matters here:

- **Render the work on the artifact, not in a feed.** A feed is what you
  show when there is nothing better to draw.
- **Plan vs Actual** — the proposal as a dashed ghost, reality drawn over
  it. We already *have* this in data (solver draft vs submission vs gate);
  it was just never rendered — drift rode the event as three numbers in a
  log line.
- **Gate the run, not every step** (Perplexity's Modify/Approve). Our
  `approval_request` machinery already suspends and resumes a run — it is
  used for calendar writes and nothing else.
- **Stopping is a state, not an absence.** Name it, keep partial work,
  offer resumption.
- **A run that outlives its screen needs a home** — a list-row with the
  live step is the strongest observed pattern.

### Concepts (ranked)

1. **The day as a contested object** — the day lane IS the stage: solver
   draft as dashed ghost, the submission sliding cues into place (drift as
   motion, not a number), the gate stamping PASS or bouncing FAIL with the
   violation pinned on the cue that broke. Prototype: `ContestBench` in
   `src/components/dev/ContestedDay.tsx`, mounted on `/dev` — real
   `solveDay` + `evaluatePlan`, only the planner's moves scripted. Required
   contract landed: `plan_candidate` now carries `solverDraft` (additive;
   absent on replay and on solver-infeasible days), stored on `ShiftDraft`
   in the reducer.
2. **Steering on the artifact** — tap a cue → "can't do this / too early" →
   unlocked days visibly go fluid and re-solve on the same stage. The
   replan path exists (`checkins` + `startDay`); the *visible re-drawing*
   is the agentic payoff. Add constraint chips that fold into the
   adherence floor ("no light before 06:00").
3. **The crew asks before it locks** — **contract shipped**: `crew_question`
   / `crew_answer` events, `src/lib/crew-questions.ts` (5-minute TTL — the
   run is watched live, so an unanswered question lets the crew decide),
   `POST /api/crew/answers`, `CrewQuestionCard` mounted on Home and `/crew`
   beside the approval card, the wedge watchdog yielding while a question
   is open, and run cancellation resolving pending questions as skipped.
   The first real question is the compliance-floor check after the analyst
   (fresh eastward runs, floor > 05:45): "your log says asks before 07:00
   get skipped — still right?" and the pick moves
   `ignoresInterventionsBeforeMin` for that run. Cheapest change with the
   highest "this is alive" signal — a scripted system cannot ask a
   question about *your* data.
4. **Rex edits the calendar in view** — `proposeMove` slides the event on
   `CalendarLens` while his reason captions it. Watching an agent move
   *your* meeting is the most felt-agentic beat available; today it is a
   text line.
5. **Run replay as honest film** — the scrubber already exists on `/dev`
   (`FixtureScrubber` + `useFixturePlayback`). Graduate it: labeled
   playback of recorded runs (`artifacts/crew-runs/*.jsonl`, the 2h window)
   rather than replay-as-live. Fixes the replay deception by making it a
   feature.
6. **Live state outside the run view** — menu row during a run ("Crew ·
   Otto drafting D-2 · 2/5 locked"); push on `done` when VAPID is
   configured.
7. **Provenance per cue** — extend `.evline`: "placed by solver · kept by
   Otto · Eastman 2005 · passed gate". The crew's *standards* made legible.
8. **Flight strips** — one strip per agent turn passed down a rail, showing
   what went along and what was dropped. Deferred: nice genre fit (the
   crew is already aviation-flavoured) but the contested day delivers the
   same legibility with less chrome.
9. ~~Agent lanes / node graph~~ — skipped deliberately. The pipeline is
   fixed and sequential; lanes add engineering eye-candy over strips'
   legibility.
10. ~~Generative UI (agent-emitted component JSON)~~ — skipped. It solves
    "no surface exists"; we have purpose-built surfaces.

### Rules the surface is held to

- **Nothing is decorative still binds.** Every element in the contested day
  is an event: ghost = solver output, slide = drift, stamp = gate verdict.
- **Every visual read exists as words** — the `.evline` provenance under
  each row *is* the read; the animation is the enhancement. `RunAnnouncer`
  keeps speaking the run.
- **Honest provenance.** The bench caption says which parts are live
  (solver, gate) and which are scripted (the planner's move). If replay
  playback ever ships as a surface, it is labelled playback — simulated
  agency discovered is worse than none claimed.
- **The gate stays the gate.** No concept may let a user move a cue past
  the scorer — steering submits constraints and replans through
  `evaluatePlan`; it never edits a locked plan around it.

### Item split (when this round gets staffed)

- **B first — contracts.** `solverDraft` on `plan_candidate` is done.
  Remaining: a `crew_question` event reusing the approval seam (concept 3),
  a `replan-preview` payload or a cheap way to show fluid-days before the
  replan's first `plan_candidate` lands (concept 2).
- **A second — renders.** Contested-day graduation from `/dev` into the
  ShiftBoard row (it already owns drafts/scan/bounce — the ghost layer is
  the missing piece, not a new surface), CalendarLens live-edit animation,
  the menu's live-run row.
- **Do not** build concept 2's tap-to-constrain until the check-in→replan
  path is visible end-to-end in a browser — the engine is real but the
  full loop has never had a visual pass.

## Later / deferred

- **Visual pass on `/spike/globe`** — the ring pulse, flight hairline and
  tooltip fades are shader/DOM effects this host cannot render headlessly;
  one human look confirms they read right (round 7).
- **Reminder channel** — no notification infra exists; don't fake a control.
- **Cross-trip summary** — only surface "the crew remembers" from real prior
  runs in the graph; needs a second real trip's data. Unblocked now that #3
  scopes memory per traveller — still needs the second trip.
- **Orphaned routes** — `/dev` and `/team` are complete with zero inbound
  links; `/crew`'s "Trip Setup" pill links to `?screen=setup`, which nothing
  reads. Link or hide.
- **Video re-record** — shot list refreshed (hackathon-submissions.md §One
  video for all): check-in loop is the signature shot, flight picker is real,
  memory is per-traveller. Record after item 7 lands — the arrival surface is
  the payoff.

## Closed (debt swept 2026-10-17)

- ~~Post-landing body-clock model~~ — phase chain in the scorer + post-flight
  draftDay branch; evals show JFK westward now covers 100% of the shift.
- ~~Phone-first check-in card~~ — per-step did/skip ledger flushes as
  structured CheckIns into the replan path. Scoping gap tracked as #3 above.
- ~~`SHIFT_DIRECTION_FLIP` edge~~ — flips now judge against trip direction;
  correct-back no longer double-flags.

- ~~`meridian:completedNudges` cross-trip leak~~ — trip-scoped key.
- ~~`totalDays={5}` hardcode~~ — derived from the trip payload.
- ~~`.qoder/` lint warnings~~ — added to `globalIgnores`.
- ~~Hero fold/barrenness~~ — `.hr-col` layout fix + `dawn-layers` shared
  primitive + interaction pass (shipped `5ccf7a6`).