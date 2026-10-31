<!-- ASPIRATIONAL — target experience and design rules. This is where we are going, not where we are. Current-state facts live in docs/reference/; the work items live in docs/plan/backlog.md. Successor to docs/archive/design-vision.md, which stays frozen as the hackathon-era record. -->

# Product vision — arrive better adjusted

**Status:** live direction. The Home UX pass described in
[docs/plan/backlog.md](plan/backlog.md) supersedes the historical stages in
this doc — specifically auto-demo entry, the depth dial as persistent chrome,
and the interactive clock view. Dated round references below are history,
not the current contract. What "verified" means today: pure-function tests,
SSR markup checks, typecheck/lint/build — no browser or user QA is claimed
here or anywhere below.
**Companion:** [design-vision.md](archive/design-vision.md) (the visual primitives)

The archived vision won the interesting argument: **nothing is decorative** — the
sun, the terminator, the ghost dawn and the residual are all real or modelled,
and the ghost line closing across the planet is the image Meridian is
recognised by. That is still true and still the asset.

This doc covers the half that was never specified: **the journey around the
image.** The vision doc describes three worlds and ends on the Window Seat —
the first morning in the destination. The build currently stops at the plan.
Everything below is about closing that gap, and about being honest in the
seams where we haven't closed it yet.

---

## 1. The four rules

These are the constraints I'd hold every design decision to. They came out of
the dawn-panel work, where they were the difference between an instrument and a
screenshot.

### Rule 1 — One question, at the moment it first matters

Not a wizard, not an onboarding tour — but a trip first. A cold visitor now
meets an explicit entry ("Arrive better adjusted."): two airports and a date,
one Continue. Personalisation comes *after* the route is theirs, as the one
inline question on Today. The example stays one tap away and is always honest
— it is built locally, saves no traveller trip or action data, and can never
run the crew.

But the demo profile must never masquerade as the person. The saved route,
the remembered wake answer and the plan's own baseline provenance decide what
the numbers are; nothing fabricated is presented as measured.

So: the example stays, the honesty tag stays, and the personalisation
question appears *inline* the first time a number that depends on it is
shown. One question, three chips, skippable, remembered.

> The trust rule underneath it: **a number the app invented is never presented
> as a number the traveller measured.** `TripSetupScreen` already carries the
> comment *"No invented values anywhere"*; the app boundary should honour it.

### Rule 2 — Every visual read also exists as words

The globe is not the source of truth. The caption beneath it is. Interaction
is layered **on top of** a complete written read, never as a replacement for it.

This is why the dawn panel is acceptable today with a reduced-motion setting, a
keyboard, or a screen reader: hover, drag and scrub are enhancement; the gap in
words is the product.

Corollary: **never let an interaction be the only route to a fact.** Two
deliberate consequences already shipped and worth keeping:

- Drag-to-recentre binds only on `(hover: hover) and (pointer: fine)`. A
  `touch-none` card mid-page would steal the page scroll, which is a far worse
  bug than a globe that doesn't spin on a phone.
- The scrubber is two native `<input type="range">` elements, so arrow keys,
  Home/End, screen-reader announcements and touch dragging all come free instead
  of being hand-rolled and half-working.

### Rule 3 — Respond to input; don't perform

The landing hero spins because *you* moved it. It does not idle-animate behind
body text. `/crew` earns continuous motion because it is a dedicated surface
with a stage to run. Same system, different budget — the rule is that motion
must be either caused by the traveller or be the thing the screen exists for.

This also keeps the hero honest: no rAF loop, no re-render of a planet every
frame for a line that moves once a minute.

### Rule 4 — Explanation is progressive, not a dial

The old Rule 4 was a persistent depth pill (Calm / See why / Watch the crew)
as global chrome. What survives of it is the principle, recast: **Today is
always the action surface; depth unfolds beneath it.** The body-clock
projection is an opt-in `<details>` explanation that shares Today's data;
the operator surface is a menu tap to `/crew`; `?depth=guided` still
deep-links the visuals. No global mode picker is shown; a legacy remembered
Guided preference and `?depth=guided` remain supported.

The ordering lesson stands: the first number must be *theirs*, which is why
the entry form exists before any plan preview is actionable.

---

## 2. The journey we are actually selling

The promise is "Arrive better adjusted" — made on the entry form and cashed
on the arrival screen. The loop:

