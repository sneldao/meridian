# Any-route pass — make "change my trip" fully real

> **SHIPPED 2026-10-17** — horizon (`horizonFor`, `buildTrip` opts), neutral
> calendar (`neutralCalendarFor`), connect-state line, picker confirmed
> type-ahead. Commits `cabdae8`, `a62d8a5`, `45f50a0`.

2026-10-17 · Follow-up to [home-signature-pass.md](home-signature-pass.md)
(shipped). Route changes already work end-to-end for any of 1,145 airports:
the picker, `/api/trip?origin&dest&date`, `buildTrip`, solver, scorer, dawn
panel, and city labels are all trip-parameterized, both directions (evals
cover LHR→JFK west, LHR→MEX west-south, LHR→HND east). What's left is the
fixed-shape tail.

## A. Parameterized trip horizon (the main lift)

Today `buildTrip` emits a hardcoded shape: `["D-3","D-2","D-1","Flight","D+1"]`,
`departureDayIndex: 3`, check-in bound `dayIndex ≤ 4`. Someone flying tomorrow
or in three weeks is squeezed into it.

- `buildTrip(origin, dest, date, { preFlightDays?, postFlightDays? })` —
  pre-flight defaults to min(3, days-until-departure) when the departure is
  sooner; post-flight extends to however many days the residual shift needs
  (`requiredShiftMin / ~60–90 min per day`, bounded, e.g. 1–5). Day labels
  stay `D-n / Flight / D+n`; `departureDayIndex` derives from the array.
- Ripples to check: `run` route `dayIndex` bounds, `checkins` schema,
  `selectedDayLabel` init, `previewPlan` chain length, day-strip rendering,
  `meridian:completedNudges` day-keying, the replay transcript (fixture-shaped
  5 days — keep it pinned to the fixture trip).
- Tests: a 2-day-out trip, a >7-day-out trip, a same-week westbound.

## B. Neutral default calendar

`calendarFor(trip)` injects Alex-flavoured events for *every* route — "Team
breakfast", "Dinner with Sarah", the destination "client pitch". Honest via
the sample tag, but not *their* trip.

- Rename/rebuild the fixture as a **neutral traveller calendar**: generic
  standup, one evening social, one fixed commitment on D+1 in destination
  time. Keep `DEMO_TRIP`+`CALENDAR` as the canonical demo fixture for
  tests/replay; the consumer path gets the neutral one unless `google`
  calendar is connected.
- When `calendarSource === "fixture"` and the trip isn't the demo route,
  the sample tag should say *"sample calendar — connect yours to personalise"*.

## C. Real connections (the real fix for B)

Google Calendar exists (`fetchCalendar`, `calendarSource: "google"`);
Garmin is fixture-only.

- Surface connect state in the setup sheet: "Calendar: connected / sample"
  and "Wearable: connected / sample" — one line each, never silently fixture.
- Garmin path stays future work; the wake band (shipped) covers the
  personalisation gap meanwhile.

## D. Picker UX

- 1,145 airports is a noisy list — filter the picker to a curated set
  (~50–100 major hubs) with a "more…" expansion, or a search field. Check
  `RoutePicker`'s current behaviour first; it may already filter.
- `?origin=&dest=` is already a shareable URL — worth a "share this trip"
  affordance on the trip chip later; not required for this pass.

## Order + lanes

A → B → D small → C surface. Engine-shaped items (A, B fixtures) are Dev 1;
feed/surface wiring (B tag copy, C sheet lines, D picker) Dev 2/3 as
applicable. Same gates: typecheck, lint, `bun test`, replay:check stays
green (fixture-pinned), live check at 1280px/390px.
