# Backlog — open items after the home overhaul + any-route pass

Everything from the 2026-10-15→17 home overhaul, signature pass, and
any-route pass is shipped on `main` (history in git; old plans were deleted
in the doc consolidation). These are the items that remain open.

## Product gaps

- **Post-landing body-clock model** — the engine treats the sleep window as
  a body-clock proxy, so `previewPlan` intentionally returns `null` for
  post-flight days ("Planned with you after you land") and `solveDay` can
  draft an unusable D+1 (e.g. bed 04:55 / wake 11:45 Tokyo). Real fix is a
  design task: model circadian phase separately from the sleep window.
- **Phone-first check-in card** — consumer-appeal P2, deferred: a one-tap
  "did it / skipped" surface so the morning check-in isn't buried.
- **Reminder channel** — deferred: no notification infra exists; don't fake
  a control.
- **Cross-trip summary** — deferred until a second real trip exists; only
  surface "the crew remembers" from real prior runs in the graph.

## Engine / scorer

- **SHIFT_DIRECTION_FLIP hold-then-resume** — partially fixed (hold followed
  by a same-direction shift no longer blocks); a zero-shift first day can
  still read as a direction flip on later eastbound days in one edge case.
  `src/domain/circadian.ts`.
- **Real integrations** — Garmin (fixture today; wake band bridges the gap),
  real flight inventory (qualitative windows only — by design).

## Debt

- ~~`meridian:completedNudges` cross-trip leak~~ — done: trip-scoped key.
- ~~`totalDays={5}` hardcode~~ — done: derived from the trip payload.
- ~~`.qoder/` lint warnings~~ — done: added to `globalIgnores`.
- Video shot list / script — predates the overhauled layout; refresh before
  re-recording.