| Stage | Where | What must be true | |
|---|---|---|---|
| **Enter** | `/` | An explicit trip: two airports, a date, Continue — or the honest example. | ✅ |
| **Orient** | `/` hero | The residual is legible: how far behind your dawn is, and how much is banked. | ✅ |
| **Personalise** | `/` Today | One inline question; the crew run is watchable — progress is *announced*, not just animated, and a dropped stream never bricks the button. | ✅ |
| **Live the shift** | `/` Today | One step, one tap. Taps persist on a trip-scoped ledger attributable to the traveller. | ✅ |
| **Understand** | `/` details | The body-clock explanation below Today — read-only, same marks, opt-in. | ✅ |
| **Land** | `/arrival` | **The payoff.** First morning in the destination, scored against what was promised at the gate. | ✅ |
| **Reflect** | `/outcome` | Reached from the arrival screen, where arriving makes it meaningful. Shows the plan it is grading. | ✅ |

The engine side of most of this is now true: the residual is legible, taps
persist and are attributable, a stalled run can't strand anyone, the run is
announced as it works, the self-report can't fabricate a score, and the one
question is asked and answered.

**Every stage is now built.** The current journey runs Enter → Orient →
Personalise → Live the shift (+ optional Understand) → Land → Reflect. The
plan carries estimates with an uncertainty band — it never promises a fixed
level of adaptation.

`/arrival` is the moment the whole thing was built toward: the residual the hero
counted down for days is settled, the two dawn lines have fused, and the score is
stated against the gate's own promise. It opens automatically once the last
planned day has passed — and importantly it stops *offering steps* on Today from
then on, because past the last day "your next step is 07:00" is fiction. The
surface that had something to do becomes a surface that has finished.

### What landing cost, and what it found

The arrival screen is the only place the product makes a claim about a
traveller's trip after the fact, and building it turned up three things worth
keeping:

- **The promise had to be persisted to be honest about.** The briefing always
  carried `coverage`; `meridian:lastPlan` dropped it. So the one number that
  matters after landing existed only in memory. It is saved now, and a plan
  predating it reports *no promise* rather than a zeroed one — because "the crew
  promised nothing" is a different and wrong statement.
- **Time is the destination's, not the viewer's.** A 21:00 Tokyo landing is not
  still "D-1" because it is lunchtime in London. Judging at the wrong clock makes
  the payoff arrive a day late, or not at all.
- **Count dates, don't divide minutes.** Days-remaining by elapsed-minute
  division drifts by one whenever the local time isn't midnight — which made a
  finished trip claim "1 day left" directly above copy saying "That's the trip."

Both off-by-ones were invisible in review and obvious in the browser. Worth
remembering: for anything that reads as a date on a traveller's timeline, test
the *boundaries* (the last day, the first morning, a non-midnight clock) rather
than a single mid-trip date.

---

## 3. Where the loop is open

Design consequences of implementation choices, so they belong here rather than
only in the backlog. Several of the sharpest ones have since been closed — kept
in place because the *shape* of the failure is the lesson.

### Closed: the loop couldn't tell whose it was

Per-step did/skip marks flush as structured check-ins, but `recordCheckIn`
appended to a **single global `artifacts/crew-memory.json`** and
`foldCheckIns` folded *every* visitor's marks into one adherence profile. One
traveller skipping a 6am light moved the compliance floor for everyone else.
Now scoped by a `meridian-tid` cookie through the memory files, the fold, the
graph writes and the run records (`4933774`).

The lesson generalises past check-ins: **"the crew learns" was a claim the
architecture couldn't honour.** If any future feature says "remembers", the
traveller identity has to be in the path that backs it.

### Closed: failure was invisible, and one failure was terminal

A dropped stream never reset `phase`, so the CTA stayed disabled with Escape or
a reload as the only escape — and errors only reached a drawer that was closed
by default. Worse, **the cause was never the network**: the stream stays open
while the server waits on an optional write, so `onerror` couldn't see it. With
FalkorDB down, the run blocked after the briefing — no `done`, no artifacts, a
disabled button and no message. Optional writes are now bounded, and the client
treats *silence* as a failure in its own right (`4ba7b35`). Routes also have
error boundaries now, so a render throw is recoverable rather than terminal
(`deee7d9`).

### Closed: the flight picker didn't control anything — twice

`selectedFlightId` never reached the API, so the control had no effect on any
plan, and its hardcoded default was an *eastbound* id, so nothing rendered as
selected on a westbound route. Threading it through exposed a second, deeper
instance of the same bug: the server moved only the *fixture's* flight event,
so on a connected Google calendar — hash ids, a carrier title like
`BA005 LHR → HND` — it moved nothing while still echoing the chosen id back as
valid (`36563d0`).

