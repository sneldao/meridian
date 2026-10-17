# Backlog — next steps and open items

Everything from the 2026-10-15→17 home overhaul, signature pass, and
any-route pass is shipped on `main` (shipped plans deleted in the doc
consolidation; commits are the record). These are the items that remain.

Design direction lives in [docs/vision.md](../vision.md); current-state facts
in [docs/reference/](../reference/).

## How to split this between two

The split follows **file ownership, not topic**. Two files absorb almost every
item below, so each gets exactly one owner and nobody else opens them:

| File | Items that touch it |
|---|---|
| `src/app/page.tsx` (962 lines) | 1, 2, 4, 6, 7, 9 |
| `src/components/NudgeFeedScreen.tsx` (947 lines) | 6, 10 |

Everything behind those — `src/domain/`, `src/app/api/`, `/outcome`, a11y
infrastructure — is genuinely disjoint and parallelises without merge pain.

**Track A — the landing journey.** Owns `page.tsx` + `NudgeFeedScreen.tsx`.
**Items 1–10 are all shipped.** The board is empty; what remains is the
deferred list below.

**Track B — data honesty and the loop.** Owns `src/domain/`, `src/app/api/`,
`/outcome`, a11y infrastructure. Items 3, 4 (domain half), 6 (domain half),
8, 9 (domain half) all done, plus the Garmin upload path. B's board is clear.

**The seam — items 4, 6 and 9 each cross the line with the same contract.**
B owns the domain half, A owns the surface half, and **B lands first** because
each domain change introduces states the UI has to render honestly. Item 6's
half has landed (`resolveBaselineState` → garmin / wake-band / demo-default), so
its surface half is now unblocked.

**Sequence.** Shipped so far: 1 + 2 (`4ba7b35`), 5 (`deee7d9`), 4 (`36563d0`
on top of `c675c45`), 9 + 10 (`0a0c680`), and from the other lane 3 (`4933774`),
6-domain (`9afa6c3`), 8 (`1be902c`), 9-domain (`RunAnnouncer` + `useFocusTrap`),
the Garmin upload path (`92299c3`), and 7 (the arrival payoff). **Nothing is
open on the board** — the sequence ran 1 → 10 and closed every item, 7 last as
planned: an arrival screen that claims "the crew learned from your week" is
worthless if the week belongs to whoever used the demo last, and 6 is what made
the first number on the page the traveller's own.

**Coordination.** Only A edits `page.tsx` / `NudgeFeedScreen.tsx`; B files the
change and A picks it up. Rebase on `main` daily — a second agent commits
concurrently and has touched `api/crew/checkin/route.ts`, `tests/adherence.test.ts`,
`domain/fixtures.ts`, `domain/nudges.ts` and both API routes.

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
wasted pass on item 4). Item 9 used to be the "don't open with this" filler;
that advice is retired, because its domain half has landed and all that remains
is two mount lines — it is now the cheapest item on the board and a good place
to start.

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

## Next steps (carried)

- **Real integrations** — **Garmin: upload path shipped `92299c3`** —
  `POST /api/wearable` takes a sleep CSV → per-tenant baseline →
  `/api/trip` answers `baselineSource: "garmin"` + kind `garmin`. Remaining:
  A's upload affordance in TripSetupScreen, and the answer to the spike's
  real question — Garmin Health API is partner-gated, so file export is the
  demo path either way. **Flight inventory**: windows are now real planning
  inputs (`?flight=` threads through `c675c45`); live inventory remains
  deferred by design.

## Later / deferred

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