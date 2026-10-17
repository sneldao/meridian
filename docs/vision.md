<!-- ASPIRATIONAL — target experience and design rules. This is where we are going, not where we are. Current-state facts live in docs/reference/; the work items live in docs/plan/backlog.md. Successor to docs/archive/design-vision.md, which stays frozen as the hackathon-era record. -->

# Product vision — land at 100%

**Status:** proposal · **Companion:** [design-vision.md](archive/design-vision.md) (the visual primitives)

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

Not a wizard, not an onboarding tour. Meridian already auto-creates a trip,
which is right: a first-time visitor should see the product work in five
seconds without filling in a form.

But the demo profile must never masquerade as the person. Today a cold visitor
gets LHR → HND departing in three days, wearing a fixture wearable, and
**never once gets asked anything** — the one real personalisation question
("on a day with nothing early planned, when do you naturally wake?") lives in
the Edit sheet and on `/crew`, never on the landing surface.

So: the demo trip stays, the demo tag stays, and the question appears
*inline* the first time a number that depends on it is shown. One question,
three chips, skippable, remembered.

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

### Rule 4 — The depth dial is the interface

Calm / **See why** / **Watch the crew** is the best idea in the app, and it is
the reason a single surface can serve a jet-lagged traveller and the person who
wants to read the phase-response curve. Protect it.

Its current weakness is ordering, not mechanics: **Calm shows fabricated numbers
with a footnote**, and See why is the first place a user discovers any of it is
real. Fixing Rule 1 makes the dial land, because then the first number they see
is theirs.

---

## 2. The journey we are actually selling

The promise is "Land at 100%". Today that promise is made in the nav and never
cashed. The target loop:

| Stage | Where | What must be true | |
|---|---|---|---|
| **Arrive** | `/` | Demo trip renders immediately. One question asked about *them*, not about the trip. | ✅ |
| **Orient** | `/` hero | The residual is legible: how far behind your dawn is, and how much is banked. | ✅ |
| **Personalise** | `/` CTA | The crew run is watchable — progress is *announced*, not just animated, and a dropped stream never bricks the button. | ✅ |
| **Live the shift** | `/` Today | One step, one tap. Taps persist and are attributable to the traveller. | ✅ |
| **Land** | `/arrival` | **The payoff.** First morning in the destination, scored against what was promised at the gate. | ✅ |
| **Reflect** | `/outcome` | Reached from the arrival screen, where arriving makes it meaningful. Shows the plan it is grading. | ✅ |

The engine side of most of this is now true: the residual is legible, taps
persist and are attributable, a stalled run can't strand anyone, the run is
announced as it works, the self-report can't fabricate a score, and the one
question is asked and answered.

**Every stage is now built.** The journey runs Arrive → Orient → Personalise →
Live the shift → Land → Reflect, and "Land at 100%" is finally a promise the
product keeps rather than one it makes.

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
- **`/crew`'s "Trip Setup"** links to `?screen=setup`; nothing reads `screen`.

A control that looks load-bearing and isn't is worse than a missing one: it
spends trust.

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
- **A rAF-animated landing globe.** See Rule 3.
- **Hiding the crew.** The five named agents and the visible deliberation are
  the differentiator, not debug output. "Behind the scenes" should stay
  reachable from Calm.
- **Porting the lens interaction wholesale.** `/crew`'s pan/zoom/rotate is right
  for a dedicated instrument and wrong for a card mid-page. Share the *math*
  (`@/domain/dawn-layers`); let each surface own its interaction.
- **Shipping a control before it does something.** The flight picker was the
  test case, and it failed twice — see §3. If a control's choice cannot reach
  something that acts on it, it is not a control.