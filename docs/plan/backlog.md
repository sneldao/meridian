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

**Sequence.** Day 1, before anything else: A lands 1 + 2 as one small PR —
forty-five minutes, unblocks keyboard users, and is the cheapest possible
branch-starter. Week 1: A → 5, then 6 once B's domain half is in; B → 3, 8,
then 4. Week 2: A → 7; B → 9. **7 follows 3 and 6** — an arrival screen that
claims "the crew learned from your week" is worthless if the week belongs to
whoever used the demo last.

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

1. **A** · **Space keydown hijack** — `src/app/page.tsx:436-438`. A global listener
   `preventDefault()`s Space on *keydown* and fires `startShift()`. Buttons
   activate on Space *keyup*, so this suppresses activation of every button on
   the page (Personalise, Done ✓, day pills, Menu, Edit). Keyboard users cannot
   press any of them. Skip when the target is a button/link/`SELECT`, or drop
   the global handler.
2. **A** · **Reset phase on stream failure** — `src/app/page.tsx:367-370`. `es.onerror`
   closes the stream but never calls `reset()`, so `phase` stays `"running"`,
   the CTA stays `disabled`, and `beginStream` early-returns. A mid-run network
   drop leaves the only escape as Escape or a reload. Also surface the error on
   the Today surface — it currently only reaches the closed-by-default
   `AgentDrawer`.
3. ~~**B** · **Identify the traveller before "the crew learns"**~~ — shipped
   `4933774`: `meridian-tid` cookie → `x-meridian-tid` header via middleware;
   memory files, the fold, graph writes, run records, `/api/memory` all scope
   by it. `?tenant=` stays the explicit override.
4. **B** · **Flight-window picker is decorative** — `selectedFlightId`
   (`src/app/page.tsx:88`) never reaches `tripQuery`/`beginStream`, so it has
   zero effect on any plan. And `getFlightRecommendations` returns `-west` ids
   for westbound trips while the default is `"midday-afternoon"`, so nothing
   renders as selected on a westbound route. Thread it through
   `/api/crew/run` or delete the sheet.
5. **A** · **Route-level failure surfaces** — no `error.tsx`, `global-error.tsx`, or
   `loading.tsx` anywhere in `src/app`. Any uncaught render throw takes the
   whole route down with no styled recovery.

## Next — the product gaps

6. **B → A** · **Ask the one personalisation question** — a cold visitor is auto-given
   LHR → HND plus a fixture wearable (`/api/trip` hardcodes
   `baselineSource: "fixture"`) and is never asked anything.
   `resolveBaseline` defaults to `GARMIN_BASELINE`
   (`src/domain/fixtures.ts:152`), so there is no absent-baseline path at all.
   Per vision Rule 1: keep the demo trip, ask the wake question inline the
   first time a number depending on it is shown.
7. **A** · **The landing payoff** — "Land at 100%" is promised in the nav and never
   cashed. Post-flight days now preview, so the maths for landing exists, but
   there is no arrival surface and nothing navigates to `/outcome` when a
   trip's last day passes. This is the vision's Window Seat ending.
8. **B** · **Gate `/outcome`, and stop lying in it** — it renders a full self-report
   with no trip and two sliders pre-set to the middle, so an accidental save
   records a fabricated neutral score; `setSaved(true)` fires regardless of
   whether the POST succeeded (`src/app/outcome/page.tsx:16-17,53`). It never
   reads the saved plan, so it grades nothing it displays.
9. **B** · **Announce the run** — exactly one `aria-live` region exists in `src/`
   (`CrewFeed.tsx:63`) and it renders only inside the closed-by-default
   `AgentDrawer`, so a screen-reader user gets silence through the longest
   operation in the app. Related: no `.focus()` anywhere in the codebase, so
   the `aria-modal="true"` Edit sheet has no focus trap, no initial focus, no
   restoration, and no `inert` background.
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