Worth keeping as a rule: **fixing a layer and trusting its success signal is how
the next layer survives.** The first fix made the API look correct, which is
exactly what hid the second bug.

Still open in this family:

- **The wake question** is asked only in the Edit sheet, on a surface the landing
  never sends you to. Its domain half has landed; the surface half hasn't.
- **`/dev` and `/team`** are complete routes with zero inbound links.
  (`/shift` is the opposite case: it got its own door because a mode switch
  inside the travel view made two products look like one.)
- **`/crew`'s "Trip Setup"** links to `?screen=setup`; nothing reads `screen`.

A control that looks load-bearing and isn't is worse than a missing one: it
spends trust.

### Closed: the setup was a form, and the phone had no way to navigate

The setup was a modal with four steps of sliders, and the app on a phone was
a document with a menu in the corner — out of thumb reach, on the surface
people actually install it on.

The setup is now a **sequence of scenes**: one question per screen, a progress
bar, a back button, and the **dial itself as the answer** to the first
question. The dial stops being decoration and becomes the interface — the
same picture everywhere, learned once. And the mascot now reacts to the
*traveller's answer* ("You sleep like most people, and that actually helps
for a big eastward shift") instead of to a generic state, so a lark and a
night owl are told different true things.

The lesson generalises: **an answer you can only give with a mouse is an
answer some people cannot give** — the dial's handles are focusable sliders,
so the whole setup works from the keyboard. And a control that is out of reach
is a control that does not exist, however good it looks on a desktop.

Two more came out of the same reference: the phone gets a **tab bar** rather
than a corner menu, and the day switcher shows **how far off each day leaves
you**, not just which day it is. A row of labels says which day is which; a
row of gaps says where the trip is going — and the arrival day is the one
that matters.

### Closed: the plan's claim and the body's position were different numbers

The clock drew the body clock; the landing quoted the plan's declared shift.
Two models answering the same question — "how far off will you be?" — and the
payoff using the weaker one. The landing now runs the same projection the
clock does, from the same plan and the same baseline, and says the same
number. The claim sits beside the model's answer rather than replacing it, so
the gap is named: *the plan claimed 8.0h; its timing carried 5.5h*.

The rule generalises past the landing: **a number a traveller acts on must
come from the model that produced the thing they are acting on.** A claim
and a measurement that disagree are not two facts — they are one fact and one
arithmetic, and the arithmetic is the one that was wrong.

The same rule caught a second instance in the plumbing: the replay path — the
one the demo, the eval and the video run on — kept a *second* planner, weaker
than the solver, and the two had drifted apart. The demo was quietly running
the worse of the two. One planner now, and the delivery went from 50/62/64%
to 56/76/96%.

### Closed: no question was ever asked

A cold visitor was auto-given LHR → HND plus a fixture wearable and never asked
anything, so a real user and a demo viewer were indistinguishable. The baseline
now carries honest provenance (`garmin` / `wake-band` / `demo-default`), and the
one question appears inline on Today — directly under the tag that admits the
numbers are invented, where the numbers it affects actually appear. It retires
once answered.

Rule 1's sharpest lesson came from building it. The question *emptied the day's
plan*, because `resolveBaseline` computed bedtime as `wake + sleep - 1440`
instead of `wake - sleep` — a 06:45 riser was being sent to bed at 13:35.
Nothing threw, every band produced a well-formed baseline, and the only symptom
was a solver that couldn't place anything. The tests had asserted the wake time
and the chronotype and **never the bedtime**, which is precisely how a 24-hour
sign error lives indefinitely.

So the rule earns its second clause: **assert the relationship between the
numbers, not just the numbers.** `wake - sleep === bedtime` is now a test, and
it is the kind of invariant that no single value can catch.

`/outcome` rendered a full self-report with no trip and two sliders pre-set to
the middle, so an accidental save recorded a fabricated neutral score, and it
reported "saved" regardless of whether the POST succeeded. Now gated on a saved
plan, with save disabled until both answers are real (`1be902c`).

---

## 4. Accessibility as product quality, not compliance

Both concrete items are now closed, and the systemic gap is closed too:

- ~~**Space is captured globally.**~~ Fixed (`4ba7b35`). It `preventDefault()`ed
  Space on keydown and started a crew run; since buttons activate on keyup, no
  button on the page could be pressed with Space at all. The three menu items
  were also focusable divs with no activation behaviour — they took focus and
  did nothing.
- ~~**Colour-only verdicts.**~~ Fixed (`0a0c680`). `.evchip.pass` and
  `.evchip.warn` rendered byte-identical text and differed only in hue, so a
  failed gate read as a passed one. The label now carries a glyph and the issue
  count, the tooltip names the violations, and `tests/eval-chip.test.ts` fails if
  the two states ever render the same text again.

