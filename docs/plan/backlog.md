# Backlog — next steps and open items

Everything from the 2026-10-15→17 home overhaul, signature pass, and
any-route pass is shipped on `main` (shipped plans deleted in the doc
consolidation; commits are the record). These are the items that remain —
the first four are the agreed next steps.

## Next steps

1. **Post-landing body-clock model** — the engine treats the sleep window as
   a body-clock proxy, so `previewPlan` intentionally returns `null` for
   post-flight days ("Planned with you after you land") and `solveDay` can
   draft an unusable D+1 (e.g. bed 04:55 / wake 11:45 Tokyo). The fix is a
   design task: model circadian phase separately from the sleep window so
   the solver and preview produce real post-landing days.

2. **Phone-first check-in card** — consumer-appeal P2, deferred: a one-tap
   "did it / skipped" surface so the morning check-in isn't buried in the
   feed. Feeds the existing `checkins → replan` path.

3. **`SHIFT_DIRECTION_FLIP` edge** — `src/domain/circadian.ts`. A zero-shift
   first day can still read as a direction flip on later eastbound days.
   Hold-then-resume is fixed; this is the remaining edge — scorer fix + a
   failing-then-passing test.

4. **Real integrations** — Garmin (fixture + wake band bridges today) and
   real flight inventory (qualitative windows only, by design). The honest
   boundary is already in the UI; these close it.

## Later / deferred

- **Reminder channel** — no notification infra exists; don't fake a control.
- **Cross-trip summary** — only surface "the crew remembers" from real
  prior runs in the graph; needs a second real trip's data.
- **Video shot list / script** — predates the overhauled layout; refresh
  before re-recording.

## Closed (debt swept 2026-10-17)

- ~~`meridian:completedNudges` cross-trip leak~~ — trip-scoped key.
- ~~`totalDays={5}` hardcode~~ — derived from the trip payload.
- ~~`.qoder/` lint warnings~~ — added to `globalIgnores`.
- ~~Hero fold/barrenness~~ — `.hr-col` layout fix + `dawn-layers` shared
  primitive + interaction pass (shipped `5ccf7a6`).
