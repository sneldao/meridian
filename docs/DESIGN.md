# Meridian — the design contract

One file. It replaces `design.md`, `docs/vision.md` and `docs/plan/backlog.md`,
which had drifted into contradicting each other and describing a repo they no
longer matched (merged 2026-11-03).

**How to read it.** Part 1 is law: a design decision either satisfies it or
amends it, in writing, with a date. Part 2 is the current state as it actually
is. Part 3 is what is open. Part 4 is a log — append-only, historical, and not
a description of anything. If Part 4 disagrees with Part 1, Part 1 wins.

**The honest caveat, kept from the old backlog header.** Verified so far:
`bun test` (pure functions + SSR markup), typecheck, lint, production build,
and the Playwright visual suite in CI. **Not verified: a human looking at the
app in a browser.** No user validation has happened. Every claim below about
how something *reads* is a claim about intent, not about observation.

Design direction is law here and nowhere else. Current-state *facts* about the
backend, providers and data live in [reference/](./reference/).

---

## Part 1 — Laws

### The four product rules

These came out of the dawn-panel work, where they were the difference between
an instrument and a screenshot.

#### Rule 1 — One question, at the moment it first matters

Not a wizard, not an onboarding tour — but a trip first. A cold visitor meets
an explicit entry ("Arrive better adjusted."): two airports and a date, one
Continue. Personalisation comes *after* the route is theirs, as the one inline
question on Today. The example stays one tap away and is always honest — built
locally, saves no traveller trip or action data, can never run the crew.

The demo profile must never masquerade as the person. The saved route, the
remembered wake answer and the plan's own baseline provenance decide what the
numbers are; nothing fabricated is presented as measured.

> The trust rule underneath everything: **a number the app invented is never
> presented as a number the traveller measured.**

Its executable form is the provenance label, not a comment: the hero reads
`heroReadiness().source` and says `"of shift locked"` only for a source of
`"locked"`, `"banked on preview"` for `"preview"` (`NudgeFeedScreen.tsx`,
`HeroDawnPanel.tsx`). A round-3 follow-on that was listed as an open trust gap
for sixteen days while it sat shipped — see Part 3.

#### Rule 2 — Every visual read also exists as words

The globe is not the source of truth. The caption beneath it is. Interaction is
layered **on top of** a complete written read, never as a replacement for it.

This is why the dawn panel is usable with a reduced-motion setting, a keyboard,
or a screen reader: hover, drag and scrub are enhancement; the gap in words is
the product.

Corollary: **never let an interaction be the only route to a fact.** Two
shipped consequences:

- Drag-to-recentre binds only on `(hover: hover) and (pointer: fine)`. A
  `touch-none` card mid-page would steal the page scroll, which is a worse bug
  than a globe that doesn't spin on a phone.
- The scrubber is two native `<input type="range">` elements, so arrow keys,
  Home/End, screen-reader announcements and touch dragging come free rather
  than being hand-rolled and half-working.

#### Rule 3 — Respond to input; don't perform

The landing hero spins because *you* moved it. `/crew` earns continuous motion
because it is a dedicated surface with a stage to run. Motion must be either
caused by the traveller or be the thing the screen exists for.

*Amended round 27 (2026-11-01):* the budget became explicit. Ink **stages**
(hero, demo, the example stage, arrival, crew) exist to *show*, so
choreographed and ambient performance on them is "the thing the screen exists
for," not a violation. **Working surfaces** kept the original law: respond
only. The reason was measurement, not taste — visitors churned before ever
seeing the crew, and a differentiator nobody sees is a decoration.

*Amended round 50 (2026-11-03) — the gate moves from surface to channel.* The
round-27 split put every working surface under a blanket ban, and the app
paid for it: a page that may never move until touched is a page that reads as
inert, which is the exact quality the landing was amended to escape. The
surface was also never the real risk. The risk is motion that competes with a
readout, because Meridian's faces are load-bearing — "what the faces report is
what the run did, never a performance beside it" (`CrewFaces.tsx`). So:

- **Ambient motion is allowed on any element that carries no readout**, on
  working surfaces included. The sun's disc encodes nothing, so the disc
  breathes.
- **An ambient loop may never run on an element that carries state.** On the
  sun: eye `ry` is lid debt, halo opacity is glow, ray count is locked days.
  A blink on the eye is a loop on the debt readout — it would read as the sun
  getting sleepier, which is why round 49's blink is withdrawn here.
- A loop that *is* the state stays legal: `.crew-avatar[data-state="working"]
  .ca-*` animating while working reports rather than performs.
- One-shot motion caused by an arrival is not ambient and is unaffected — the
  landing hero's `lh-sun-blink` peek plays once and is fine.
- Unchanged by both amendments: only transform/opacity/paint animate; reduced
  motion stands every loop down; a performing surface's written read must be
  complete on its own; no rAF loop for a line that changes once a minute.