The systemic gap is closed: the app had exactly one `aria-live` region and it
rendered inside the closed-by-default `AgentDrawer`, so a blind traveller heard
silence through the entire run — the longest operation in the product.
`RunAnnouncer` is now mounted on the page itself, and the `aria-modal` Edit
sheet honours its claim for the first time: initial focus, Tab containment, and
restoration to the opener.

What this cost is worth recording. Both halves of `RunAnnouncer` and
`useFocusTrap` were written and merged while nothing imported them. Passing
libraries are not features — the code was correct, tested, and invisible to
every user until it was mounted. **If a PR adds an accessibility primitive, the
mount line belongs in the same PR.**

---

## 5. What I would not do

- **A wizard.** Auto-creating the trip is right. One inline question beats
  five gated ones.
- **A globe that animates to fill silence.** Rule 3 stands — motion must be
  caused by the traveller or be the reason the screen exists. But the inverse
  failure is real and currently shipped: the live terminator ticks **0.25° of
  longitude a minute**, roughly a quarter of a pixel, so the 60s interval means
  the hero looks like a still image. That is Rule 3's *timing* half applied so
  conservatively it reads as broken. The fix is not idle animation — it is the
  clock moving at its true rate, so the sunrise you scrub toward actually
  arrives.
- **Hiding the crew.** The five named agents and the visible deliberation are
  the differentiator, not debug output. "Behind the scenes" should stay
  reachable from Calm — just not in the first viewport, which is item 16.
- **Porting the lens interaction wholesale.** `/crew`'s pan/zoom/rotate is right
  for a dedicated instrument and wrong for a card mid-page. Share the *math*
  (`@/domain/dawn-layers`); let each surface own its interaction.
- **Shipping a control before it does something.** The flight picker was the
  test case, and it failed twice — see §3. If a control's choice cannot reach
  something that acts on it, it is not a control.
- **Letting taps train on a preview.** A Done/Skip mark that persists into
  check-ins, the replan path and graph memory is a control — see §6.
  Gated by `tapBecomesCheckIn` in `domain/preview.ts`; same inputs as
  `isPreview`, so the read rule and the write rule cannot drift
  (`63e8861`, asserted in `tests/preview.test.ts`).
- **Rendering fixture biometrics as biometrics.** HRV / resting HR from the
  sample profile read as measured even under a demo tag — see §6. Absent
  data reads "—", never a plausible number. Contract in
  `displayBiometrics()` (`63e8861`); `TripSetupScreen` half on B's board.

---

## 6. ICP read — Alex on the landing (2026-10-17)

Source: `docs/archive/icp.md` ICP-1 (strategy consultant, LHR → HND quarterly,
Garmin, late type 23:55 → 06:45, calendar-driven, 07:00 floor, pays if the trip
is demonstrably saved) against the landing as pasted on 2026-10-17. Valentina
remains the insight; Alex is the wedge, so his read governs ordering.

The landing is a beautiful instrument with the wrong first impression: it shows
sample science before it knows him, asks for work before earning calendar
rights, and buries the two things he would pay for — *will I be sharp for the
meeting?* and *put it in my calendar so I do it.*

What holds: auto-trip in 5 seconds (no wizard), the residual in words
("your dawn is 6.6h behind"), one step / one tap, the inline wake question
under the sample tag (Rule 1 as built).

**Update 2026-10-17:** the §6 directions for items 11, 13, 14, 15, 16
shipped in `63e8861` (A's render; B's contracts ride the same commit). Item
12's contract ships in `63e8861`; its `TripSetupScreen` half — the `m3`
grid replacement and the `Connect Garmin (CSV)` affordance — is in flight
on B's board. The two carried findings (globe rate, route surfacing) stay
open. The pre-lock hero meeting subhead (item 15 follow-on) is the next
thing to surface — see `docs/plan/backlog.md`.

**Update 2026-10-17 (round 3):** the carried findings and the pre-lock
follow-ons closed. `56965c1` mounts `RoutePicker` on the first viewport
(demo as starting point, not only option); `6d62d56` swaps the 60s
terminator interval for a throttled rAF at 4Hz. `7b6cc7d`+`3bb8e94` and
`9651585`+`45a5918` are the paired contract + render for the pre-lock
hero meeting and pre-lock readiness — the dawn card and the hero subhead
both reflect the solver's promise on first visit, not on first crew
run. Item 12 (`49c6722`) closes the carried `Real integrations`
remainder with a manual Garmin export verification.

