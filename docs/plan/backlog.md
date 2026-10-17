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
| `src/app/page.tsx` (860 lines) | 1, 2, 4, 6, 7, 9 |
| `src/components/NudgeFeedScreen.tsx` (947 lines) | 6, 10 |

Everything behind those — `src/domain/`, `src/app/api/`, `/outcome`, a11y
infrastructure — is genuinely disjoint and parallelises without merge pain.

**Track A — the landing journey.** Owns `page.tsx` + `NudgeFeedScreen.tsx`.
Items 1, 2, 5, 10, 6 (surface half), 7. Mostly small; **7 is the headline**,
because the product currently stops at the plan.

**Track B — data honesty and the loop.** Owns `src/domain/`, `src/app/api/`,
`/outcome`, a11y infrastructure. Items 3, 8, 4, 9, plus real integrations on
the side. **3 is the headline**: one visitor's compliance marks currently move
everyone else's floor.

**The seam — item 6 crosses the line and needs a contract.** B owns the domain
half (stop `resolveBaseline` silently defaulting to `GARMIN_BASELINE`, make "no
baseline" a real state); A owns the surface half (ask the question inline).
**B lands first.** It is a breaking change that introduces new empty states, so
building the UI against the fabricating default just means rebuilding it after.

**Sequence.** Day 1: items 1 + 2 (shipped `4ba7b35`). Items 3, 5 and 8 are
also done — 3 as `4933774`, 5 as `deee7d9`, 8 as `1be902c`. Remaining: item 6
(still blocked — its `resolveBaseline` domain half has not landed), then 4, 7,
9, 10. **7 follows 3 and 6** — an arrival screen that claims "the crew learned
from your week" is worthless if the week belongs to whoever used the demo last.

**Coordination.** Only A edits `page.tsx` / `NudgeFeedScreen.tsx`; B files the
change and A picks it up. One item straddles by necessity: **4** is B's (the
API thread-through and `getFlightRecommendations` are domain work), but
sending `selectedFlightId` needs a line in `page.tsx` — B drafts it in a branch
and A lands it, or A takes that hunk on request. Rebase on `main` daily — a
second agent has been committing concurrently and has already touched
`api/crew/checkin/route.ts` and `tests/adherence.test.ts`, which is B's
territory. B owns test additions; A owns visual checks.

**Don't** split item 7 (one surface telling one story; shared authorship is
mush), start with item 9 (fiddly, low-visibility — it's a filler task, not an
opening move), or build the Garmin connector in tandem (timebox B's spike to a
day: the real question is whether anyone connects one at all, not how to parse
the file — if the answer is no, spend that day on item 4 instead).

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
4. **B → A** · **Flight-window picker is decorative** — **B's half shipped**:
   every recommendation now carries `departMin`/`arriveMin`;
   `flightWindowFor` resolves ids direction-scoped (wrong-direction/stale ids
   → null); `applyFlightChoice` moves the flight event on demo + neutral
   calendars; `?flight=<id>` works on `/api/trip` and `/api/crew/run`, and the
   trip payload echoes the applied `flightId`. **A's remaining bits**: send
   `selectedFlightId` on both requests (their WIP already does) and fix the
   direction-blind `"midday-afternoon"` default — `recommendedFlightId` =
   `getFlightRecommendations(trip).find(r => r.recommended)?.id`.
5. ~~**A** · **Route-level failure surfaces**~~ — shipped `deee7d9`:
   `src/app/error.tsx` for the page segment (inside the root layout, so the
   document and stylesheet survive) and `src/app/global-error.tsx` as the last
   resort, styled inline because globals.css may be what failed. No root
   `loading.tsx` on purpose — no page suspends here, so it would be dead code
   that only flashes on navigation.

## Next — the product gaps

6. **B → A** · **Ask the one personalisation question** — a cold visitor is auto-given
   LHR → HND plus a fixture wearable (`/api/trip` hardcodes
   `baselineSource: "fixture"`) and is never asked anything. ~~`resolveBaseline`
   defaults to `GARMIN_BASELINE`~~ **B's half shipped `9afa6c3`**:
   `resolveBaselineState` returns `{ baseline, kind }` — garmin / wake-band /
   demo-default (a labelled state, not "absent"; replay needs the fixture).
   `baselineKind` rides `run_start` → run state, and `/api/trip` exposes it.
   **A's surface half remains**: ask the wake question inline the first time a
   number depending on it is shown (vision Rule 1: keep the demo trip).
7. **A** · **The landing payoff** — "Land at 100%" is promised in the nav and never
   cashed. Post-flight days now preview, so the maths for landing exists, but
   there is no arrival surface and nothing navigates to `/outcome` when a
   trip's last day passes. This is the vision's Window Seat ending.
8. ~~**B** · **Gate `/outcome`, and stop lying in it**~~ — shipped `1be902c`:
   no saved plan → "nothing to grade yet" card; sliders start unset and save
   stays disabled until both are real answers; "saved" only fires when the
   check-in POST lands, otherwise it admits the local-only record.
9. **B → A** · **Announce the run** — **B's half shipped**:
   `src/components/RunAnnouncer.tsx` diffs run state into polite `aria-live`
   sentences (start, day locked, redraft, replan, error, plan ready) and
   renders nothing visible; `src/lib/a11y.ts` exports `useFocusTrap` (initial
   focus, Tab cycle, restore on close). **A's mount lines**: drop
   `<RunAnnouncer run={run} />` anywhere `run` reaches on `/`, and attach
   `useFocusTrap(panelRef, setupOpen)` to the `.sheet-panel` div (the
   `aria-modal` Edit sheet) — `.sr-only` already exists in globals.css.
10. **A** · **Colour-only verdicts** — `.evchip.pass` / `.evchip.warn` render
    byte-identical text (`NudgeFeedScreen.tsx:905-907`); only colour
    distinguishes them. `CrewFeed`'s PASS/FAIL badge already does it right.

## Next steps (carried)

- **Real integrations** — Garmin (fixture + wake band bridges today) and real
  flight inventory (qualitative windows only, by design). The honest boundary
  is already in the UI; these close it.

## Later / deferred

- **Reminder channel** — no notification infra exists; don't fake a control.
- **Cross-trip summary** — only surface "the crew remembers" from real prior
  runs in the graph; needs a second real trip's data. Unblocked now that #3
  scopes memory per traveller — still needs the second trip.
- **Orphaned routes** — `/dev` and `/team` are complete with zero inbound
  links; `/crew`'s "Trip Setup" pill links to `?screen=setup`, which nothing
  reads. Link or hide.
- **Video shot list / script** — predates the overhauled layout; refresh before
  re-recording.

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