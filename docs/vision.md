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

| Stage | Where | What must be true |
|---|---|---|
| **Arrive** | `/` | Demo trip renders immediately. One question asked about *them*, not about the trip. |
| **Orient** | `/` hero | The residual is legible: how far behind your dawn is, and how much is banked. |
| **Personalise** | `/` CTA | The crew run is watchable — progress is *announced*, not just animated, and a dropped stream never bricks the button. |
| **Live the shift** | `/` Today | One step, one tap. Taps persist and are attributable to the traveller. |
| **Land** | *missing* | **The payoff.** First morning in the destination, scored against what was promised at the gate. |
| **Reflect** | `/outcome` | Reached automatically when the trip's last day passes. Shows the plan it is grading. |

**Stage 5 is the gap.** The engine now previews post-flight days (`c9eccd2`),
so the maths for landing exists — but there is no arrival surface, nothing ever
navigates to `/outcome`, and the vision's own Window Seat ending was never
built. This is where the ghost-terminator work pays off, because landing is the
one moment the residual is finally zero and the two lines have fused.

---

## 3. Where the loop is open

Honest inventory. These are **design consequences of implementation choices**,
so they belong here rather than only in the backlog.

### The loop records everything, and cannot tell whose it was

Per-step did/skip marks now flush as structured check-ins (`abc3683`) — the
mechanism is right. But `recordCheckIn` appends to a **single global
`artifacts/crew-memory.json`** (`src/domain/memory.ts:10,32`), and
`foldCheckIns(ADHERENCE_PROFILE, memory.checkIns)` folds *every* visitor's
check-ins into one adherence profile (`api/crew/checkin/route.ts:26`).

So one traveller skipping a 6am light moves the compliance floor for everyone
else. The graph-memory path already takes a `tenant` (`route.ts:35`); the file
path does not. Until the traveller is identified, "the crew learns" is a claim
the architecture can't honour.

### Failure is invisible, and one failure is terminal

- A dropped SSE stream calls `es.close()` but never `reset()`
  (`src/app/page.tsx:367-370`), so `phase` stays `running` and the primary CTA
  stays disabled. The only escape is Escape or a reload.
- Stream errors are pushed into `AgentDrawer`, which is closed by default — so
  they are invisible on the surface where the user is looking.
- There is no `error.tsx`, `global-error.tsx`, or `loading.tsx` in `src/app`.
  Any uncaught render throw takes the whole route down.

An adaptive product that forgets your week because a socket closed is not one
you'd recommend to a friend.

### Controls that don't control

- **Flight-window picker.** `selectedFlightId` is collected and displayed but
  never reaches the API — zero effect on any plan. Worse, on a westbound route
  the ids don't match the default, so *nothing appears selected*.
- **The wake question** is asked only in the Edit sheet, on a surface the
  landing never sends you to.
- **`/dev` and `/team`** are complete routes with zero inbound links.
- **`/crew`'s "Trip Setup"** links to `?screen=setup`; nothing reads `screen`.

A control that looks load-bearing and isn't is worse than a missing one: it
spends trust.

### The payoff surface is gated behind the wrong things

`/outcome` renders a fully interactive self-report with no trip, no plan, and
two sliders pre-set to the middle — so an accidental save records a fabricated
neutral score. It reports "saved" regardless of whether the POST succeeded. And
`/review` and `/history` on empty storage are one-line dead ends with a single
"back" link.

---

## 4. Accessibility as product quality, not compliance

Two concrete things, then the systemic one:

- **Space is captured globally.** `page.tsx:436-438` `preventDefault()`s Space
  on keydown and starts a crew run. Buttons activate on Space *keyup*, so this
  suppresses the activation of every button on the page — Personalise, Done ✓,
  a day pill, Menu, Edit. A keyboard user cannot use the buttons at all.
- **Colour-only verdicts.** `.evchip.pass` and `.evchip.warn` render
  byte-identical text (`NudgeFeedScreen.tsx:905-907`); only colour separates a
  passing check from a failing one. The pass/fail badge in `CrewFeed` gets this
  right, which proves the pattern is known — it just isn't applied everywhere.

The systemic gap: **the app is silent to assistive tech during its longest
operation.** There is exactly one `aria-live` region in `src/`, and it lives in
`CrewFeed` (`CrewFeed.tsx:63`), which only renders inside the closed-by-default
`AgentDrawer`. A screen-reader user pressing "Personalise" gets *nothing* while
five agents stream for potentially minutes. Related: no `.focus()` call exists
anywhere in the codebase, so the `aria-modal` Edit sheet has no focus trap, no
initial focus, no restoration, and a non-`inert` background — a claim it
doesn't honour.

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
- **Shipping a control before it does something.** Fix or delete the flight
  picker.