# Design — Meridian (Cinematic Dawn)

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

The pass this file locks: the whole-app "Cinematic Dawn" elevation (2026-10-24),
pushing the Sunlit Horizon identity toward the night side — the brand's own
terminator line becomes the visual grammar. Product rules from
`docs/vision.md` and `docs/reference/design-primitives.md` still bind:
nothing is decorative, every visual read exists as words, motion is caused by
the traveller or is the reason the screen exists, one accent, numbers in mono.
The motion budget (round 27) widens the third rule: ink *stages* may perform
ambient, choreographed life because performance is the reason they exist;
working surfaces still only respond.

Parts of this file are executable: `tests/design-contract.test.ts` parses
`globals.css` and the chrome surfaces and fails the suite when a rule is
broken — hues per palette, the unkinded-step fallback, the sanctioned `.wide`
surfaces, the motion vocabulary, and the ratchets that let the token and
inline-style counts only shrink. Amend the doc and the gate together; a rule
written here and enforced nowhere is a rule that quietly lapses.

## Genre

atmospheric (the night-side / cinematic school), crossed with the app's
existing dawn identity. Deep ink stages carry the drama; working surfaces
stay legible.

## Macrostructure family

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

## Theme — "Dawn Ember" (tuned from the existing brand)

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

## Typography

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

## Spacing

4pt named scale (`--space-3xs … --space-3xl`) in `globals.css`. Pages use
named tokens; raw values only inside one-off geometry.

## Motion

The app's named vocabulary survives and is the law: **glide** (180ms —
traveller-caused state change), **settle** (320ms — a panel arriving),

### The motion budget (round 27, 2026-11-01)

Rule 3 of `docs/vision.md` ("respond to input; don't perform") is amended,
not retired. It always had an escape clause — motion may be *the reason the
screen exists* — and rounds 16–26 spent entirely on traveller-caused
transitions and left the surfaces still. The result, measured in testing,
was churn before the differentiator (the crew) was ever seen. The budget:

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
- **The gate is unchanged.** Only `transform`, `opacity` and paint animate,
  everywhere, on stages too. Reduced motion still stands everything down —
  a performed stage degrades to its written read, which must be complete.
  `tests/design-contract.test.ts` keeps enforcing *how* things move; this
  budget governs *who may move, and when*.

Inspiration corpus (studied 2026-11-01; the pattern to copy is each one's
discipline, not its effects):

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
  same transform/opacity gate and reduced-motion guard.

**drift** (700ms — arriving on its own). Easings: `--ease-glide`
cubic-bezier(0.22, 1, 0.36, 1) · `--ease-settle` cubic-bezier(0.16, 1, 0.3, 1)
· `--ease-drift` cubic-bezier(0.4, 0, 0.2, 1).

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
- Layout morph: a reorder or resize of cards glides by framer-motion `layout`
  (transform-based, so it stays inside the transform/opacity rule). The crew
  day strip (`DayStrip`) uses it. The layout-switch spike (`/spike/layout-switch`)
  morphs a stacked column into a row over a pinned scroll range, eased with
  ease-in-out cubic; reduced motion shows the row with no scroll link.
- Reduced-motion fallback: global flatten rule already in `globals.css`
  stands; spatial motion collapses to ≤ 150ms opacity.
- Only `transform` and `opacity` animate. Paint crossfades (`color`,
  `background`, `box-shadow`) cost nothing to composite and stay; `clip-path`
  joins them — it is compositor-friendly and carries the dawn reveal and the
  light-sweep masks without moving any box. Anything
  animating a box (`width`, `height`, `margin`, `padding`, `inset`) reflows
  and does not. Remaining box animations are frozen debt, counted by exact
  declaration text in `tests/design-contract.test.ts`.

## Microinteractions stance

- Press response (`scale(0.98)`) on primary actions only.
- Silent success over celebratory bursts; the one celebration allowed is the
  step-complete pop already shipped.
- Hover tooltips 800ms · focus tooltips 0ms.
- Count-ups only on numbers that changed because the traveller acted.

## CTA voice

- Primary: solid terracotta (or ember gold on ink stages), pill/14px radius,
  verb-first short copy ("Make my plan", "Fit to me").
- Secondary: hairline outline, ink or paper text.
- Buttons never wrap to two lines at any width (mobile floor).

## Copy voice

- One marker per state, not five sentences: a pill, a dim, or one line names
  a condition; the next surface does not repeat it. Honesty stays — hedging
  doesn't stack.
- Detail lives behind disclosure (`<details>`, drawers), not beside it.
- Labels are noun phrases ("Example traveller"), not explanations.

## Per-page allowances

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

## What pages MUST share

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

## What pages MAY differ on

- Macrostructure within the family.
- Hero archetype on statement pages.
- Stage ink vs cream base, per the mode rules above.

## Exports

The live token layer is `src/app/globals.css` (`@theme` + `:root`); it is the
source of truth, mirrored here for portability.

### tokens.css

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

### Tailwind v4 `@theme`

Mirrored by the existing `@theme` block in `src/app/globals.css` (extended in
the Dawn pass with `--font-body`, `--font-display`, `--text-display*`).

### DTCG `tokens.json` / shadcn CSS variables

Mechanical maps of the block above — omitted here until an export is actually
requested; this project consumes `globals.css` directly.

## Playable-day direction

The interaction model now follows the direction documented in
[docs/reference/interaction-research.md](docs/reference/interaction-research.md):
a calm daily tool where the performance moment is the payoff, correctly timed
light is the mechanism, and taste-ranked places are optional, personal rewards.

The existing Cinematic Dawn system is retained — Fraunces/Inter/mono type,
Dawn Ember tokens, purposeful stage and motion with static fallbacks and written
equivalents for every interactive surface. This direction supersedes the earlier
stacked-card emphasis for the main feed; it does not change clinical policies,
the solver, the scorer, or the guided view.

## Stage-sky direction

`.hero`, `.clock-stage`, and `.arr` render a blue-black ink stage whose horizon
band and origin-blue residue come from the same solar model as the Window
Seat. `stageSkyFor` derives the body clock's sun altitude at the destination
from the planned residual, then luminance-clamps the horizon colour so paper
text stays readable. A null/hydrating date leaves the token defaults; the
model describes an estimated body clock, not weather or measured adaptation.

## Round 19 — Show, don't tell; unfold, don't dump (2026-11-01)

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

## Round 20 — Today opens as a stage (2026-11-01)

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

## Round 21 — The demo becomes a gift (2026-11-01)

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

## Round 22 — Watch what we built (2026-11-01)

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

## Round 23 — The sun-self: the body clock given a face (2026-11-01)

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

## Round 24 — One face family, every place it belongs (2026-11-01)

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

## Round 25 — The face wakes; the portrait travels (2026-11-01)

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

## Round 26 — The done step answers (2026-11-01)

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

## Round 27 — The example becomes one stage (2026-11-01)

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

## Round 28 — The crew performs in the first viewport (2026-11-01)

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

## Round 27–29 direction — the example becomes a performance (2026-11-01)

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