What fails, as rules:

### Preview is not a promise

The pasted flow shows `07:00 Get outside light [Done] [Skip]` + `0 of 4 done`
*above* the personalisation question, on `demo-default` numbers — including a
`21:30 lights down / 22:30 bed` that is a 90-minute advance on Alex's real
`23:55` bedtime. A tap persists (`meridian:completedNudges`, `CheckIn`s, the
fold, graph memory) — so invented data becomes training data. Labelling it
"sample" is not enough once it is actionable.

Rule 1's trust clause therefore extends: **a number the app invented is never
actionable on a real ledger.** As shipped today, preview mode (the example,
or a real route whose wake question is still unanswered) is an *in-memory
rehearsal*: taps on Try/Skip still move the UI so the traveller can feel the
interaction — but the action ledger's preview scope performs zero storage
reads or writes, its send queue is derived empty, no mark is ever promoted
to a `CheckIn`, and Home hands preview scopes no check-in callback at all.
The example goes further: built locally from fixtures, no `/api/trip`, no
saved plan, no reminders, no crew run, a "Plan my trip" door back to entry.

**Shipped.** The gate is split across `domain/preview.ts` (`isPreview` /
`tapBecomesCheckIn`, asserted against the truth table in
`tests/preview.test.ts`), the scoped store in `lib/use-trip-actions.ts`, and
the send-path refusals in `NudgeFeedScreen` — the rehearsal can never reach
`meridian:actions:*`, `meridian:checkins`, or the replan run. Same gate
shape as `/outcome`: no real input, nothing to grade, nothing to persist.

### Calendar is the compliance surface

Alex does what the calendar says and ignores what an app suggests — but the
landing offers no `Connect Google Calendar` above the fold (only `sample —
connect yours` in the Edit sheet), no `.ics` until after a ~45s run, and no
reminder channel (`backlog.md` admits none exists). Done/Skip is extra work at
lowest capacity; Rex moving meetings is the wedge and is invisible unless he
finds `Personalise with the crew` below four steps.