Enforced by `tests/motion-language.test.ts` ("ambient motion stays off the
readout"), not by prose.

#### Rule 4 — Explanation is progressive, not a dial

The old Rule 4 was a persistent depth pill (Calm / See why / Watch the crew) as
global chrome. What survives is the principle, recast: **Today is always the
action surface; depth unfolds beneath it.** The body-clock projection is an
opt-in `<details>` sharing Today's data; the operator surface is a menu tap to
`/crew`; `?depth=guided` still deep-links the visuals. No global mode picker is
shown; a legacy remembered Guided preference and `?depth=guided` stay supported.

The ordering lesson stands: the first number must be *theirs*, which is why the
entry form exists before any plan preview is actionable.

---
### Palette and token discipline

Named tokens only — pages and chrome reach for tokens, never
literals; raw values live only inside one-off geometry.

Not a swap: a tuned extension. The cream day surface survives as the day
mode; the ink night side becomes the cinematic default for stages.

- `--color-ink`      `#07090f` — the night stage
- `--color-ink-2`    `#0C1018`
- `--color-ink-3`    `#131826`
- `--color-line`     `#1E2637`
- `--color-paper`    `#E8EAF2` — text on ink
- `--color-cream`    `#F5EFE6` — the day surface (mode)
- `--color-clay`     `#1E1B18` — text on cream
- `--color-terracotta` `#D96B43` — the ONE action accent (≤ 5% of a viewport)
- `--color-sun-dest` `#FFC46B` — ember gold; destination sun & display light
- `--color-ghost`    `#FFD98A` — the ghost terminator (body clock's day line)
- `--color-sun-home` `#9DB8FF` — origin blue
- `--color-sleep`    `#B8A8FF` — target sleep window
- `--color-pass` / `--color-fail` — state only, never chrome (rule stands)
- `--color-focus`    `#85B1ED` — deliberately not the accent

Day/night themes (`--m-*`, `html[data-theme="night"]`) keep flipping the
working surfaces; ink *stages* are ink in both modes.

`auto` is the destination's sun, not the phone's clock (`src/domain/theme.ts`):
once a trip exists the app asks the solar model whether the traveller is in
light, so Tokyo at 07:00 is cream on a phone that still says Berlin 00:00.
Device rules (OS scheme, 21:00–06:00) apply only until there is a destination;
the menu names which is governing ("Auto · day in Tokyo"). A manual Light or
Dark always wins.

### Typography

- **Display:** Fraunces Variable (opsz + wght, `font-style: normal` — italic
  display banned), the crew's voice. Replaces the Palatino `--font-voice`
  stack; that variable name stays as the semantic alias.
- **Body:** Inter Variable — replaces Helvetica Neue everywhere.
- **Mono:** JetBrains Mono Variable — every number is a measurement
  (`font-mono2` / `var(--font-mono2)` stay the semantic aliases).
- Display tracking: `-0.02em` at display sizes; eyebrows `0.18em` uppercase.
- Type scale anchor: `--text-display: clamp(2.6rem, 6vw, 5rem)` for hero
  statements; hero headlines ≤ 7 words sit at `--text-display`, longer
  statements cap at `--text-display-s: clamp(2rem, 4vw, 3.25rem)`.
- Body floor: 12px — enforced by the ramp itself, not by convention:
  `--text-2xs` is the smallest step and tops out at `0.75rem`, so nothing
  fluid renders below ~11px. (It used to read "UI labels step 10px → 11–12px
  where the layout allows"; the 10px labels that line hedged are gone.)

- Readability floors: essential text ≥16px (1rem); supporting labels 13–14px;
  nothing informative or interactive below 13px; 4.5:1 contrast against the
  actual backdrop (on ink, the faint tone #6b7590 is not a text colour below
  18px — use the muted tone).

### Spacing

4pt named scale (`--space-3xs … --space-3xl`) in `globals.css`. Pages use
named tokens; raw values only inside one-off geometry.

### Motion

The app's named vocabulary survives and is the law: **glide** (180ms —
traveller-caused state change), **settle** (320ms — a panel arriving),
**drift** (700ms — arriving on its own). Easings: `--ease-glide`
cubic-bezier(0.22, 1, 0.36, 1) · `--ease-settle` cubic-bezier(0.16, 1, 0.3, 1)
· `--ease-drift` cubic-bezier(0.4, 0, 0.2, 1).

The springy layer adds `--ease-spring` (overshoot, for bounce on arrival and
press), `--dur-spring` (the duration that carries it), and `--stagger-step`
(the per-character step for the landing headline, set in CSS so chrome
files stay under their inline-style ceiling). Spring motion is `transform`
and `opacity` only, and every spring sits behind `prefers-reduced-motion:
no-preference`, so reduced motion shows the settled pose.

One deliberate impact per screen. The landing hero's "Start with your trip"
CTA lands with a single overshoot after the headline's character stagger;
no other element on the landing page overshoots.

#### The motion gate

Only compositing-safe properties may animate — `transform`, the
independent transform properties (`translate`, `rotate`, `scale`),
`opacity`, and paint (e.g. `clip-path`, custom properties). On SVG
elements the independent properties are required, because a CSS
`transform` would replace the SVG `transform` attribute. Paint
crossfades (`color`, `background`, `box-shadow`, `filter` for the
smear) cost nothing to composite and stay; `clip-path` is
compositor-friendly and carries the dawn reveal and the light-sweep masks
without moving any box. Anything animating a box (`width`, `height`,
`margin`, `padding`, `inset`) reflows and does not. Remaining box
animations are frozen debt, counted by exact declaration text in
`tests/design-contract.test.ts`.

#### Where ambient motion may live

Rule 3 (amended round 50) decides this, and the CSS is written to it: an
ambient loop belongs on an element that carries no readout. On the sun the
disc breathes (`sunself-breath`, 6.4s) because the disc encodes nothing; the
eyes, halo and rays are all readouts and never loop. `tests/motion-language.test.ts`
holds the line — it fails if a future round puts a loop back on `.sunself-eye`
or on any sun element but the disc.

#### The vocabulary applied

- Reveal pattern: scroll-driven fade + 16px rise, staggered, gated behind
  `@supports (animation-timeline: view())` / `prefers-reduced-motion: no-preference`;
  content is visible without JS or scroll support.
- Route continuity: React 19.3 `<ViewTransition>`. Typed navigations slide by
  direction (`nav-forward` / `nav-back`; untagged navigations, including the
  browser back button, stay instant). Today is stable — it never swaps out
  for another view; the body-clock explanation opens as a `<details>`
  beneath it, so there is no screen transition to animate. The hero's dawn disc and the arrival
  payoff's disc share `view-transition-name: dawn`, so the object the hero
  counted down to is the object that lands. Support is progressive: without
  the API, pages swap and the sweep still runs.
- Motion language (round 16, completed round 18): **light moves, things
  morph, nothing slides up from nowhere.** Panels do not arrive from
  off-screen; the element you touched grows into the surface. The rules:
  - *Surface morphs.* Same-document view transitions pair each trigger with
    its panel under one `view-transition-name` (`morph-more`, `morph-settings`,
    `morph-trip`, `morph-voice`, and — round 18 — `morph-crew` and
    `morph-disclosure`): the More tab becomes the More sheet, the
    Settings row becomes its sheet, the trip chip becomes the trip editor,
    the Voice row becomes the assistant, the Activity-log row becomes the
    crew panel, and the disclosure rows become the disclosure panel. Only
    one element holds a name at a time; without the API the existing sheet
    motion is the fallback.
  - *No sheet stacks a sheet (round 18).* Inside the More sheet the
    disclosure swaps the sheet's own body in place — the panel keeps its
    morph name, the content crossfades inside it, and Escape backs out one
    layer at a time.
  - *The dawn reveal.* Typed route changes wipe like light: `nav-forward`
    unveils the incoming page from the horizon up (`clip-path: inset` on
    `::view-transition-new(root)`) while the outgoing page settles; `nav-back`
    reverses it — travelling back is the sun going down. The shared dawn disc
    flies above the wipe, so the sun leads its own sunrise.
  - *Light sweep.* In-page mode switches (Now ↔ The plan, Calm ↔ Detailed,
    theme flip) pass two stage layers — horizon gold, then ink — across the
    content, transform-only, staggered. A mode change reads as light crossing
    the page, not a drawer.
  - *Places morph into pages.* The place rows in More carry
    `view-transition-name: place-*`; the destination page's header carries the
    same name, so the card you tapped becomes the page you land on.
  - *The trips deck.* `/history` is a card deck: journeys stack with
    `position: sticky` and the covered card recedes on scroll where
    `animation-timeline` is supported. Riffling through trips, not scrolling
    a table.
  - *Expanders breathe in (round 18).* Evidence "why" blocks and inline
    cards (the booking paste) enter with the `rise` keyframe — opacity +
    transform — instead of materializing.
  - *Feed cadence (round 18).* The Today timeline is a sequence, not a
    wall: `.tl-rows > .tl-row` reveals on scroll via `animation-timeline:
    view()`, animated with the `translate` property so the swipe gesture's
    inline `transform` is never fought. Preview strips stay static.
- Page entrance: the terminator hairline sweeps once per navigation; a
  first-visit-only streak (remembered in `meridian:visited`) crosses the
  stage once per browser.
- The run on the stage: while the crew works, the hero shows the speaking
  agent, days locked and sun progress (visual only — `RunAnnouncer` speaks it).
- Number continuity: a figure that changes tweens from what is on screen to
  its new value (`TweenNumber` — the owed gap, readiness, day gaps). First
  paint and unit changes snap, so a number never reads a unit it doesn't have;
  the true value is what is announced.
- One cue vocabulary for progress. The sun-self and the crew do not each
  own a private animation language: every state on both resolves to one of
  four cues — **arrive**, **work**, **done**, **fail** — in
  `src/domain/motion-cues.ts` (`SUN_CUE` for the sun's moods, `CREW_STATE_CUE`
  for the avatars' poses — `CrewFaces`' `MOOD_STATE` folds a crew mood onto a
  pose first, which is why an agent drawn outside the live crew row still gets
  the shared beat). `done`
  is literally one keyframe: `.sunself.enter`, the check-in card's finished
  button and `.crew-avatar[data-cue="done"]` all play `sunself-pulse`, so a
  step landing reads the same wherever the traveller is looking. `arrive` and
  `work` are carried by the poses themselves — a second loop would fight the
  one loop the crew is allowed — and `fail` is the only added beat, a
  transform/opacity dip. The cue reaches CSS as `data-cue` on the avatar
  root, so the table is the only place the mapping lives. A verdict is a cue
  that has to be read: both emitters send `eval_result` immediately before
  Iris's own `agent_start`, so the fold hands her face to the narration in
  the same tick. `CrewFaces` shows `lastVerdict` for `CUE_HOLD_MS` — the
  card's hold window, adopted on the commit the verdict lands in and ended
  by a timer — then lets the speech move her on.
- The done pulse is allowed to be seen. Marking a step resolves it, and the
  feed hands the check-in card's hero slot straight to the next step — which
  swapped the card away inside the same commit, leaving the pulse written
  but never played. `RightNowCard` now holds the finished step for the length
  of that one pulse (~760ms, `CUE_HOLD_MS`), badge reading **MARKED DONE**,
  then hands over;
  a tap during the hold dismisses it rather than acting on the step beneath
  (undo stays on the toast). Reduced motion skips the hold entirely, since
  there it would be delay with nothing to watch.
- Layout morph: a reorder or resize of cards glides by framer-motion `layout`
  (transform-based, so it stays inside the compositing-safe rule). The crew
  day strip (`DayStrip`) uses it. The layout-switch spike (`/spike/layout-switch`)
  morphs a stacked column into a row over a pinned scroll range, eased with
  ease-in-out cubic; reduced motion shows the row with no scroll link.

### Reduced motion, and the written read

- Every visual read exists as words — the picture never speaks
  alone. A performed stage degrades to its written read, which must be
  complete.
- Reduced-motion fallback: the global flatten rule already in
  `globals.css` stands; spatial motion collapses to ≤ 150ms opacity, and
  reduced motion keeps every state legible as a static pose plus words.

### Honesty

- **Every figure comes from the model.** Any number, time or
  verdict a character states comes from the model; every performed figure
  still traces to the model, and a stage says what is live and what is
  choreographed.
- **Example provenance is declared.** The example trip loads only on
  request and never saves traveller trip, plan, or action data.
- **Exploring is not doing.** Inspecting or previewing never changes the
  saved plan, the action ledger, or the adaptation estimate.

### Characters never cover words

Sky and character areas are bounded; text, controls and timeline
rows sit on stable backings. The traveller passes *behind* words, never
over them.

### Microinteractions stance

- Press response (`scale(0.98)`) on primary actions only.
- Silent success over celebratory bursts; the one celebration allowed is the
  step-complete pop already shipped.
- Hover tooltips 800ms · focus tooltips 0ms.
- Count-ups only on numbers that changed because the traveller acted.

### CTA voice

- Primary: solid terracotta (or ember gold on ink stages), pill/14px radius,
  verb-first short copy ("Make my plan", "Fit to me").
- Secondary: hairline outline, ink or paper text.
- Buttons never wrap to two lines at any width (mobile floor).

### Copy voice

- One marker per state, not five sentences: a pill, a dim, or one line names
  a condition; the next surface does not repeat it. Honesty stays — hedging
  doesn't stack.
- Detail lives behind disclosure (`<details>`, drawers), not beside it.
- Labels are noun phrases ("Example traveller"), not explanations.

### Per-page allowances

- Landing MAY use the globe stage as full-bleed enrichment (it is real/modelled
  data — the product rule "nothing is decorative" holds).
- App pages MUST NOT add decoration; function carries the page.
- The day's instrument surfaces MAY break to ≈960px via `.wide` — the same
  `--hero-out` math the stages use, capped so small viewports only reach the
  frame edge. Sanctioned surfaces, in page order: the marks-waiting banner,
  the check-in card, the calendar summary, the rail card — the day stepper
  rides inside the rail, heading the list it selects. Prose stays in the
  720px `.reading` column.
- Statement pages (`/arrival`) may use one atmospheric ink gradient — the
  sunrise already earned there.

### What pages MUST share

- The wordmark (MERIDIAN, tracked caps) and the terminator-line motif.
- The accent placement discipline (terracotta = action; gold = the sun/data).
- Display + body + mono faces.
- CTA voice and radius rhythm.
- Section heading rhythm: eyebrow (tracked caps, 11–12px) stacked above a
  Fraunces display heading — never side-by-side hanging labels.
- **Step-kind data colours** (`--cat-*`): light gold, sleep violet, food
  terracotta, calendar blue, run pine, flight slate — deepened for cream,
  the stage palette on ink. Every step category keeps one hue across glyph,
  time and sky-strip band; data colours, never chrome. A step with no kind
  falls back to `--m-faint`, never to the accent: the fallback resolving to a
  category hue would let an unkinded row claim data it does not have.
- **The sky-strip motif** (`.tl-sky`): the day's steps drawn as a strip
  above the rail — windows as bands, moments as diamonds, a "now" caret on
  today only. It shares the category hues with the rows below, so strip and
  rail read as one day seen two ways. Empty days draw nothing.
- **Provenance as one quiet line** (`.evline`): the evidence row — gate
  verdict, revisions, memory, citation — as a single middot-joined line,
  not a row of chip boxes.

### What pages MAY differ on

- Macrostructure within the family.
- Hero archetype on statement pages.
- Stage ink vs cream base, per the mode rules above.

### Exports

The live token layer is `src/app/globals.css` (`@theme` + `:root`); it is the
source of truth, mirrored here for portability.

#### tokens.css

```css
:root {
  --color-ink: #07090f;
  --color-ink-2: #0c1018;
  --color-ink-3: #131826;
  --color-line: #1e2637;
  --color-paper: #e8eaf2;
  --color-cream: #f5efe6;
  --color-clay: #1e1b18;
  --color-accent: #d96b43;        /* terracotta — the one action colour */
  --color-accent-ink: #fff8ef;
  --color-sun-dest: #ffc46b;
  --color-ghost: #ffd98a;
  --color-sun-home: #9db8ff;
  --color-sleep: #b8a8ff;
  --color-focus: #85b1ed;

  --font-display: "Fraunces Variable", ui-serif, Georgia, serif;
  --font-body: "Inter Variable", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --font-mono: "JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, monospace;

  --space-3xs: 0.25rem;  --space-2xs: 0.5rem;  --space-xs: 0.75rem;
  --space-sm: 1rem;      --space-md: 1.5rem;   --space-lg: 2rem;
  --space-xl: 3rem;      --space-2xl: 4.5rem;  --space-3xl: 7rem;

  --text-display: clamp(2.6rem, 6vw, 5rem);
  --text-display-s: clamp(2rem, 4vw, 3.25rem);

  --ease-glide: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-settle: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-drift: cubic-bezier(0.4, 0, 0.2, 1);
  --dur-glide: 180ms; --dur-settle: 320ms; --dur-drift: 700ms;

  --radius-sm: 0.5rem; --radius-md: 0.625rem; --radius-lg: 0.75rem;
  --radius-xl: 1rem; --radius-2xl: 1.25rem;
}
```

#### Tailwind v4 `@theme`

Mirrored by the existing `@theme` block in `src/app/globals.css` (extended in
the Dawn pass with `--font-body`, `--font-display`, `--text-display*`).

#### DTCG `tokens.json` / shadcn CSS variables

Mechanical maps of the block above — omitted here until an export is actually
requested; this project consumes `globals.css` directly.


---

## Part 2 — Current state

The system as it is built today, not as proposed. Where this and Part 4
(round log) disagree, this is current and that is history.

### Genre

atmospheric (the night-side / cinematic school), crossed with the app's
existing dawn identity. Deep ink stages carry the drama; working surfaces
stay legible.

### Macrostructure family

- **Landing (`/`)** · Marquee Hero — full-bleed globe stage with editorial
  display type overlaid; the day rail scrolls beneath as an instrument.
  Today is the stable, actionable checklist — plan progress updates its cards
  in place rather than swapping the screen. The body-clock projection is
  read-only explanation below Today (`<details>` · `?view=clock`), not a
  competing view. First use is an explicit trip-entry form ("Arrive better
  adjusted."); the example trip loads only on request and never saves
  traveller trip, plan, or action data.
- **Clock explanation (`/` → "How my body clock is adjusting")** · the dial
  as read-only explanation below Today: the same locked plans and the same
  action ledger, no setup or action controls. The gold-on-ink `.clock-stage`
  styling remains with the retained legacy screen, not Home; dev and shift
  surfaces continue to use the shared dial widgets.
- **App pages** (`/review`, `/history`, `/outcome`, `/shift`, `/team`, `/crew`)
  · Workbench — instrument cards on the centred reading column
  (`.reading`, 720px), media allowed to break wider.
- **Content / payoff pages** (`/arrival`, plan share) · Statement — a poster
  moment: oversized display line, staggered fact cells, one closing action.

Pages within a family share the family's shape; they vary only in component
archetypes.

### Playable-day direction

The interaction model now follows the direction documented in
[docs/reference/interaction-research.md](reference/interaction-research.md):
a calm daily tool where the performance moment is the payoff, correctly timed
light is the mechanism, and taste-ranked places are optional, personal rewards.

The existing Cinematic Dawn system is retained — Fraunces/Inter/mono type,
Dawn Ember tokens, purposeful stage and motion with static fallbacks and written
equivalents for every interactive surface. This direction supersedes the earlier
stacked-card emphasis for the main feed; it does not change clinical policies,
the solver, the scorer, or the guided view.

### Stage-sky direction

`.hero`, `.clock-stage`, and `.arr` render a blue-black ink stage whose horizon
band and origin-blue residue come from the same solar model as the Window
Seat. `stageSkyFor` derives the body clock's sun altitude at the destination
from the planned residual, then luminance-clamps the horizon colour so paper
text stays readable. A null/hydrating date leaves the token defaults; the
model describes an estimated body clock, not weather or measured adaptation.

### Stages perform — the round-27 budget, superseded in spirit

What survives of the round-27 motion budget is what stages exist
to *do*. *Who may move, and when* is governed by Rule 3 in Part 1 — the
round-27 split and the round-50 amendment are both stated there, and dated in
the round log.

- **Stages perform.** Ink stages (`.hero`, `.demo`, the example stage,
  `/arrival`, crew surfaces) exist to *show* — they may carry ambient,
  choreographed life: the sun breathing on the horizon, the crew solving
  visibly, states morphing in their windows. Performance on a stage is the
  product, not decoration; the "nothing is decorative" rule binds as ever —
  every performed figure still traces to the model, and a stage says what
  is live and what is choreographed.
- **Working surfaces respond.** Today's checklist, sheets, forms and cards
  keep the standing law: motion is caused by the traveller or is the
  screen's reason to exist. No idle animation behind body text.

### The interaction principle (round 31)

The interface is quiet until you engage it; then it responds with character
and a legible consequence.

- **Engagement first.** A visitor reaches something they can operate — trip
  entry or the interactive day — without completing a presentation.
  Choreographed sequences are optional and opened on request.
- **Characters respond to state.** Crew avatars change state when the
  traveller acts or the plan genuinely changes. One character acts at a time
  unless two have something to say about the same change.
  *Amended round 50:* the prohibition this carried — "no perpetual idle loops
  behind text" — was the wrong constraint. It policed where motion happened
  instead of what motion meant, and it made every working surface inert. The
  law is now about the channel: no ambient loop on an element that carries a
  readout, ambient loops free on elements that carry none. See Rule 3.
- **Measurements are truthful; personality is expressive.** A glance, tilt
  or settle need not encode data; any number, time or verdict a character
  states comes from the model.

Its hard edges are Laws (Part 1): every stated figure comes from
the model, characters never cover words, exploring never edits, and the
motion gate binds it.

### Momentum — the round-32 trial

Moving things carry their velocity: trail, smear in proportion to speed,
coast, then settle — nothing snaps. The smear vanishes at rest and nothing
moves behind words. It sits behind a `motionMode` prop, A/B-able on
/dev/interactive-day, pending review; `prefers-reduced-motion` stands it
down into the settle behaviour entirely.

### The cast

The cast (canonical names from src/agents/crew.ts): Mara · analyst ·
crescent moon; Jun · researcher · lensed star; Otto · planner · compact
crowned sun; Iris · evaluator · eclipse eye; Rex · negotiator · comet. The
traveller stays the only face with lids and a mouth (SunSelf).

### Landing depth — round 33

Tester's read on the round-31 landing: repetitive, and the same flat
backdrop the demo had before its depth pass. The fix keeps the round-31
rule (engagement first, nothing pinned) and borrows two transferable
ideas — seamless scroll-driven transitions, and a paper grain carrying
depth in 2D — no WebGPU, no new dependencies.

- **The ambient depth is the demo stage's system, re-dressed for
  daylight.** `LandingDepth` reuses `demo-depth.ts`'s deterministic
  generators: two mote planes (`starPlane`), a horizon haze, two ridges
  (`ridgePath`), a warm sky band, and a fine grain from an SVG
  `feTurbulence` filter — the paper-shaders lesson on a cream surface,
  token-mixed so it adapts to the theme and never eats the text floors.
- **`--lp` is the page's descent.** One scroll-written variable drives
  every plane at its own rate — the sky recedes, the ridges compress —
  so the backdrop evolves continuously across the whole landing rather
  than swapping per section (the shader-sees reference's seamless
  transitions in 2D). Written imperatively per scroll frame — the scrub
  law: a transition would lag it. SSR and reduced motion meet the
  layered sky simply seated.
- **The traveller descends to the day.** The hero sun, after its
  one-shot peek, leaves the poster on scroll and settles on the example
  day's top edge — a measured perch (rects read with the transform
  cleared so the measure never feeds back), one transform on the orbit
  wrapper so the glyph's peek is never fought. The hero copy is
  positioned a layer up, so the traveller passes *behind* words, never
  over them (round 31: characters never cover words). Reduced motion
  never arms the trip.
- **One of everything.** The chrome owns the tagline, the hero line is
  the promise ("Land on their clock."), the hero anchor owns "Start
  with your trip" (the form's own header carries its block), the
  interactive day's lead adds what the headline lacks instead of
  restating its "next", and the macrostructure alternates its lean —
  centred poster, left-leaning day frame, two-column entry, numbered
  journeys, right-hanging rhythm — inside the family rules.
- **The day frame peeks.** A few px of instrument frame rise into the
  hero's bottom padding, so the first viewport ends on an invitation.

Verification: SSR surface locks (orbit, depth layers, honesty tag),
lead-vs-headline distinctness locks, one-CTA lock, design contract
(CHROME + floors) — typecheck, lint, full suite.

#### The journey we are actually selling

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

#### What landing cost, and what it found

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

#### Where the loop closed

Design consequences of implementation choices, so they belong here rather than
only in Part 3. Several of the sharpest ones have since been closed — kept
in place because the *shape* of the failure is the lesson.

#### Closed: the loop couldn't tell whose it was

Per-step did/skip marks flush as structured check-ins, but `recordCheckIn`
appended to a **single global `artifacts/crew-memory.json`** and
`foldCheckIns` folded *every* visitor's marks into one adherence profile. One
traveller skipping a 6am light moved the compliance floor for everyone else.
The first fix scoped memory by `meridian-tid` (`4933774`); the current beta
model derives a hashed owner from an anonymous HttpOnly session cookie
through the memory files, the fold, the graph writes and the run records.

The lesson generalises past check-ins: **"the crew learns" was a claim the
architecture couldn't honour.** If any future feature says "remembers", the
traveller identity has to be in the path that backs it.

#### Closed: failure was invisible, and one failure was terminal

A dropped stream never reset `phase`, so the CTA stayed disabled with Escape or
a reload as the only escape — and errors only reached a drawer that was closed
by default. Worse, **the cause was never the network**: the stream stays open
while the server waits on an optional write, so `onerror` couldn't see it. With
FalkorDB down, the run blocked after the briefing — no `done`, no artifacts, a
disabled button and no message. Optional writes are now bounded, and the client
treats *silence* as a failure in its own right (`4ba7b35`). Routes also have
error boundaries now, so a render throw is recoverable rather than terminal
(`deee7d9`).

#### Closed: the flight picker didn't control anything — twice

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

- ~~**The wake question** is asked only in the Edit sheet~~ — the surface half
  landed. `NudgeFeedScreen` (Today) asks it inline, gated to a demo-default
  baseline with the question unanswered, and retires once answered — which is
  what Rule 1's "one inline question on Today" now requires.
- **`/dev`** is a complete route with zero inbound links. `/team` closed its
  half of this: it is in `MoreSheet`'s list and `BottomNav`'s MORE_PATHS.
  (`/shift` is the opposite case: it got its own door because a mode switch
  inside the travel view made two products look like one.)
- ~~**`/crew`'s "Trip Setup" links to `?screen=setup`**~~ — the pill is gone
  from the code; `screen` no longer appears anywhere.

A control that looks load-bearing and isn't is worse than a missing one: it
spends trust.

#### Closed: the setup was a form, and the phone had no way to navigate

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

#### Closed: the plan's claim and the body's position were different numbers

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

#### Closed: no question was ever asked

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

#### Accessibility as product quality, not compliance

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

#### What I would not do

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
  `displayBiometrics()` (`63e8861`); the setup sheet's `m3` grid renders
  only on `hasAllBio`, with the upload slot beside it (`49c6722`).

---

#### ICP read — Alex on the landing (2026-10-17)

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
thing to surface — see Part 3.

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

#### Preview is not a promise

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

#### Calendar is the compliance surface

Alex does what the calendar says and ignores what an app suggests — but the
landing offers no `Connect Google Calendar` above the fold (only `sample —
connect yours` in the Edit sheet), and no `.ics` until after a ~45s run. There
*is* a reminder channel now (`useReminders` + `/api/push/subscribe`,
`017f6b2`), but scheduling is a client-side `setTimeout`, so a step only knocks
while Meridian is open — an installed app that is closed sends nothing, which is
the gap that actually remains. Done/Skip is extra work at
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

#### Promise the floor

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

#### No invented biometrics

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
`TripSetupScreen` half shipped `49c6722`: the `m3` grid renders only when
`hasAllBio`, and the `Connect your wearable` slot offers `Upload Garmin file`
whenever `baselineSource !== "garmin"` — so the upload route has a caller. The
manual pass with a real export file is what no test can do, and remains open.

#### The meeting is the product

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

#### The path to configuring your own trip is the thing missing above the fold

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

#### The globe is real, and reads as inert

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

#### The crew stays backstage on Calm

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

#### Where this lands

Items 11–16 — kept in [Part 3](#part-3--open-items) under their own provenance
heading — with owners, contracts and a day-by-day sequence. The short version:

| Item | Owner | Why | Status |
|---|---|---|---|
| 11 Preview is not a promise | A | Surface gate; `baselineKind` already exists | Shipped `63e8861` |
| 12 No invented biometrics | B, whole | One file, one brief — splitting it would be a handoff for nothing | Shipped `63e8861` (contract) + `49c6722` (setup sheet) |
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
meeting gap is item 15's own follow-on. See [Part 3 — Open items](#part-3--open-items)
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
/ UX 7.5 — see Part 4, §Round-4 ratings.

**Round 5 (filed 2026-10-17):** external browser-session review, every
item traced to source before filing. Six shipping-blocker visual bugs
(missing `.tl-tag` / `.cal-summary` CSS, light-on-light headings,
always-green history scores, cryptic zero-case, list-key warning) plus
four structural UX frictions (CTA honesty, dial placement, disclaimer
stacking, solver spacing). Priority: CSS first, headings/scores second,
copy/keys third, structural calls last. See
Part 4, §Round 5. Lane: almost all A
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
See Part 4, §Round 6.

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
Part 4, §Round 7.

**Round 7 follow-up (same day):** the landing's `.root` phone artboard
(868×1543) is released to a 1140px desktop measure — the "why does the
landing look like mobile, then /crew looks proper?" confusion is closed.
Cream day-side, ink night-side; both now feel like desktop on desktop,
and phones see no change.

**Round 8 (shipped 2026-10-24, superseded navigation):** the Cinematic Dawn
pass — the whole app retyped and restaged for the Base44 Challenge. The
design system it locked lives in [Part 1 — Laws](#part-1--laws): Fraunces
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
interventions or change timing. Three fictional sample journeys exercise Miles Mercer, Danny Rivers, and
Sofia Marchetti — imagined archetypes of the travellers Meridian serves,
disclosed as fictional examples. The stage itself now uses the shared sky model: its
horizon band rises with the body clock's estimated sun while origin blue
fades with the shift still owed. A frozen, privacy-gated Day Card exports
PNG/SVG and a vertical story view — still images for recording, not video
export or proof of completed steps.

---

## Part 3 — Open items

What is genuinely still undone. Round numbers below refer to Part 4.

**What is actually open, counted:** 4 structural UX decisions needing a call
each (5B), 2 wearable phases (one of them only the `/arrival` half), 4 deferred
items, and one manual pass with a real Garmin export no test can substitute
for. Everything else this Part inherited is **shipped** — the three sections the
old file ranked first ("Do first", "Next —
the product gaps", "Next — ICP read"), Track B in full, and three of the four
priority calls — each struck with the hash or the code line that closed it, and
kept below as provenance. Nothing in this Part has been validated with a user.

### Corrections applied when this was merged (2026-11-03)

The old `backlog.md` was wrong in both directions, so these were checked
against the code before being carried over:

- **Removed from open:** the 5A fixes and all of Track B. Round 5's own log
  entry records 5A1-5A6 as gone, and the code agrees (`.tl-tag` /
  `.cal-summary` defined, banded history score at `history/page.tsx:185`,
  composite row key at `:149`), yet the priority list still queued them first.
  Track B's B1/B2/B3 closed at `c95a5fe` / no-change / `src/domain/second-trip.ts`
  and the section still read "starting now".
- **Removed from open (again wrong in the same direction):** the reminder
  channel ("no notification infra exists" — `src/lib/push.ts` and `/api/push`
  shipped at `017f6b2`), Phase 1 of the wearable plan (the sky-strip
  complications are in `DaySkyStrip.tsx`), and two thirds of "Orphaned routes"
  (`/team` is linked from the More sheet; `/crew`'s `?screen=setup` pill no
  longer exists). Also: item 12's setup-sheet half, `49c6722`.
- **Decided, not open:** the "Landing tease" proposal. As written it asked for
  what Rule 1 forbids (the entry form demoted below the example), so it is
  recorded as rejected in favour of the route-first entry, with the showing
  half shipped elsewhere.
- **Removed from open:** the `heroReadiness` provenance labels, listed as "the
  one trust gap round 3 left open". They ship — `NudgeFeedScreen.tsx` and
  `HeroDawnPanel.tsx` both branch on `readiness.source` and say `"banked on
  preview"` for a preview. Nothing in Part 3 now claims the app says "locked"
  about a plan nobody locked.
- **Removed:** the "How to split this between two" file-ownership table. Its
  line counts were three weeks stale (`page.tsx` listed at 962 lines, actual
  2241; `NudgeFeedScreen.tsx` 947, actual 2209) and the split it encodes is
  not how the work is now done.
- **Renumbered:** the old file contained Round 9 twice, Round 10 twice and
  Round 14 twice, and put "Later / deferred" and "Closed" mid-file. Part 4
  resolves this by dating every entry.
- **Removed from open:** item 12's "`TripSetupScreen` half in flight", and the
  whole of "Also in this round". The `Connect Garmin (CSV)` affordance shipped
  `49c6722` (the `m3` grid renders only on `hasAllBio`), the terminator's rAF
  `6d62d56`, and `RoutePicker` above the fold `56965c1`. The old file therefore
  listed the same two findings as both open ("Also in this round") and shipped
  ("Carried — the same disease, different symptom") three sections apart.
- **Payments, corrected:** `arc-payments.md` told a reader that user-facing
  payment appears once the contract is deployed "and the flag is set".
  `.env.local` does set `NEXT_PUBLIC_PAYMENTS_ENABLED=1`, and it does nothing:
  `paymentsEnabled()` (`src/lib/payments.ts:54`) and `paymentsConfigured()`
  (`src/lib/escrow.ts:35`) are hardcoded `return false` for this beta, so
  `TripEntryScreen.tsx:57` early-returns and the live price read never runs.
  The on-chain work it describes is real and evidenced — see below.

#### Shipped, kept for provenance — was "Do first — small, load-bearing"

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
   `4933774`: `meridian-tid` cookie → `x-meridian-tid` header via middleware.
   Superseded for beta: the anonymous session cookie is the only identity;
   `?tenant=` and the legacy header never grant one, while memory files, the
   fold, graph writes, run records and `/api/memory` scope by the hashed
   session.
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

#### Shipped, kept for provenance — was "Next — the product gaps"

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

#### Shipped, kept for provenance — was "Next — ICP read (Alex, 2026-10-17)"

From the old `vision.md` §6: the landing pasted 2026-10-17 shows sample science
before it knows Alex, asks for work before earning calendar rights, and buries
the two things he pays for — the meeting and the calendar. Ordered by bounce
risk, not by file. The A/B owner each item was written with is named inline in
the item.

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
    **Surface half shipped `49c6722`** — `baselineKind` is forwarded through
    `page.tsx` so the setup sheet reads its own gate; the `m3` grid renders
    only when `hasAllBio`, and the `Connect your wearable` slot with an
    `Upload Garmin file` chip appears whenever `baselineSource !== "garmin"`.
    Landed as the affordance *beside* the grid rather than replacing it.
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

#### Owners for round 2 (provenance — all six shipped)

| Item | Owner | Why this lane |
|---|---|---|
| 11 Preview is not a promise | **A** | Pure surface gate. `baselineKind` already rides run state and `/api/trip`, so no domain change is needed. |
| 12 No invented biometrics | **B, whole** | Not a handoff. B strips fixture biometrics from the contract on `demo-default` **and** lands the `Connect Garmin (CSV)` affordance in `TripSetupScreen` — the same file, the same brief ("no invented numbers"), so splitting it across two lanes would just create a handoff for no gain. Closes the carried `Real integrations` remainder. |
| 13 Calendar is compliance | **A** render, **B** shape | B guarantees movable/fixed counts + `readinessLabel` + a previewable `.ics` shape pre-run from data that already exists in `TripSetupScreen`. A surfaces them above the timeline and changes the sticky primary to `Fit to me → to calendar`. |
| 14 Promise floor, window the asks | **A** | Formatting and copy only. The solver already holds `floor − 105min` and tries at/after-floor first (`architecture.md`) — surface it, do not re-derive it. |
| 15 The meeting is the product | **B** data, then **A** hero | B ensures `meetingReadiness` resolves pre-run for one real fixed event with attendees; A renders the hero subhead on it. **Sequential, never simultaneous.** |
| 16 Crew backstage | **A** | Isolated to the dial and the first viewport. Filler while B is on tests. |

#### Superseded — was "Also in this round"

Both work items this section asked for have since shipped, so it is kept only to
show what the read was. The globe's 60s interval became a throttled rAF at 4Hz
(`6d62d56`), the drag-while-animating ghost already exists, and the 1,145
airports behind **Edit → Edit trip** came above the fold as `RoutePicker`
(`56965c1`). The current text of both is under *Carried — the same disease,
different symptom*.

#### Next steps (carried)

- **Real integrations** — **Garmin: upload path shipped `92299c3`** —
  `POST /api/wearable` takes a sleep CSV → per-tenant baseline →
  `/api/trip` answers `baselineSource: "garmin"` + kind `garmin`. Item 12 shipped
  the contract (`displayBiometrics` returns null on preview) and the surface
  (`49c6722`: the `Connect your wearable` slot, and `m3` only on `hasAllBio`), so
  the upload route has a caller. **What remains** is the part no test can do: a
  manual pass with a real Garmin export file, not the fixture.
  **Flight inventory**: windows are now real planning inputs
  (`?flight=` threads through `c675c45`); live inventory remains deferred
  by design.

#### Carried — the same disease, different symptom

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

#### Shipped, kept for provenance — was "Track B — proof + performance"

All three closed (the hashes are at the end of the section), so the briefs below
are kept to show the contract each was written against.

- ~~**B1. Wake-answer acknowledgement (delight, contract-testable).**
  `resolveBaseline` re-plans the preview instantly with no refetch, but
  nothing on the hero says the numbers moved when the traveller answers.
  Contract: a pure `wakeAck(baselineKind, wakeBand)` shape in
  `domain/preview.ts` returning the acknowledgement copy (or null when no
  answer is in play); A renders one line. Test: demo-default + band →
  acknowledgement names the re-plan; garmin → null; demo-default alone →
  null. *(shipped `c95a5fe`.)*
- ~~**B2. `/api/trip` refetch-storm guard (performance).** — closed
  2026-10-17, no change needed. Verified: `RoutePicker`'s `onChange`
  fires only on committed picks (list selection, swap, valid date);
  keystrokes stay in `AirportField`'s local `query` state and never touch
  `origin`/`dest`, so no fetch fires per keystroke. The storm this item
  predicted does not exist. No gate, no debounce, no test — adding one
  would be code against a phantom.)*
- ~~**B3. Second-trip memory proof (value proposition).**
  Cross-trip summary needs a second real trip's data; #3 already scopes
  memory per traveller. Contract: extend the memory read path with a
  pure `secondTripProof(runs)` shape — "the crew remembers X from trip 1"
  or honest null when there is no prior trip. Test both. This is the
  Traveller-tier justification made visible; without it the retention
  loop is claimed, not closed. *(shipped — see the sequence below.)*

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

#### 5B. UX friction (structural — needs a decision each, not just CSS)

- **5B1. CTA over-promises.** "Fit to me → to calendar" triggers a ~45s
  crew run before any `.ics` exists (Part 2 already flags it: the `.ics`
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

#### 5C. Priority (reviewer's order) — only the last line is open

1. ~~5A1 + 5A2 (CSS definitions — biggest win, smallest effort, main screen).~~
   — shipped: `.tl-tag` and `.cal-summary` are defined in `globals.css`.
2. ~~5A4 + 5A5 (headings + score colour).~~ — shipped: `history/page.tsx:185`
   bands the label (`✓ Passed checks` / `Below our standard` / `Didn't pass`).
3. ~~5A3 + 5A6 (zero-case copy + key).~~ — shipped: the rows key on a
   composite (`history/page.tsx:149`).
4. **5B structural calls (CTA, dial, disclaimers, solver spacing) — open.**
   Each needs a product decision, not a patch.

Lane note, as written then: 5A was almost entirely `globals.css` +
`NudgeFeedScreen.tsx` / `history` / `review` (A's files) with one B-adjacent
contract question (5A5 filter rule, 5A3 translation boundary). B picks up 5B4
only if the solver rule changes; otherwise allA.

#### Later / deferred

- **Visual pass on `/spike/globe`** — the ring pulse, flight hairline and
  tooltip fades are shader/DOM effects this host cannot render headlessly;
  one human look confirms they read right (round 7).
- ~~**Reminder channel**~~ — shipped since this line was written: `src/lib/push.ts`
  + `/api/push`, driven by `useReminders` on the home page (`017f6b2` — "push to
  the device, not just the open tab"). The rule it was guarding ("don't fake a
  control") holds. What is still true is narrower than the line read: scheduling
  is a client-side `setTimeout`, so reminders fire only while the app is open —
  background delivery is the remainder, not the whole channel.
- **Cross-trip summary** — the shape ships (`src/domain/second-trip.ts`,
  B3, with its line on the hero); what is missing is a second *real* trip,
  because without Supabase keys `secondTripProof` stays null. That is the
  honest first-trip state, not a gap in the code.
- **Orphaned routes** — `/dev` is still complete with zero inbound links. Half
  this item is closed: `/team` is reachable from the More sheet and
  `BottomNav`'s MORE_PATHS, and `/crew`'s `?screen=setup` pill is gone from the
  code entirely. What is left of "link or hide" is `/dev` alone — a dev-only
  surface, so arguably the right answer is that it stays unlinked.
- ~~**Server-minted arrival share link**~~ — shipped 2026-10-31: `POST
  /api/share` accepts `{arrival,trip}` receipts (claimed vs delivered from
  the landing projection), renders on `/plan/{id}` with an OG variant, and
  the recipient CTA lands on `/?via={id}` with a prefill + `recipient_count`
  funnel counter. The client-side PNG/SVG passport export remains for
  image-first posts.
- **Video re-record** — shot list refreshed (hackathon-submissions.md §One
  video for all): check-in loop is the signature shot, flight picker is real,
  memory is per-traveller. Record after item 7 lands — the arrival surface is
  the payoff.

#### Wearable & quantified-self integration (planned 2026-10-31)

Ambient jewels, not stacked blocks. Three phases — one shipped, one half
shipped, one untouched:

- ~~**Phase 1 — Sky complications**~~ — shipped. Photon anchor, caffeine curfew
  and the DLMO wind-down render as complications on the existing
  `DaySkyStrip.tsx`, no new block.
- **Phase 2 — CAS on dial + /arrival payoff** — half shipped. The formula is in
  `domain/circadian.ts` (`circadianAlignmentScore`) and the dial renders it
  (`dial/CircadianDial.tsx`); `/arrival` still shows no alignment score.
- **Phase 3 — Everyday Rhythm Mode when no flight is booked** — open, no code.

#### Landing tease (proposed 2026-10-31) — decided against as written

Cold `/` should show, not ask: render the example trip's Today (read-only) as the
hero, with the entry form demoted to "Make it yours". Tease three artifacts
(body-clock dial + CAS, arrival scorecard, shareable passport card). Lead the
headline with the gap ("Your 07:00 Tokyo meeting is 23:00 body time").

**What actually happened, and why it wins.** Demoting the entry form to a
secondary "Make it yours" is what Rule 1 forbids: the route has to be the
traveller's before a plan is actionable, and the first number must be *theirs*.
The proposal's other half did land, just not on the entry screen — the showing
moved to `/demo` and the example stage (`entry.mode === "example"` renders the
same Today read-only), and the gap-led headline shipped as `heroMeeting`
(item 15). So the open question left here is not *whether* the landing shows or
asks — that call is made — but whether the example gets more of the first
viewport than it has now. That is a measurement question, and nothing in this
repo has measured it.


---

## Part 4 — Round log · history, not law

Append-only. Entries describe what a round intended and shipped at the time;
they are not a description of the current app, and several propose things later
rounds undid. Where two entries cover the same round they came from different
files and are both kept, marked by origin.

Rounds 1-27 are dated 2026-10-15 → 2026-11-02, rounds 28-30 on 2026-11-01, and
**rounds 31-49 had no written entry at all** — they existed only in commit
messages until this merge reconstructed them. That gap is the main reason this
file exists.

### From the old design.md appendix

#### Appendix — Round log · history, not law

The dated narrative of how the system got here —
round history, supersession notes, dated amendments, prior-budget
descriptions, and the studies that informed the Dawn pass. Nothing here is
binding; where a log entry and Part 1 disagree, Part 1 wins.

##### The motion-budget amendment (round 27, 2026-11-01)

The motion budget (round 27) widened the third rule: ink *stages*
may perform ambient, choreographed life because performance is the reason
they exist; working surfaces still only respond.

Superseded by the round-31 interaction principle (Part 2) for *who
may move, and when*; its gate bullet is now stated in Part 1.

Rule 3 of `docs/vision.md` ("respond to input; don't perform") is amended,
not retired. It always had an escape clause — motion may be *the reason the
screen exists* — and rounds 16–26 spent entirely on traveller-caused
transitions and left the surfaces still. The result, measured in testing,
was churn before the differentiator (the crew) was ever seen. The budget:

Its two venue bullets — *stages perform* and *working surfaces
respond* — survive as direction and live in Part 2.

- **The gate stands as stated in Part 1,** everywhere, on stages
  too. Reduced motion still stands everything down — a performed stage
  degrades to its written read, which must be complete.
  `tests/design-contract.test.ts` keeps enforcing *how* things move; this
  budget governed *who may move, and when* — the part round 31 superseded.

##### The inspiration corpus (studied 2026-11-01)

The pattern to copy is each one's discipline, not its effects:

- **Codrops Lookbook Hover Effects** (github.com/codrops/LookbookHoverEffects,
  MIT) — a card taking over a photograph along jagged/curved/folded edges,
  GSAP + WebGL, tap-to-reveal on touch. The grammar for the traveller
  lookbook: each window holds a state (drained, half-lit, radiant, asleep)
  and the takeover reveals the face that hour produces.
- **Museum of Motion** (github.com/johnpolacek/museum-of-motion, MIT) — 57
  GSAP exhibits, but the transferable structure is its `MOTION.md` brief:
  personality, curves, timing and rules, read by every agent session before
  touching animation. This file is Meridian's MOTION.md; a rule written here
  and enforced nowhere lapses, so motion work amends here first.
- **Smear Frames × Motion Blur Showreel**
  (github.com/niccolofanton/smear-blur-showreel, MIT) — beat-cut, nothing
  stops and nothing snaps: speed peaks sell the accents; a scrubbed sun may
  leave a short smear trail. The tempo reference for stage choreography.
- **GSAP joins the stack** for choreography-heavy surfaces (demo beats,
  lookbook takeovers, crew stamp). It is a dependency with its own standard
  license — keep it to the stages it earns; the existing CSS/view-transition
  vocabulary remains the working-surface default, and GSAP code obeys the
  same compositing-safe gate and reduced-motion guard.

##### Round 19 — Show, don't tell; unfold, don't dump (2026-11-01)

Two failures diagnosed by the "what's broken, why" sweep, both borrowed
against from a speed-run demo studied in last-human-standing:

- **The landing named artifacts it never showed.** "Body-clock dial + CAS"
  was a chip of text; the visitor never saw a dial. Now the three artifacts
  render live from the demo journey — dial with both hands, scorecard
  counting up, passport stamped — waking once on scroll. One strip below
  names what the crew times; the capability is visible without a bullet
  wall.
- **The example trip dumped the dashboard.** Ten card headers at equal
  weight is a data dump, not a story. `/demo` now tells it in the order the
  product promises it: stakes (two clocks, the gap) → crew (solved live,
  say so) → plan (arrival day, timed) → payoff (scorecard, stamped
  passport). Skip controls, arrow keys, scenario switch.
- **The demo's honesty rule is structural, not editorial.** Every figure on
  a beat is produced by `src/domain/demo-beats.ts` from
  `buildDemoScenario` → solver → `arrivalRead` → `arrivalPassport` — the
  same functions the live app trusts. The passport lands stamped OWED 4.5h,
  because that is what the example honestly carries; a demo that overclaims
  is worse than none.

##### Round 20 — Today opens as a stage (2026-11-01)

The critique carried over from round 19: Today dumped every section at
equal weight the moment a trip existed. Round 20 gives it a composition:

- **First paint is the stage.** `TodayStage` carries exactly four things —
  the modeled sky (the same `stageSkyFor` the dial trusts), the route chip,
  the two clocks, and one next step. The next line derives from the same
  `pickNextStep` the feed uses, with the same marks, so the stage never
  advertises a step the feed won't confirm.
- **The stage holds, then recedes.** The wrapper pins the stage for one
  beat past the first viewport; when the pin releases, a scroll-driven
  recede (transform + opacity, scoped to the wrapper's `--stage`
  view-timeline with length-based exit ranges) hands the page to the plan.
- **The rest rises on arrival.** Today's sections sit in `.today-flow` and
  reveal with the same cadence vocabulary the feed uses, one register up.
- **The phantom scroll container is gone.** `.root`'s `overflow: hidden`
  silently made it the nearest scrollport and froze every scroll-driven
  timeline inside it; it is now `overflow: clip`, and the motion-language
  test locks it there. This also un-froze the feed cadence and the trips
  deck in browsers where they had quietly never run.

Degradation is part of the effect: without `animation-timeline` support,
or under reduced motion, the stage is simply a section that scrolls away.

##### Round 21 — The demo becomes a gift (2026-11-01)

The send-a-link funnel only works if the link is worth clicking and worth
passing on:

- **The preview sells the click.** `/demo` carries Open Graph + Twitter
  meta with a composed image (`public/og-demo.png`): the real passport SVG
  from the demo journey, tilted over the stage's ink sky, with the stakes
  line as the hook. Regenerated by `bun run scripts/make-og-demo.ts` —
  rendered in headless Chromium from live domain data, so the preview can
  never drift from the story.
- **Sending is one tap.** The payoff beat offers "Send this to a jet-lagged
  friend": Web Share API where available, clipboard with visible
  confirmation as the honest fallback.
- **The peak beat lands.** The passport no longer merely appears: the frame
  drops in with a scale/rotate impact (`stamp-land`) and an ink burst
  blooms out from behind (`stamp-burst`) — transform + opacity only, inside
  the reduced-motion guard, settling to full rest.
- **One door, kept honest.** `/?demo=1` now actually redirects to `/demo`,
  as the distribution doc always claimed.
- **Visual regression covers what round 19–20 built.** Four new snapshots:
  both demo beats that carry art (stakes, payoff), the stage first paint,
  and the hand-off mid-recede. Laptop artifacts (`*-darwin.png`,
  `*-actual.png`) are gitignored — baselines remain runner-owned.

##### Round 22 — Watch what we built (2026-11-01)

Three closures on the round-21 open list:

- **Safari is not a degradation browser anymore.** The smoke pass assumed
  WebKit would fall back; WebKit 26 actually ships scroll-driven
  animations, and the stage recede runs there at behavioral parity with
  Chromium (mid-flight opacity at the hand-off point, full rest at the
  top, zero page errors across the whole walk). Reduced motion still
  stands everything down: static pin, opacity 1, `animation: none`. The
  `@supports` guards remain for the browsers that truly lack the feature —
  there the stage is a section that scrolls away.
- **All three demo lives walk clean.** Cedric (evening performance) and
  Alex (customer keynote) were driven through all four beats end-to-end:
  right moment, right joke, real solved shifts, timed rows in traveller
  words, honest scorecard arithmetic, stamped passport, and the payoff
  line that says exactly what was delivered. 22/22.
- **The funnel is readable.** `GET /api/funnel/summary` aggregates the
  round-17 events behind `FUNNEL_SUMMARY_KEY` (unset = locked, never
  open; no Supabase = `{configured:false}`, never invented). Aggregation
  is a pure module (`src/lib/funnel-summary.ts`): per-stage reach,
  trip-level conversion with honest nulls for empty denominators, and a
  trailing-week pulse. Queries and semantics live in
  docs/reference/funnel.md.

##### Round 23 — The sun-self: the body clock given a face (2026-11-01)

Research (Tavily sweep: Finch, the Tamagotchi effect, mascot placement
systems, procedural SVG, Wrapped-style sharing) settled the shape of it:

- **Not a pet — the traveller's own meridian.** Every wellness app ships a
  companion to care for. Meridian's creature is the traveller's body clock
  itself: you can't neglect it, because it's you. That also kills the guilt
  problem at the root — Finch's zero-guilt law is kept anyway: a skipped
  window closes the lids gently; nothing wilts, nothing turns red.
- **One geometry, everywhere.** The dial is a sun on a ring with twelve
  ticks; the sun-self is that same sun stepped off the ring, with eyelids.
  Twelve rays (locked days light them), a halo (delivered/required), lids
  (residual debt, capped — worse than 9h is not a sadder face), a tilt
  (east leans into tomorrow, west leans back). `src/domain/sun-self.ts`
  computes the face; `src/components/SunSelf.tsx` draws it — procedural
  SVG, zero assets, zero inline styles, hex lives in CSS.
- **The face is the honesty contract made visible.** States map 1:1 to the
  numbers the passport stamps: OWED 4.5h of 9h renders half-lit, never
  radiant. `sunSelfForBeat` in demo-beats fixes what each beat may show.
- **The personas are fictional now, and sharper.** Real celebrity names
  were a right-of-publicity liability (fictional quotes under real names);
  the trio became archetypes of the travellers we serve: Miles Mercer
  (the deal-flyer), Danny Rivers (the comic), Sofia Marchetti (the
  taste-first founder). Legacy `?s=cedric|alex` links fall back to Miles
  instead of erroring.
- **Immediate visible response.** The glyph's pulse replays on mount by
  key — transform-only, guarded — ready for the round-24 wiring where
  every genuine step forward (check-in, day locked) lights the face.

Phase C/D follow: the stage sky's sun becomes the traveller (glyph at
`--stage-sun-x`), the dial's center marker becomes the glyph, check-ins
pulse it, and the passport carries it — every passport becomes a portrait
of that trip.

##### Round 24 — One face family, every place it belongs (2026-11-01)

Phase C + D of the sun-self, plus a discovery that reshaped the plan:
**Meridian already had a face** — SolLuna, the half-sun/half-moon mascot
in the dial, whose split is the misalignment gap. Shipping a second
creature would have split the brand, so this round converges instead of
adding:

- **One face family, two roles.** The sun-self is the traveller; SolLuna
  is the crew's alignment readout. SolLuna's sun half now speaks the
  sun-self's language — the same lids law (`sunSelfLidForDebt`, shared
  from the domain), the same gentle closed-lid arc, three rays crowning
  the sun half. The moon half stays a moon: it is where the night should
  be. Locked by tests on both renderings.
- **The stage sky carries the traveller (C).** The face sits on the
  horizon band of Today's stage, computed live: debt for lids, banked
  shift for glow, locked days for rays. It lights on every genuine step
  forward — a done check-in remounts the pulse by key; a skip changes
  nothing (zero-guilt: the light simply stays where it is).
- **The empty entry sleeps, it does not sulk (C).** No route yet means no
  debt yet: `sunSelfSleeping()` — lids closed, no rays, "the sun rises
  when the trip does."
- **The passport is a portrait (D).** `arrivalPassportSvg(pp, sun?)`
  carries the traveller's meridian beside the stamp with a caption —
  "THE TRAVELLER'S MERIDIAN — {mood}" — in the live card, the download
  pipeline, the demo payoff, the landing artifacts, and the OG image.
  No computed read, no portrait: the export never invents a face.
- **The exported twin.** `sun-self-svg.ts` renders the same geometry as
  the React component from the same read — tests lock ray counts, the
  closed-lid threshold, and the halo formula across both renderers, so
  the image that leaves the app can't drift from the face inside it.

Verification: 892 tests (13 new), 9/9 round-24 browser checks, full
regression stack (13/13 · 20/20 · 22/22 · 10/10), OG regenerated.
Baselines refresh for entry, home, stage and the demo payoff.

##### Round 25 — The face wakes; the portrait travels (2026-11-01)

Two steps of the embodiment roadmap, both extending the round-24 law:
the face is computed, never authored.

1. **The landing face wakes as the route is typed.** The entry's sun-self
   was asleep pending a route; now it resolves the moment `routeGapRead`
   does — drained by the full gap, tilted toward the direction, zero rays
   (nothing banked yet), one wake pulse armed. A same-timezone route gets
   the radiant "body clock home" face, because the domain says so, not
   because it flatters. The face reacts before any number appears.
2. **The body-clock portrait — the Wrapped play.** One shareable
   state-portrait (1080×1080, the document palette, the face IS the card):
   `sunPortraitSvg({read, routeLabel, subLabel?})` renders only what the
   caller computed. Ships on the arrival card ("Portrait" button, present
   iff a read exists) and the demo payoff ("Save the portrait"). Both ride
   a new shared export pipeline (`download-svg-image.ts`) — the day card,
   passport and portrait now share one SVG→canvas rail.

Also verified on the way: the feed→stage pulse needs no wiring — the feed
and the stage share `tripActions.marks`, so a done check-in already lights
the face. The missing piece is the per-step receipt line, which needs the
model to attribute banked minutes to individual steps (not invented) —
queued as the next round.

Verification: 900 tests (7 new), 9/9 round-25 browser checks (including a
real PNG download), regression stack green (9/9 · 13/13 · 20/20 · 22/22 ·
10/10). The demo-payoff baseline refreshes for the new button.

##### Round 26 — The done step answers (2026-11-01)

The feed's done copy said "about N min closer" from editorial weights;
round 26 makes the answer a **receipt** with two layers, each doing what
it is best at:

- **The PRC model is the gate.** `interventionSupports` was extracted
  from `modelShiftMin` (behaviour-preserving, tests unchanged) so a
  receipt can ask: did *this* step, at *this* time, actually support
  today's shift? Dead-zone light is logged warmly ("still anchors the
  routine"), an opposing step is logged and credited nothing — never
  scolded, never flattered.
- **The share is the number.** The validated day shift apportioned to
  the step's kind (`stepImpactMin`), worn as "≈ N min of the day's M
  min — banked" — day-neutral, because the timeline spans many days.
- **Receipts only on committed plans.** Preview mode (the sample
  persona's numbers) keeps the standing copy; attribution appears the
  moment the traveller's own baseline ends preview. The receipt line
  renders on the *closed* row — immediate visible response where the
  action happened, per Finch's law.
- **A real bug fell out of the smoke test.** Marks toggled in live mode
  could vanish: `useTripActions.mark` persisted inside a React state
  updater, and React's re-run of updaters toggled the mark right back
  out (preview mode masked it — persist skips there). Fix: compute from
  a ref, persist outside, set a plain value. Reload-persistence is now
  browser-locked.
- **The gift buttons get a visual guard.** The demo payoff's CTA row
  sits below the 844px fold; a second scrolled snapshot
  (`demo-payoff-ctas.png`) covers it.

Verification: 907 tests (8 new receipt locks), 7/7 round-26 browser
checks including mark survival across reload, regression green
(9/9 · 9/9 · 20/20), lint/typecheck clean.

##### Round 27 — The example becomes one stage (2026-11-01)

The funnel leak, confirmed in testing: the example surfaces went flat
against the landing's stage grammar, grew instead of transforming, and hid
the crew. Three fixes, one law — nothing grows; everything transforms:

- **One stage, not three steps.** The pick→scrub→plan flow and the "Scrub
  this day" button are retired. Day chips, the modeled sky, the scrubber
  and the plan share one screen (`ExampleStage`); dragging the hour
  transforms the stage in place — the sun crosses the sky, the horizon
  band follows via `stageSky`'s luminance clamp, clocks and windows
  re-read. `?day=` still restores; a stale `?step=` is inert.
- **The sun is the hero render.** `StageSun` draws one large disc
  positioned by the solar model (`stageSunFor` — the position is data,
  the below-horizon hold rides the band) with the sun-self face inside it
  (round 23's queued phase C, delivered). A fast scrub leaves a short
  transform-only smear; the halo breathes on stages only (the motion
  budget's first ambient). The written read names the altitude — the
  picture never speaks alone.
- **No theme jump.** `.demo-root` paints the shared ink-stage backdrop;
  the night-theme repaint skips stage roots (stages stay ink in both
  modes — a cascade bug the round found: `.root` specificity was
  out-painting the stage after client navigation). `/demo`'s beats sit on
  the same grammar, and the small per-beat glyphs that duplicated the
  hero sun are gone (one marker per state).

Verification: 907 tests (url-restore, SSR and stage-css contracts updated;
StageSun/ExampleStage/DemoBeats join the chrome scan), typecheck + lint
clean, 8/8 browser checks at 390×844 including client-navigation and
night-theme backdrops.

##### Round 28 — The crew performs in the first viewport (2026-11-01)

The differentiator stopped hiding behind the More menu:

- **The gate stamp is performed, not prose.** `crewPerformance()`
  (domain) is the gate's transcript as data — each day's verdict is
  `evaluatePlan` re-run incrementally over the solver's plans, the cues
  are the plan's own interventions, the banked minutes the locked shifts.
  `CrewPerformance` plays it: agents speak one line each, cues land as
  category-hued diamonds on 24h lanes, days lock with the real verdict
  stamped (`PASS 0.95` — or `FAIL` with the violation codes, honestly, if
  the gate ever bounces). The pacing is authored; every figure is
  computed. `crewScript`/`crewStateAt` make the choreography pure and
  monotone — once locked, a day never un-locks.
- **Two venues, one performance.** The demo's crew beat plays it full
  (skip + replay controls); the landing's first viewport carries the
  compact strip (plays once on scroll into view, brisker pace so it
  finishes before the visitor scrolls).
- **Reduced motion renders the result outright** — the finished state is
  derived, never set, and it is the written read (Rule 2).

Verification: 918 tests (domain locks for verdict/cue/bank honesty, SSR
surface, motion-language contract: opacity+transform only, flattened
under the guard), typecheck + lint clean, browser checks at 390×844 —
all four agents speak, 5 days lock with real stamps on both surfaces,
skip/replay work, reduced motion shows the result immediately.

##### Round 29 — The lookbook of states (2026-11-01)

The avatars idea, brought to life — but stylised, never photographic
(round 23's right-of-publicity lesson binds). GSAP joins the stack here,
for exactly the surface the motion budget admitted it for:

- **Five windows, five computed states.** `lookbookWindows()` builds the
  gallery from the demo journey: asleep (the empty-entry face), drained
  (the stakes beat's read), lifting (the crew beat's), half-lit (the
  payoff's), adjusted (the fully-banked read — the whole shift delivered,
  no plan days locked so the glow carries the face alone). Every
  face is `sunSelfForBeat` / `sunSelfSleeping` output; the window's state
  word is the read's own mood word. Nothing authored, nothing invented.
- **The takeover crosses on a jagged edge** — the Codrops lookbook
  grammar: a clip-path polygon whose points land staggered (`EDGE_DOWN →
  EDGE_JAG → EDGE_FULL`), never a plain wipe. GSAP animates clip-path
  only; the pane hides by default so no frame flashes before the
  choreography arms. Clip-path stays in the paint-only allowance.
- **The input model is hover OR pin.** Hover is transient (fine pointers
  only, guarded by the media query); click pins or unpins and survives the
  pointer leaving — the deliberate path that serves touch and keyboard
  alike (windows are native buttons, Enter/Space fire the pin). A
  focus-reveal was built and then retired: it fought the tap toggle.
- **The written read comes first (Rule 2).** Each window names its hour
  and carries the read's honest line; the revealed face is the
  enhancement. Reduced motion skips the choreography and shows the face
  outright.

Mounted below the landing artifacts — the crew performs, the artifacts
prove, the lookbook humanises. GSAP is pinned to stages it earns; CSS and
view transitions remain the working-surface default.

Verification: 929 tests (lookbook domain locks, SSR surface, 3
motion-language locks: clip-path-only choreography, hidden default pane,
fine-pointer hover guard), typecheck + lint + production build clean,
browser checks — phone tap pin/unpin, desktop hover/pin/leave/keyboard,
reduced-motion instant reveal, zero page errors.

##### Round 30 — The landing is the flight (2026-11-01)

The tester feedback that ended the exhibit era: the landing read as a list
of proof, not a journey — pain stated once then abandoned, the mechanism
never said in plain words, no protagonist, no time axis. The fix is not
better exhibits; it is one stage the visitor scrubs with their scroll.

- **One pinned stage, scroll-scrubbed.** `LandingStage` pins a 100dvh ink
  stage inside a 440vh track; `useScroll` progress is the only driver —
  the page's own DawnScrubber law applied to the whole trip. The beats:
  the gap (two dawn lines held apart by the owed ratio, the body's drawn
  in origin blue) → D-5 · the night before (the crew performs) →
  mid-crossing (the sun travels its modeled arc, the tally counts) → the
  first morning (the jagged takeover, honestly scored). The lookbook
  follows as the epilogue — the states you just flew through, free to
  explore.
- **Every figure is `landingFrame(journey, p)`** — one domain function
  per frame: `stageSky`, the body-solar altitude (fixed at the meeting
  instant, `LANDING_INSTANT`), the ghost separation and the sun-self read
  all recompute from `owedMin` as banked hours ease in. Nothing is
  tweened by hand: at p=0 the face *is* `sunSelfForBeat(stakes)`, at p=1
  it *is* `sunSelfForBeat(payoff)` — locked by test, not by inspection.
- **New vocabulary, written here first (the MOTION.md rule):**
  - *The stage scrubs.* Scroll position maps to model state; reversing
    scroll reverses the flight. Stage vars are written imperatively per
    frame, so this stage stays out of the shared `--stage-*` transition
    block — a transition would lag the scrub.
  - *Smear rides velocity.* Scroll speed, not drag speed, stretches the
    halo — the showreel's tempo law applied to a scrubbed page.
  - *The takeover scales.* The lookbook's jagged clip-path edge now
    crosses the whole stage to reveal the morning — same polygon grammar,
    stage scale.
  - *Hidden beats leave the tab order.* `visibility` follows each beat's
    scroll window, so a faded beat is never focusable — opacity alone
    was not enough.
  - *The traveller is the constant.* The sun-self face rides above every
    beat and is the object the hero promised and the morning lands.
- **Copy surgery.** Pain said once (hero), mechanism said once (one plain
  sentence), "moves it — or moves you" retired, the entry's story tiles
  and demo-artifact tiles cut (the stage already proved them), the entry
  headline stops restating the demo's pain and says "Your turn." until the
  draft resolves into *their* gap. EverydayRhythm leaves the funnel —
  below the form now.
- **The stacked read stands.** Unstaged (SSR, reduced motion, no JS) the
  same markup renders the beats as plain sections with the crew
  transcript and both artifacts complete — `data-staged` flips only on
  the client when motion is allowed. The sun and dawn lines hide; their
  facts all have written carriers.
- **Two ways in from beat 0:** "Start with your trip" anchors to
  `#trip-entry` (the form is now the hero CTA's target — the page is
  about the visitor's pain, not just the demo's), beside the demo link.
- **The last act is theirs (phase 3).** `TripEntryScreen` reports the
  resolved `RouteGapRead` + solver coverage upward; the stage replays the
  same arc at the visitor's scale — their gap, their direction (west
  draws the ghost on the far side), their destination's sky, and the
  solver's own coverage as the banked cap. `RouteGapRead` carries
  `signedShiftMin`/`destLat`/`destLon` so the body sun rises over *their*
  route, not the demo's.
- **The dawn-drag.** Beat 0 offers a range input over the ghost line:
  the visitor may explore owedMin, but only inside the plan's honest
  range — `[required − bankedCap, required]`, clamped in the domain, so
  nobody can merge the dawns past what the plan actually carries. The
  dawns, sun, sky and face all answer live through the same frame.

Verification: 955 tests (landingFrame locks — endpoints equal the beats'
own reads, visitor scaling/direction, drag bounded by the plan's range,
banked monotonic, ghost never merges; SSR written-read + visitor-route
completeness; 7 motion-language locks), typecheck + lint + production
build clean, browser check — staged arms, all four beats perform with
model values, zero console errors.

##### Round 27–29 direction — the example becomes a performance (2026-11-01)

Testing found the funnel's real leak: the shared link lands people on the
example surfaces, which go flat and dark against the landing's stage
grammar, grow instead of transforming ("Scrub this day" extends the page
with a verbose step), keep the sun as a small glyph when it is the page's
only visual argument, and hide the crew — the differentiator — behind the
More menu. Three rounds, in order, to make the example play cinematically
end-to-end with nothing in it to apologise for:

1. **Round 27 — the example is one stage.** Kill the three-step
   pick→scrub→plan flow for a single stage: day chips, sky, scrubber and
   plan on one screen, where picking a day or dragging time *transforms the
   scene in place* (the motion law: the thing you touched grows into the
   surface, never page extension). The scrubber drives `stageSkyFor` — the
   modeled sun crosses the stage as time moves, the horizon band follows,
   and the plan re-reads at the scrubbed minute. The sun becomes the hero
   render: one large disc positioned by the solar model with the sun-self
   face living inside it (round 23's queued phase C), and a short smear
   trail on fast drags. This also closes the theme jump: the example is
   ink-stage everywhere, same grammar as the landing.
2. **Round 28 — the crew performs in the first viewport.** The gate stamp
   is the agentic proof and it is currently prose. The crew beat (and a
   compact strip on the landing) performs it: solver draft cues slide into
   place, the scorer stamps PASS, day chips lock and rays light —
   choreographed, computed live, labelled honestly (which parts are live
   and which are scripted, per the contested-day honesty rule). Four static
   lines become four agents visibly doing work.
3. **Round 29 — the lookbook of states.** A grid of windows, each holding
   a traveller state (drained, half-lit, radiant, asleep), revealed with
   Lookbook-style edge-morph takeovers on hover/tap: the window's hour
   ("06:00 body time") morphs into the face that hour produces. States map
   1:1 to `sunSelfForBeat` — computed, never authored. Stylised/procedural
   travellers, not photoreal or real people: round 23's right-of-publicity
   lesson still binds.

Success for the sequence: the example plays end-to-end as one performance
on an ink stage, the crew is seen before any menu is opened, and every
performed figure traces to the model. Visual baselines refresh per round.

### From the old backlog.md

#### Round-3 follow-on — closed in the same round

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

#### Round 4 — the 9/10 plan (trust, craft, proof)

Ratings after round 3: design 8, UX 6.5, proposition 7.5. The gap to 9/10
is not new capability — it is trust (provenance labels), craft (dead ends,
first-viewport parsing load), and proof (one traveller through trip two
with a connected calendar). Three tracks, same file-ownership rule as
round 3. B's contracts exist (`previewLockedOf`, `heroReadiness` in
`4090d7c`); A adopts them.

##### Track A — craft + trust labels (A's files, shipped)

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

#### Round-4 ratings (post-ship, 2026-10-17)

Design 8.5 (was 8): cream surface kills the imported-chrome read; arrival
reads in two passes; hero delta is glanceable. UX 7.5 (was 6.5):
marks-waiting banner is the biggest win (the check-in loop was closed but
invisible); wake acknowledgement closes a feedback hole; second-trip proof
is correctly scaffolded but mostly potential until Supabase-backed history
exists. Still capping a 9: provenance labels (`heroReadiness` unadopted),
first-viewport parsing load, orphaned routes, unverified mobile.

#### Round 5 — browser-session findings (verified 2026-10-17, all cited to source)

External review across Home (desktop + mobile), `/arrival`, `/crew`,
`/review`, `/history`, traced to source before filing. Every item below
was verified in the tree: class cited → `grep` in `globals.css` →
confirmed absent/present as claimed. Priority is the reviewer's, kept
because it is right: cheapest visual wins first.

##### 5A. Shipping-blocker visual bugs (all verified — the classes are truly missing)

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

#### Round 6 — the four bets (shipped 2026-10-17)

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

#### Round 7 — the delight and intuitiveness pass (shipped 2026-10-17, `6d43b41`)

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

#### Round 8 — the clock, the loop, and one planner (shipped 2026-10-20)

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

#### Round 9 — the crew in view, and the refit (2026-10-31)

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

#### Round 10 — the crew's work as the artifact, not a feed (2026-10-31)

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

#### Round 10 — the agentic surface (direction set 2026-10-31, prototype live on `/dev`)

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

##### Concepts (ranked)

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
   `ignoresInterventionsBeforeMin` for that run — the `crew_answer` echoes
   the move back as an `effect` clause when the pick changed something, so
   "you answered" is never followed by a change it didn't cause. Cheapest
   change with the
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

##### Rules the surface is held to

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

##### Item split (when this round gets staffed)

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
- **Depth model (`?depth=`).** The dial maps to *evidence depth*, not agent
  visibility: `guided` expands the why-drawers, `operator` routes to
  `/crew`. A `crew_question` asks at every depth — it is a decision, not
  detail — and the trace stays collapsed at simple. Shipped alongside:
  the menu's live-run row ("Crew working — Otto → submitDayPlan · 2/5
  locked", links to `/crew`), per-cue provenance in `.evline`
  (`solver's slot` / `planner moved +30m`, diffed against `solverDraft`),
  and concept 2's first half — locked-day cue diamonds on the ShiftBoard
  tap straight into the shared action ledger, so a mark there and a skip
  on Today are the same constraint reaching the next replan.

#### Round 11 — The Core Mobile Experience, Ambient Glanceability & Recovery Pass (2026-10-31)

Addresses the traveller's real-world environment (brain fog, mobile thumb reach, touch collisions, offline flights, and unexpected disruption). Shipped in `c9a8e1c` and `3cfe43c`.

##### Items (ranked)

1. **UndoToast mobile elevation (P1, Bug/Ergonomics).** `UndoToast` sits at `bottom: 24px`, directly colliding with `.bottom-nav` on phones (`bottom: 0`, ~84px with safe-area padding). Move toast positioning to clear the bottom nav on mobile viewports (`calc(env(safe-area-inset-bottom, 0px) + 72px)` on narrow screens, `24px` on desktop) using CSS variable or responsive styling. (Shipped)
2. **The "Right Now" glanceable status card (P1, Product/UX).** High-cognitive-fatigue travellers opening Today need an instant answer to *"What should I do right this second?"* Render a prominent ambient status banner at the top of Today / active day:
   - Current active window (e.g. `☀️ Seek bright light · Active until 10:30 (45m left)`) or countdown to the next upcoming intervention (e.g. `☕ Caffeine curfew in 1h 15m (Cutoff at 14:00)`).
   - Low cognitive load, high contrast, zero scrolling required to see immediate instruction. (Shipped)
3. **Adaptive recovery on skipped interventions (P2, Product/Honesty).** Skipping a nudge currently registers a mark without offering guidance, feeling punitive or dead-end. When a critical intervention (morning light, caffeine, or sleep) is marked skipped:
   - Show an immediate, non-punitive circadian recovery tip (e.g., *"Missed morning light? Get 20m of outdoor light at midday and avoid evening blue light"*).
   - Clarify the scientific rationale without blaming the traveller. (Shipped)
4. **Offline & in-flight reassurance badge (P2, Polish).** When a user is offline (airplane mode or poor cellular), show a calm indicator: *"Offline ready · Full plan saved on device"*. (Shipped)
5. **Day navigation swipe affordance & scrubber micro-steps (P2, Mobile interaction).**
   - Provide touch swipe support (touch start/end) across the day rail to switch days smoothly with a thumb.
   - Add stepped ±15m micro-jump buttons alongside the 1440-minute slider so precise times can be selected on phone touchscreens. (Shipped)

#### Round 12 — Circadian Habit Loop & Wearable Photobiology Pass (2026-10-31)

Bridges quantified wearable health data (Whoop / Oura / Garmin) with photobiological causation without adding stacked card bloat. Principle: *Ambient Jewels, Not Stacked Blocks*. Shipped in `55ad698` and `e876d2a`.

##### Concepts & Architecture (ranked)

1. **The Three Sky Complications (P1, Ambient UI).**
   Instead of new text cards, integrate three tactile circadian milestones directly into the existing solar timeline (`DaySkyStrip` and Hero Horizon):
   - **☀️ Anchor Photons (Morning):** Micro-badge pinned at local dawn/wake + 30m. Tapping banks morning photons with haptic feedback.
   - **☕ Clearance Curfew (Afternoon):** Hairline marker at target bedtime - 10h (adenosine receptor protection countdown).
   - **🌙 DLMO / Virtual Sunset (Evening):** Twilight gradient notch 90m before target sleep window (dim-light melatonin onset).
   Zero block clutter; ambient visual markers with tactile micro-interactions. (Shipped)
2. **Circadian Alignment Score (CAS) & Quantified Payoff (P1, Metric/Payoff).**
   - Wearables track duration; CAS measures circadian timing match ($Hours\ inside\ biological\ sleep\ gate / Total\ sleep$).
   - Kept off the daily active checklist (no cognitive fatigue when tired); surfaced on `/arrival` and `/outcome` as the quantified scientific payoff ("CAS 88% · Aligned sleep · Deep sleep protected").
   - Grounded in Eastman (2005) & Burgess (2010) phase response literature. (Shipped)
3. **Everyday Circadian Anchor (P2, Retention Loop).**
   - When no flight is active, Today smoothly pivots to home city solar rhythm, giving travellers a 365-day photobiology ritual rather than an empty flight form. (Shipped)

#### Round 13 — Lock-Screen Habit, Multi-Timezone Clarity & Real QA Pass (shipped 2026-10-31)

Solves the primary mobile drop-off vectors (app switching, temporal disorientation across timezones, and unverified edge-case mobile interactions).

- **Dual/Triple Timezone Clock Bar (Shipped):** Live local time for Home & Destination with direction & hour offset (`TimezoneClocks.tsx`), mounted below the trip route chip.
- **One-Tap Live Calendar Subscription (Shipped):** Mounted `SubscribeCalendar` directly in Today's action bar for instant webcal sync to iOS/macOS/Google calendars.
- **Design Contract Ratification (Shipped):** Tokenized styling with 0-hex and 0-inline-style ceilings ratified in `tests/design-contract.test.ts`.

#### Round 14 — In-Flight Cruising Mode, Wearable Widget Feed & Multi-Route QA (2026-10-31)

Closes the loop between pre-flight preparation, the actual in-cabin flight experience, and lock-screen/wearable habit retention.

##### Items (ranked)

1. **In-Flight Cruising Mode & Cabin Guidance (P1, In-Flight UX).**
   - Provide an ambient toggle on the offline pill ("✈ Cruising / In-flight").
   - When engaged, surface an in-cabin circadian milestone card: direction-aware sleep/nap strategy, eye shades/light protocol, and meal timing.
2. **Lock Screen & Wearable Widget JSON Feed `/api/feed/[id]/widget.json` (P1, Habit & Complication).**
   - Expand `FEED_SURFACES` in `feed-store.ts` to include `"widget"`.
   - Expose `/api/feed/[id]/widget.json` returning high-efficiency, lightweight JSON for iOS Scriptable / Widgy / LockFlow widgets:
     - Home & Destination clocks, minutes to next circadian zeitgeber, current phase, and Circadian Alignment Score (CAS).
3. **Multi-Route End-to-End Scenarios & Integration Verification (P2, QA & Science).**
   - Verify comprehensive multi-route scenarios across eastbound (LHR → HND), westbound (JFK → SFO), and trans-Pacific (SFO → SYD) flows.
   - Assert timezone offset handling, widget feed calculation, and cabin guidance accuracy.


#### Round 14 — The landing shows the product, not a form (2026-10-31)

User feedback: the landing "feels like a safe, boring, old-school landing
page" — a setup form with a promise, no proof the product produces
anything. The fix is to show real computed artifacts, not marketing
copy — every number on the page comes from the solver, labelled example,
never mocked. Deliberately NOT doing: flipping cold `/` to the example
trip (breaks the tested `resolveHomeEntry` precedence — a cold visitor
with a saved trip would land on someone else's plan), and autoplay film
(violates the motion contract; the replay stream on a live ShiftBoard
is the honest version, phase 2 if wanted).

##### Items (ranked)

1. **Gap-led headline (P1, copy) — shipped `HEAD`.** Now computed, not
   copy: `domain/route-gap.ts` reads the draft route and renders "A 07:00
   morning in {dest} is {body} body time" (or the no-shift / unknown-airport
   honest fallbacks). The static signature line is only the pre-typing
   default. Lives in the domain so the DST and westbound maths are asserted,
   not eyeballed.
2. **Form-reactive live preview (P1, the forward-thinking signal) — shipped
   `HEAD`.** The live line under the form now leads with the gap +
   direction (`8.0h to move · eastbound`) from `routeGapRead`, then the
   solver's adapted % and first light. **Bug found + fixed while wiring:**
   the prior `planPreview` ran the solver with no baseline, and the solver
   places *zero* days without one — so the "lands NN% adapted" figure never
   rendered and the example triptych showed a 0h payoff. Both now pin
   `GARMIN_BASELINE` (labelled example), which is also what surfaced real
   numbers in the tiles.
3. **Artifact triptych (P2, proof for scrollers).** Three tiles under the
   form, all computed once from `DEMO_TRIP` + `previewPlan` and labelled
   example: the CAS alignment score, one locked day's cue strip, and the
   arrival payoff line from `coverageOf` (banked vs owed, honestly).
4. **"See a real plan" escape (P2, already present).** The example link
   stays a one-tap door into the read-only live trip — kept, not buried.

#### Round 15 — The arrival payoff gets its artifact (2026-10-31)

The landing payoff (`/arrival`) scored the trip but ended at prose. This
round gives it a closing beat worth sending someone: the **arrival
passport** — the trip's record stamped `ADJUSTED` / `ALMOST` / `OWED`,
with the honest figure and its comparison, exported as a PNG/SVG card or
copied text. Built as pure domain (`domain/arrival-passport.ts`), a
standalone SVG twin (`lib/arrival-passport-svg.ts`), and the
`ArrivalPassportCard` component; the page also gains a two-pass reveal
(promise → beat → account → passport) via `data-rise`, gated on
`prefers-reduced-motion`. Nothing is posted automatically — every export
is an explicit button. The passport only stamps what the read carries: no
projection and no gate promise means no card, never an invented figure
(same honesty contract as the rest of arrival, pinned in
`tests/arrival-passport.test.ts`).

The shares path added the same week (`lib/share.ts` + `POST /api/share` +
`/plan/[id]` + OG image, Supabase with filesystem fallback) was smoke-
tested end to end: mint → recipient page renders the body-clock passport
line → OG image returns a real PNG → `artifacts/share/*.json` written in
fallback mode.

#### Round 16 — Motion language: light moves, things morph (2026-10-31)

User feedback: the app reads as drawers expanding — a simplified experience
without intuitively designed transitions between sections. The fix is a
motion language drawn from the Codrops archive (Morphing Buttons Concept,
Multi-Layer Page Reveal Effects, Image Layer Animations with Clip-Path,
Grid Item Animation Layout / ImageToContent Flip, On-Scroll 3D Stack
Motion), restated in Meridian's own terms: **light moves, things morph,
nothing slides up from nowhere.**

1. **Surface morphs.** Triggers become their panels via same-document view
   transitions (`useMorphTransition` + paired `view-transition-name`s):
   More tab → More sheet, Settings row → settings sheet, trip chip → trip
   editor, Voice row → assistant. Sheet-from-nowhere slides are the fallback
   for browsers without the API.
2. **The dawn reveal.** `nav-forward` wipes the incoming page in from the
   horizon up (`clip-path: inset` on the root view-transition pseudos),
   `nav-back` reverses it; the shared dawn disc flies above the wipe.
3. **Light sweep.** Mode switches (Now ↔ The plan, Calm ↔ Detailed, theme
   flip) pass two stage layers across the content — transform-only,
   staggered, skipped under reduced motion.
4. **Places morph into pages.** `place-*` names pair the More rows with the
   destination headers across the MPA transition.
5. **The trips deck.** `/history` as sticky stacked cards with scroll-driven
   recede where supported.

Contract: `clip-path` joins the paint-only allowance in design.md; everything
degrades under `@supports not (view-transition-name)` and
`prefers-reduced-motion: reduce`.

#### Closed (debt swept 2026-10-17)

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
#### Round 9 — mobile & right-now UX (shipped 2026-10-31)

- **Right-now card wired:** `RightNowCard` (previously dead) is mounted in
  `NudgeFeedScreen` using `heroNudge`/`countdown`/`completedIds`/`skippedIds`.
- **Mobile scrubbing:** 15-minute stepper buttons + haptic feedback on the
  1440-minute day scrubber (`DayScene`).
- **Swipe day navigation:** horizontal swipe (≥50px) on the day rail.
- **Undo toast:** bottom offset raised to clear the fixed bottom nav.
- **Offline badge:** root-level `OfflineBadge` surfaces connectivity loss.
- **Adaptive recovery:** non-punitive recovery card when a step is skipped.
- **Steering affordance:** skip relabelled "Can't do this" / "Noted".

#### Round 17 — Measure the journey, close the loop (2026-11-01)

The app now moves like light; this round makes the journey observable and
self-closing. Three items:

1. **Visual regression in CI.** `@playwright/test` joins devDependencies with
   a dedicated `visual` job: reproducible build, `next start` under
   `AGENT_PROVIDER=replay`, clock-frozen screenshots of the five load-bearing
   surfaces (entry, home day, arrival payoff, trips deck, more sheet).
   Baselines are generated on the runner itself via a `workflow_dispatch`
   input (`update_baselines`) and committed back — no local Docker needed,
   and rendering always matches the machine that compares.
2. **Funnel instrumentation.** `src/lib/funnel.ts` records the five stages —
   entry → run → handoff → arrival → outcome — once per stage per trip into a
   localStorage ring, and fire-and-forgets each event to `/api/funnel`, which
   writes a `meridian_funnel` row when Supabase is configured and no-ops
   honestly otherwise. The question it answers: where do travellers leak out
   of the journey?
3. **Push pairing for the morning-after.** The existing Web Push pipeline
   (`reminders.ts` → cron `/api/cron/dispatch` → `sw.js`) gains one new
   reminder: at 08:00 destination time the morning after the last planned
   day, a push asks "How did you actually sleep?" and taps through to
   `/outcome`. Payloads grow `url` + `ttl` (12h, not the 5-minute step TTL);
   the sent-map dedupe guarantees exactly one knock. The morning-after card
   on Home is the in-app half of the same pair.

**Contract:** funnel writes are fire-and-forget and may never block or throw
into the UI; the outcome reminder only exists where a feed does (push needs a
subscription, which needs a feed); the visual suite lives in `visual/` —
deliberately outside `tests/` so `bun test` never loads the Playwright API.

#### Round 18 — Closing the drawer critique (2026-11-01)

Round 16 morphed the four signature surfaces; an audit found the leftovers:
the AgentDrawer (the most-visible overlay during a live run) still popped in
as a classic right-side drawer, evidence expanders materialized without
motion, the disclosure stacked a sheet on a sheet, and the Today feed read
as a wall of identical blocks. All four are now inside the motion language:

1. **The crew panel morphs.** Activity-log row and panel share
   `morph-crew`; opening runs both surface changes (settings closes, panel
   opens) inside one view transition. Closing without an anchor degrades to
   a quiet fade — still no drawer slam.
2. **The disclosure never stacks.** In the More sheet it swaps the sheet's
   body in place (`DisclosureBody` extracted; Escape backs out one layer at
   a time). From the settings sheet and `/shift`, the trigger row morphs
   into the shared panel (`morph-disclosure`); the shift trigger only holds
   the name while the panel is gone.
3. **Expanders breathe in.** The hero "why", the timeline drawers and the
   booking-paste card enter with the existing `rise` keyframe.
4. **Feed cadence.** Timeline rows reveal on scroll
   (`animation-timeline: view()`, `translate` property so swipe gestures are
   untouched), guarded by support + reduced motion, scoped to live rows.

**Verification:** `tests/motion-language.test.ts` locks all four; 831 tests
green; browser-verified morph pairs and the in-place swap.

#### Round 19 — The experience unfolds (2026-11-01)

The landing told, and the example dumped. Round 19 makes both perform,
borrowing the speed-run pattern studied in last-human-standing: scripted
beats, skip controls, a send-a-link URL, and a distribution doc.

1. **The landing shows instead of naming.** The three label chips became
   the three artifacts, computed live from the demo journey
   (`LandingArtifacts`): the body-clock dial with both hands, the arrival
   scorecard counting up (banked of needed vs doing nothing), and the
   stamped passport. A capability strip names what the crew times and
   carries. Artifacts wake once on scroll (IntersectionObserver,
   opacity + translate, staggered).
2. **`/demo` — the ninety-second example.** Four beats in story order:
   the stakes (both clocks, the gap), the crew at work (lines + day chips
   with real solved shifts), the plan (arrival-day rows in canonical
   words), the payoff (scorecard + stamped passport + CTAs). Every number
   comes from `src/domain/demo-beats.ts`, which builds on
   `buildDemoScenario` → solver → `arrivalRead` → `arrivalPassport` — the
   demo cannot tell a story the product cannot back up. Skip-to-payoff,
   dot navigation, arrow keys, scenario switch (`/demo?s=cedric`).
3. **The example banner gains "See the story first"** — the dump path
   stays one tap away for people who want it, but the story leads.

**Verification:** tests/demo-beats.test.ts locks the story data (9 tests);
20/20 browser checks across beats + landing. Design contract intact — the
new components carry zero inline styles.

#### Round 20 — Today opens as a stage (2026-11-01)

1. **`TodayStage`** — first paint is the full-bleed stage: modeled sky,
   route chip, clocks, one next step (`pickNextStep`, same marks as the
   feed). Example mode falls back to the same preview plans the feed reads.
2. **Sticky scene** — the stage pins for one beat past the first viewport,
   then recedes on a scroll-driven `--stage` timeline (length-based exit
   ranges; percentage phases degenerate on taller-than-viewport subjects).
3. **`.today-flow` cadence** — the sections below rise on arrival, same
   vocabulary as the feed cadence.
4. **`.root` overflow fix** — `hidden` → `clip`: hidden created a phantom
   scroll container that froze every scroll-driven timeline in the app.

**Verification:** 5 stage tests, 6 new motion-language locks (21 total),
15/15 browser checks. Baselines refreshed after commit.

#### Round 21 — The demo becomes a gift (2026-11-01)

1. **OG preview** — composed from the real demo passport + stage sky by
   `scripts/make-og-demo.ts` (headless Chromium, no second renderer).
2. **Share from the payoff** — native share with clipboard fallback and
   visible confirmation.
3. **Peak beat** — stamp-land impact + ink burst on the passport, guarded,
   settles to rest.
4. **`/?demo=1` door** — redirects to /demo as documented.
5. **Visual coverage** — 4 new snapshots (demo stakes/payoff, stage
   first-paint/hand-off); darwin/actual artifacts gitignored.

**Verification:** 3 new motion-language locks, 12/12 browser checks,
20/20 round-19 regression, 854/854 tests.

#### Round 22 — Watch what we built (2026-11-01)

1. **Safari smoke pass** — 14/14 WebKit checks: full choreography parity
   (WebKit 26 ships scroll-driven animations), reduced-motion stand-down
   verified, zero page errors.
2. **Cedric/Alex walkthrough** — 22/22 across both scenarios, all four
   beats, honesty assertions on the payoff.
3. **Funnel summary** — `src/lib/funnel-summary.ts` (pure aggregator,
   10 tests) + `GET /api/funnel/summary` (key-gated, honest no-ops) +
   `docs/reference/funnel.md` (stages, schema, SQL, what the numbers are
   for).

**Not carried forward:** none of the three items surfaced a product bug —
the degradations held, the scenarios were honest, the events were already
flowing.

#### Round 23 — The sun-self, phase A + B (2026-11-01)

1. **State model** — `src/domain/sun-self.ts`: lid ← debt, glow ←
   delivered/required, tilt ← direction, rays ← days locked. Nine tests
   lock the honesty mapping (no division by zero, severe-debt cap,
   adjusted needs both, delivered never outshines required).
2. **The glyph** — `src/components/SunSelf.tsx`: one procedural SVG, paper
   and ink tones, pulse on mount by key, zero inline styles.
3. **The demo embodies the story** — drained face on the stakes, a ray
   igniting per locked day on the crew beat, the honestly half-lit face on
   the payoff. `sunSelfForBeat` computes each face from the journey.
4. **The persona pass** — fictional archetypes replace real names
   (Miles Mercer / Danny Rivers / Sofia Marchetti), each with a persona
   line on the stakes beat; legacy scenario URLs degrade to the default.

**Verification:** 9 + 4 new domain tests, 2 motion-language locks,
879/879 suite, 13/13 + 22/22 + 20/20 browser checks. Baselines refresh
for the changed demo beats. **Carried to round 24:** phase C (stage sky,
dial center, check-in pulses) and phase D (passport portrait, OG).

#### Round 24 — One face family, every place it belongs (2026-11-01)

1. **Convergence over addition** — SolLuna (the dial's existing mascot)
   adopts the sun-self's face language: shared lids law from the domain,
   three rays on the sun half, the moon untouched.
2. **Stage sky** — the traveller's face on the horizon, computed from
   debt/banked/locked; done check-ins pulse it, skips change nothing.
3. **Empty entry** — the sleeping sun: no route yet means no debt yet.
4. **Passport portrait** — the face joins the live card, PNG/SVG
   downloads, the demo payoff, the landing artifacts and the OG image;
   omitted (never invented) without a computed read.
5. **Exported twin** — `sun-self-svg.ts` string renderer; geometry-parity
   tests keep it locked to the component.

**Verification:** 892/892 tests, 9/9 new browser checks + full regression
(55 checks across four harnesses), OG regenerated with the portrait.
**Next candidates:** a body-clock portrait share card (standalone face
export for Wrapped-style sharing), push-icon face, SolLuna states mapped
onto the lids law end-to-end.

#### Round 25 — The face wakes; the portrait travels (2026-11-01)

1. **Entry wake-up** — the route draft resolving wakes the sun-self from
   asleep to drained-by-the-gap, pulse armed; same-timezone routes get
   the honest "body clock home" face.
2. **Body-clock portrait** — `src/lib/sun-portrait.ts` (square card, face
   is the card), arrival-card Portrait button, demo "Save the portrait",
   shared `download-svg-image.ts` pipeline for every artifact.

**Verification:** 900/900 tests, 9/9 browser checks incl. a real PNG
download, full regression. **Next:** the per-step receipt — the model must
attribute banked minutes to individual steps before the feed may say
"banked 40m of light" (honesty before delight); SolLuna state vocabulary
convergence; the funnel week (set FUNNEL_SUMMARY_KEY, watch drop-offs).

#### Round 26 — The done step answers (2026-11-01)

1. **Model-gated receipts** — `src/domain/receipts.ts`: the PRC model
   gates (inert/opposing steps credited nothing, logged warmly), the
   share numbers ("≈ N min of the day's M min — banked"). Receipts
   render on the closed feed row; preview mode keeps standing copy.
2. **`interventionSupports` extraction** — per-intervention phase
   support lives next to the scorer; `modelShiftMin` rides it (no
   behaviour change).
3. **Double-toggle bug fix** — `useTripActions` persisted inside a
   state updater; React's updater re-run toggled marks back out. Now
   ref-computed, side-effect-free updaters, reload-persistent.
4. **Visual guard for the gift row** — `demo-payoff-ctas.png` covers
   the below-fold share + portrait buttons.

**Verification:** 907/907 tests, 7/7 browser checks (incl. reload
persistence), regression stack green. **Next candidates:** SolLuna
state-vocabulary convergence onto the sun-self moods; the funnel week
(set FUNNEL_SUMMARY_KEY and read real drop-offs); receipts for skipped
steps' *recovery* (the recovery tip already exists — a receipt could
close that loop too).

#### Round 27 — Payments on Arc: per-trip escrow, attested release (proposed 2026-11-02)

Full proposal: [arc-payments.md](plan/arc-payments.md). The read that
decided it: on-chain payment earns its place only where removing the
contract removes a product feature — so not a paywall boolean, but an
escrow whose release is attested by `evaluatePlan` itself. "Money back
if the plan fails the gate" is a settlement claim no card processor
makes cheaply. Arc's USDC-as-gas and sub-second finality compress the
flow; the deferred list (crew agentic payments, sponsor pools, embedded
wallets) is in the doc. Open questions to resolve before Phase 1: does a
`passed:false` plan ever reach the gate (crew retry semantics), and
tripId derivation — persisted plan id vs. route hash.

### Reconstructed in this merge — rounds 31-49

These shipped with no written entry in either file. Reconstructed from the commit
messages, which are the only record that exists.


#### Round 31 — the interactive day — characters, exploration, propose → gate → apply (2026-11-01)

`1fc2f8a`


The crew are celestial characters; the day is touched, not watched. Light windows can be
proposed and checked against the real gate before apply; stale and failed saves keep the
plan honest, edits sync the calendar feed.


#### Round 32 — momentum — velocity, smear and coast behind a dev flag (2026-11-01)

`76eb7ba`


Moving things carry their velocity: the sun trails and smears with drag speed, release
coasts and magnetises to window edges, a blocked proposal springs back. Settle stays the
default; reduced motion stands it down.


#### Round 33 — landing depth — the traveller travels; repetition out (2026-11-01)

`98f2183`


Layered ambient sky shared with the demo, seeded grain + ridges evolving through scroll;
hero carries the promise once, the sun descends to the example day, and the day's lead adds
information instead of restating it.


#### Round 34 — one terrain — the day shares the landing's sky (2026-11-01)

`343094e`


The interactive day's band holds the same ridges, haze and scene-seeded stars as the
backdrop (fading with modeled altitude); the hero sun now lands on the day sun's own anchor
and the frame wakes unclipped rather than sliding in.


#### Round 35 — the taste beat — Qloo's cross-domain story joins the demo (2026-11-02)

`ef9186c`


The send-a-link demo never showed the sponsor's graph: a fifth beat between plan and payoff
now fits recorded Qloo reads (Björk ↔ Luke Combs, toggleable in-frame) into the free hours
the verified plan leaves — what it suggests, never when. Provenance lines name the domain
leap ("Björk (music) → Tokyo"). Upstream reads cache in-process and serve last-good on error
so a hiccup degrades to stale places, never the unavailable state. README gains the Powered-
by-Qloo section; tsconfig and eslint stop scanning the foundry lib/ tree that just landed.


#### Round 36 — the agent remembers you — taste travels across trips (2026-11-02)

`c03d2ba`


First slice of the flagship plan (docs/plan/taste-flagship.md): a `self` taste profile under
meridian:taste:self, written only by real trips — new routes prefill the favourites instead
of starting taste-blind, and scoped trips keep their own picks. The copy now says so. The
doc lays out the whole play — personal subgraph on the Qloo taste graph (LOVES, KEPT,
DISMISSED, SEEDED edges on the FalkorDB memory we already run), culture across the whole
day, and the everyday companion the wedge proves toward.


#### Round 37 — the feedback loop closes — kept and dismissed ride the graph (2026-11-02)

`e9747b4`


Keep/swap/dismiss verdicts on a suggested place now post to /api/taste/feedback and land as
KEPT/DISMISSED edges on the traveller node (recordTasteSignal — best-effort like every graph
write). tasteHistory folds them into the next read: kept ids join signal.interests.entities
beside the declared favourites, dismissed places are suppressed outright (withoutDismissed)
— on /api/taste and inside loadTasteContext, tenant-aware and silent when the graph is off.
The flagship plan's Phase-1 loop is live, no new memory vendor.


#### Round 38 — remembered picks say so on the card (2026-11-02)

`bd33511`


When kept/dismissed history shaped the read, the itinerary carries a memory marker
(TasteContext.memory -> TasteItinerary.memory) and the card names it: "Qloo taste signals:
Bjork (music) -> Tokyo - remembered picks". The loop that compounds is now visible, not just
real.


#### Round 39 — the first night gets an idea (2026-11-02)

`71df266`


Evening-window places (dining/venues) are now read from the same Qloo response —
eveningCandidate on DestinationPlace, eveningPlaces on the context, firstNight on the
itinerary — and the card offers one line: "First night — if your plan says stay up".
Offered, never scheduled: taste still decides what, never when.


#### Round 40 — the dawn loader — the crew assembles while the app wakes (2026-11-02)

`833b8c6`


The hydration-window skeleton (shimmer boxes on black) is replaced by a boot scene in the
app's own metaphor: the wordmark, the five crew names fading in one by one, and a terminator
sweep crossing a horizon line — the same sun the plan cards draw. Reduced-motion: names
appear at once, the horizon holds still. aria-busy + sr-only unchanged.


#### Round 41 — the dawn lifts over the plan — cross-fade, not a swap (2026-11-02)

`b70e3d3`


The boot scene now stays mounted as a fixed overlay after the entry arrives: the plan mounts
underneath while the dawn fades out on top — the app was there all along, the dark just
lifts. Scene JSX is shared between the in-flow loader and the overlay; a 750ms timeout
removes it as the fallback for reduced-motion, where animationend never fires.


#### Round 42 — the crew speaks taste — and the demo shows the memory (2026-11-02)

`400cede`


buildTasteItinerary now gives the itinerary a voice line: a suggestion whose id matches a
KEPT edge reads "You kept {place} before — it's back on the list.", otherwise "Otto fitted
{place} into your free hours." The card renders it in the quiet note style, right beside the
provenance line. The /demo taste beat seeds one remembered keep (places[0]) so the memory
story is visible to a first-time judge — keptIds ride the memory marker from context through
itinerary.


#### Round 43 — memory is local-first — the loop needs no graph at all (2026-11-02)

`052b80f`


Kept/dismissed verdicts now land in meridian:taste-signals the moment they happen and ride
every crew run as the marks param (validated by parseTasteMarks, unioned with graph history
in loadTasteContext). The discovery strip sends kept ids in the affinity signal and
suppresses dismissed client-side. Same-device compounding works with FalkorDB unset — prod
included; the graph edges are the cross-device layer on top, not a dependency. interests cap
raised to 8 to carry both seeds.


#### Round 44 — the crew has a face — mood folded from the event stream (2026-11-02)

`6310a00`


A strip of five blobs sits on the Ledger header: one shape per agent, body carrying the
colour, eyes carrying the state — the bloub split. agentMoods folds the run into idle /
working / searching / asking / worried / happy / settled per agent, so the faces report what
the run did rather than performing beside it. Transform + opacity only, flattened under
reduced-motion, title + aria labels on each face.


#### Round 45 — five silhouettes and eyes that follow — the avatar contract (2026-11-02)

`0f90c61`


open-bot-avatar's lesson applied: an avatar is data, not a component — one path plus where
the eyes sit. AVATAR_DEFS gives each agent its own silhouette (round Mara, squared Jun,
grounded Otto, shield Iris, leaning Rex) instead of one recoloured blob. The eyes now also
lean toward the pointer (grokbot's ambient channel — full lean at ~120px, stood down under
reduced-motion), layered over the mood channel.


#### Round 46 — one face system — moods drive the round-31 glyphs, sun keeps watch (2026-11-02)

`5fe52ef`


CrewFaces now renders the existing CrewAvatar (crescent/star/crowned- sun/eclipse-eye/comet)
instead of a parallel blob — agentMoods maps its event-derived moods onto the avatar's state
vocabulary, and pointer- follow feeds the avatar's own gaze channel. The mood fold is the
new part; the faces were already good. CrewFeed's standby state gains the real SunSelf at
rest — the companion present where the crew waits.


#### Round 47 — the sun-self keeps watch on the day view (2026-11-02)

`e0a1f8a`


Mounted beside the arrival day: its face is the plan's own accounting — owed from required
minus banked shifts, tilt from direction, a ray lit per locked day. Honest state, computed
by sunSelfRead, never authored.


#### Round 48 — the sun travels with you — rapport, not reporting (2026-11-03)

`285d78e`


Four layers on the mascot, all inside the existing machinery: - vt: SunSelf can carry a
shared view-transition-name, so the same sun morphs between pages — day view, crew standby,
entry, passport — instead of a new glyph reprinting on every route. One per route, so names
never collide. - follow: the face leans toward the pointer via direct DOM writes (no re-
render per mousemove, zero-inline-style contract kept). - speak: a tap replays the pulse and
lifts the read's one-liner — the line it was always allowed to say, finally on screen. -
wake: a small arrival animation where the sun should notice you came back. Plus a warm sun
dot riding the dawn-sweep, so the mascot itself carries the traveller across each page
threshold.


#### Round 49 — the sun blinks — stillness now reads as resting (2026-11-03)

`32a0106`


A slow ambient blink on the open eyes: scaleY collapse on each eye's own box every ~6s, so
the per-read lid height survives and sleeping suns (drawn as lid paths, not ellipses) never
blink over a closed eye. Pure CSS, transform-only, stood down under reduced-motion.

### Round 49 — superseded the same day

The blink is withdrawn by round 50. It put an ambient loop on `.sunself-eye`,
which is the lid-debt readout, and made stillness mean "resting" using a signal
that was not derived from state. Kept here because the reasoning was sound and
the placement was not.

### Round 50 — the ambient channel (2026-11-03)

Rule 3 amended (see Part 1). The sun's eye loop is removed and the disc breathes
instead — `sunself-breath`, 6.4s, scale 1 → 1.035, transform-only, stood down
under reduced motion. `tests/motion-language.test.ts` gains "ambient motion
stays off the readout": the disc is the only sun element permitted an idle loop,
and no loop may touch the eyes. Verified by mutation — restoring round 49's
blink fails both guards.

Also in this round, the shared cue vocabulary settled: `CREW_CUE` was deleted
because nothing rendered it. Crew cues reach CSS through `MOOD_STATE` → pose →
`CREW_STATE_CUE` (`CrewAvatar.tsx`), and the test that had been asserting one
map against another now walks that path.

Also in this round, the three design docs became one. `design.md`,
`docs/vision.md` and `docs/plan/backlog.md` had drifted into contradicting each
other — and into describing a repo they no longer matched — so they are merged
here, laws first and history last. The merge moved the old backlog roughly
verbatim, which moved its staleness with it: reading Part 3 back, "Also in this
round" queued as work what three sections below it struck as shipped. So every
inherited open claim was checked against the code, not against the old file, and
the results are listed under *Corrections applied when this was merged*. The
honest summary of that pass: this project's backlog was not a list of what is
open so much as a record of what was last written down, and the difference only
shows up if someone goes looking.

### Housekeeping — the CI streak (2026-11-03)

Not a design round, recorded because it explains a gap in the log. `main` failed
CI on sixteen consecutive pushes from 2026-11-02 to 2026-11-03, always the same
Playwright job. Two causes: `visual/meridian.spec.ts` runs `mode: "serial"`, so
one stale screenshot aborted the suite and hid the seven behind it — fixed with
`maxFailures: 0`; and round 35 added `toHaveScreenshot("demo-taste.png")`
without ever dispatching `update_baselines`, so CI had no Linux baseline for it
at all. Baselines refreshed on the runner; the four accepted diffs were reviewed
by eye and are all intended (the More sheet's Privacy & support row, the taller
sheet, the sun-self face on the handoff, the taste beat).

**The standing rule this leaves:** a new `toHaveScreenshot` requires a baseline
dispatch. A local run cannot satisfy it — the snapshots that would be produced
are `-darwin`, which `.gitignore:39` blocks by design.