Direction: the sticky primary is `Fit to me → to calendar`, not
`See why / Watch the crew`. Today surfaces `N movable / M fixed` and
`X/Y meetings ready` from `TripSetupScreen` onto the feed. Where push cannot
be sent, the `.ics` *is* the adherence path (`commercial.md`: "the `.ics` is
the ad") — preview its shape pre-run, don't hide it post-run.

**Shipped.** `domain/hero.ts::calendarSummary()` is the B-shape; A renders
`N movable / M fixed / X/Y post-flight meetings ready` above the timeline,
and the sticky CTA reads `Fit to me → to calendar`. The `.ics` itself is
still inside the crew run, but the *adherence path* is now named before
the traveller sees a step.

### Promise the floor

Two `07:00` asks back-to-back read as a threat, not a promise: nothing says
the solver holds `floor − 105min`, tries at/after-floor light first, or wins
adherence in the evenings (`architecture.md`). Alex expects the 05:30 ask
tomorrow — one strike and the app is uninstalled.

Direction: the floor promise sits *with* the wake question —
`Never before 07:00 unless you say so. Evenings do the heavy lifting.` —
and every ask renders as a window (`07:00–07:30`), never an instant. A
consultant lives in 30-minute blocks; the plan must look calendar-shaped.

**Shipped.** Wake-question copy: `Nothing before your floor unless you say
so. Evenings do the heavy lifting.` Rail reads `07:00–07:30` instead of
`07:00`; every row carries a `movable` / `placed` tag.

### No invented biometrics

A Garmin wearer sees `Wearable: sample profile` plus a fixture HRV / resting
HR grid, while the real upload (`POST /api/wearable`, `92299c3`) has no
affordance in `TripSetupScreen`. Highest-trust data ignored, lowest-trust
self-report asked, fake biometrics on top. Instant distrust.

Direction: pre-personalisation the `m3` grid goes away. The slot reads
`Connect Garmin (CSV export for now) or answer 1 question` — absent data is
"—". `TripSetupScreen.tsx:81` ("No invented values anywhere") is honoured on
the surface, not just in the comment.

**Contract shipped.** `domain/preview.ts::displayBiometrics()` returns
`null` for every measured cell on preview / unknown / missing baseline, so
`HRV 48 ms · Resting HR 58 bpm` cannot render as the traveller's numbers.
`TripSetupScreen` half (B): the `m3` grid replacement and the
`Connect Garmin (CSV)` affordance are in flight on B's board. The upload
route has zero callers today — worth a manual pass with a real export file
when B lands the affordance.

### The meeting is the product

The landing sells `6.6h owed` and pilot clocks (`London 13:36 day / Tokyo
21:36 night`) with no pitch, no workshop, no `readiness`. `commercial.md`
defines the free tier as the red badge — *your body thinks it's 06:00 at your
pitch* — and `meetingReadiness` already exists in code. Alex buys `sharp on
Tue`, not `shift`.

Direction: the hero subhead under the residual names one fixed event with
attendees at destination time plus its readiness
(`Tue 09:00 workshop in Tokyo = 01:00 body time · 38% → 82% if locked`).
The original "Land at 100%" promise is cashed on this screen (§2), not just
in the nav.

**Shipped, with one gap.** `domain/hero.ts::heroMeeting()` is the B-shape;
A renders the hero subhead under the dawn card. The block disappears when
no real post-flight fixed event exists — no fixture title. The gap:
pre-lock, `bodyWithoutPlanMin === bodyMin`, which means the "without the
crew" half is empty. The sales line lives in that gap, and is the next
thing to surface — render the unbanked figure unconditionally and label
it `what you'd be without the plan`.

**Gap closed round 3 — `7b6cc7d` + `3bb8e94`.** B added `previewLocked`
to `heroMeeting`; A threaded the solver-backed preview through. Pre-lock
the hero subhead now reads e.g.
`D+1 14:00 Client pitch = 06:00 body time · would have been 13:30 without
the crew`
on demo-default — the gap between `bodyMin` and `bodyWithoutPlanMin` is
the sales pitch, and it is visible on first impression, not on first crew
run.

### The path to configuring your own trip is the thing missing above the fold

Alex's bounce is not only what the landing says — it is that the landing never
offers him a way to make it *his*. 1,145 airports are wired into
`searchAirports` and reachable only through **Edit → Edit trip**, while the
landing silently assumes LHR → HND. The input layer already exists; it is a
surfacing failure, not a build.

This is the same class as the calendar: the product has the capability and
hides it one layer too deep, so the first impression is a demo. Fixing it does
not mean a wizard — Rule 1 stands, and auto-trip in five seconds is genuinely
right. It means the route and departure the user is actually flying are
editable from the surface that displays them, with the demo trip as the
*starting point* rather than the *only* option.

**Carried.** Highest-priority remaining gap from §6. The fix is
surfacing, not build — the input layer exists; what is missing is the
route and departure as inline-editable on the first viewport, with the
demo trip as the starting point rather than the only option.

**Shipped `56965c1`.** `RoutePicker` is mounted on the first viewport in
place of `TripSummary`. The route and departure are inline-editable, the
demo trip is the starting point, and the rest of the setup sheet
(wearable, wake band, flight window) stays behind Menu → Edit trip
because it is not the first-impression problem.

### The globe is real, and reads as inert

Worth separating from everything above, because it is not an ICP complaint but
the same disease: a capability present and not felt. The terminator advances
**0.25° of longitude per minute** — roughly a quarter of a pixel on the 320px
hero disc — so the live clock is correct and invisible, and the globe reads as a
still image rather than an instrument.

Nothing about the geometry needs fixing. The geometry was verified (and the
curve labels were placed by sweeping for the nearest *visible* point, because
both earlier anchors landed on the far hemisphere). What is missing is the rate:
a rAF at this scale is cheap, the shift lane should animate the ghost sliding
onto the terminator while dragging rather than only on release, and a sunrise
you scrub toward should actually arrive. Rule 3 does not forbid this — it
forbids motion that is neither caused by the traveller nor the reason the screen
exists. A clock that ticks at the Earth's actual speed is both.

**Carried.** A's file (`HeroDawnPanel.tsx`), no contract, either lane.

**Shipped `6d62d56`.** The 60s `setInterval` swapped for a throttled rAF
at 250ms (4Hz); reduced-motion travellers keep the 60s tick. The
visible motion at Earth's rate is sub-pixel per frame regardless of
update rate, so what changed is the data freshness and the disc's
responsiveness to state changes (slider, drag, lock). The shift lane
already animates the ghost onto the terminator while dragging — the
slider is a native range input whose `onChange` triggers a render and a
path recompute, so the ghost slides frame-by-frame.

### The crew stays backstage on Calm

`Hear the crew / Menu / Watch the crew / See why / Today / Personalise with
the crew` plus `the real dawn / your body's dawn / LHR HND London clock shift
owed` is six concepts before one action. Rule 4's mechanics hold; its labels
don't: `Today` means nothing as a depth, and named agents + voice belong to
`See why / Watch`, not the first viewport.

Direction: Calm defaults to words + one number + one CTA. Depth renames to
`Plan / Why / Crew`; `Hear the crew` leaves the first viewport.

**Shipped.** Depth dial reads `Plan / Why / Crew`; the voice toggle and
`Hear the crew` leave the first viewport (their home is `/crew`, which
already owns its voice control). Calm is closer to the spec; the trail
to the Why / Crew surfaces is intact.
---

## 7. Where this lands

Items 11–16 in [docs/plan/backlog.md](plan/backlog.md), with owners, contracts
and a day-by-day sequence. The short version:

| Item | Owner | Why | Status |
|---|---|---|---|
| 11 Preview is not a promise | A | Surface gate; `baselineKind` already exists | Shipped `63e8861` |
| 12 No invented biometrics | B, whole | One file, one brief — splitting it would be a handoff for nothing | Contract shipped `63e8861`; `TripSetupScreen` half on B's board |
| 13 Calendar is compliance | B shape → A render | Data already exists; it needs surfacing | Shipped `63e8861` |
| 14 Promise the floor, window the asks | A | Copy only; the solver already holds the floor | Shipped `63e8861` |
| 15 The meeting is the product | B data → A hero | **Sequential, never simultaneous** | Shipped `63e8861`; pre-lock gap closed round 3 — `7b6cc7d` + `3bb8e94` |
| 16 Crew backstage | A | Isolated; filler while B is on tests | Shipped `63e8861` |

The globe's rate and the route-picker surfacing are real and currently
unassigned — either lane, once 11 and 16 are done. Both are the same
disease as item 13: a capability present and not felt. **Both closed in
round 3** (`56965c1`, `6d62d56`); the dawn card reflects real time and
the route is editable above the fold.

Nothing in §6 requires a new dependency, a new provider, or a decision about
notification infra. Every item is either a gate on state that already exists, a
piece of copy, or a surface decision about data that is already computed. That
is the encouraging part of this read: the product is closer to the ICP than it
looks, and the gap is mostly about what it shows first and what it lets you
touch.

**Update 2026-10-17:** the round is in. Items 11, 13, 14, 15, 16 are on
`main`; 12's contract is on `main` and its surface half is the B-side
follow-on. The two carried findings (globe rate, 1,145-airport surfacing)
are the highest-leverage work for the next round, and the pre-lock hero
meeting gap is item 15's own follow-on. See [docs/plan/backlog.md](plan/backlog.md)
for the running record.

**Update 2026-10-17 (round 3):** the §6 directions are all realised. The
carried findings and the pre-lock follow-ons both closed — the route is
on the first viewport, the dawn card ticks at Earth's rate, the hero
meeting names the sales pitch pre-lock, and the dawn card shows the
plan's promise rather than a flat zero on first visit. Round 3 was
five commits (A: `56965c1`, `6d62d56`, `3bb8e94`, `45a5918`; B: `7b6cc7d`,
`9651585`). Item 12 (`49c6722`) closes the carried `Real integrations`
remainder.

**Round 4 (shipped 2026-10-17):** the 9/10 push, tracks closed. Track A
(`50f786c`, `0451330`, `337d2e4`): cream surface, marks-waiting banner,
scannable hero delta, arrival promise-vs-account split. Track B
(`c95a5fe`, `a587376`, renders in `837b613`; then `51fd0e0` provenance
labels, `07c666c` sheet ack, `679ae38` history proofs, `e2f3ace`
prompt cross-trip line): `wakeAck`, B2 closed with no change (no storm
exists), `secondTripProof` + hero/history lines. Ratings now design 8.5
/ UX 7.5 — see [docs/plan/backlog.md](plan/backlog.md) §Round-4 ratings.

**Round 5 (filed 2026-10-17):** external browser-session review, every
item traced to source before filing. Six shipping-blocker visual bugs
(missing `.tl-tag` / `.cal-summary` CSS, light-on-light headings,
always-green history scores, cryptic zero-case, list-key warning) plus
four structural UX frictions (CTA honesty, dial placement, disclaimer
stacking, solver spacing). Priority: CSS first, headings/scores second,
copy/keys third, structural calls last. See
[docs/plan/backlog.md](plan/backlog.md) §Round 5. Lane: almost all A
(`globals.css`, feed, history, review); B only if the 5B4 solver rule or
the 5A5 filter rule needs a contract.

**Round 6 (shipped 2026-10-17):** the four bets from the ranked shortlist,
all committed. The globe graduated: the WebGL dawn globe is now the home
hero behind one WebGL probe, drawing the hero's own inputs (scrubbed
date, owed gap) with the route arc and brand pins; `?svg=1` or no-WebGL
keeps the shipped SVG (`837c619`, `18b1a35`). The destination-taste
surface went live on the arrival day of the feed (`35724ee`). The
body-clock passport renders on the shared plan card *and* as the link's
OG image, so Slack/iMessage preview the "my body thinks it's HH:MM" line
(`5f8ea70`, `eb7f6a6`). The arrival page grew the trip debrief — gate
score, adherence lesson, carried-in proof, next-trip CTA (`71ac8c5`).
The Round-5 fixes are tracked separately; 368 tests green at `18b1a35`.
See [docs/plan/backlog.md](plan/backlog.md) §Round 6.

**Round 7 (shipped 2026-10-17):** the delight and intuitiveness pass
(`6d43b41`). The globe's hover tooltip is now an instrument — the city's
own wall clock (`localClock`, Intl, DST-honest), the twilight band and
sun altitude from the shared solar model, and merged metros explained as
"one light for N airports". Band words are unified (`SKY_BAND_LABEL`) so
the tooltip and the Window Seat describe identical twilight identically.
The flight gets a ground-track hairline, a one-time drag hint, grab
cursors; the hover gets a breathing ring; the fades honour
`reducedMotion="user"`. 372 tests green; one visual pass at
`/spike/globe` remains for the shader-driven effects. See
[docs/plan/backlog.md](plan/backlog.md) §Round 7.

**Round 7 follow-up (same day):** the landing's `.root` phone artboard
(868×1543) is released to a 1140px desktop measure — the "why does the
landing look like mobile, then /crew looks proper?" confusion is closed.
Cream day-side, ink night-side; both now feel like desktop on desktop,
and phones see no change.

**Round 8 (shipped 2026-10-24, superseded navigation):** the Cinematic Dawn
pass — the whole app retyped and restaged for the Base44 Challenge. The
design system it locked lives in [design.md](../design.md): Fraunces
Variable (the crew's voice), Inter Variable (body), JetBrains Mono
Variable (every number), and a 4pt spacing scale beside the existing
motion vocabulary. Its navigation model — the Clock as a second view,
the Timeline ↔ Clock crossfade — is **superseded by the current
Today-stable contract** (see the status note at the top); the rest of
this entry describes what shipped at the time.

The structural move is the **stage**: the landing hero and the Clock view's
action + dial share one grammar — a full-frame ink band that breaks out of
the reading column to the app frame edge (`--hero-out`), with the globe and
the 24-hour dial as its centerpieces and the next action at display scale.
Stages scope the `--m-*` / `--dial-*` palette flip *inside themselves*, so
they read ink in both themes and no component carries a second palette —
the trick the night theme already used, now applied to a surface rather
than a mode.

Interactivity: React 19.3 view transitions — typed navigations slide by
direction, the Timeline ↔ Clock switch crossfades as one plan read two ways,
and the hero's dawn disc morphs into the arrival payoff's disc as the same
object. Plus scroll-timeline reveals gated behind `@supports` +
reduced-motion (content is never hidden without support), a first-visit-only
stage sweep, a live run ribbon on the stage (agent, days locked, sun
progress), press/glow micro-voice on the action pair, a `CountUp` on the
arrival figures and a `TweenNumber` on the figures a run moves (the owed gap,
readiness, the day gaps) — both always landing on the true value and both
aria-honest. The wake question moved from above the band into the stage's
action column, beside the numbers it changes. Every product rule from §1–§4 still binds: one
question at the right moment, every visual read also exists as words, motion
is caused by the traveller or is the reason the screen exists, and a stage
never flips with the mode.

Nothing about the engine moved: the planner, the scorer, the gate and the
journey are unchanged — this round is type, surface and motion.

**Round 9 (in progress):** the Qloo playable-day pass — "Show up for what
matters." The first-use route flow leads with the important moment, then the
interactive `DayScene` ties destination/local and estimated body time to
modeled solar position and real seek/reduce/sleep windows. Optional Qloo
place ideas fit around the verified schedule through `buildTasteItinerary`
and keep/swap/dismiss/restore choices; venues never become light
interventions or change timing. Three fictional sample journeys exercise
Jason Calacanis, Cedric the Entertainer, and Alex Elias as imagined,
disclosed examples. The stage itself now uses the shared sky model: its
horizon band rises with the body clock's estimated sun while origin blue
fades with the shift still owed. A frozen, privacy-gated Day Card exports
PNG/SVG and a vertical story view — still images for recording, not video
export or proof of completed steps.
