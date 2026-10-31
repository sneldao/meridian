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
- Body floor: 12px (existing rule); UI labels step 10px → 11–12px where the
  layout allows.

## Spacing

4pt named scale (`--space-3xs … --space-3xl`) in `globals.css`. Pages use
named tokens; raw values only inside one-off geometry.

## Motion

The app's named vocabulary survives and is the law: **glide** (180ms —
traveller-caused state change), **settle** (320ms — a panel arriving),
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
- Page entrance: the terminator hairline sweeps once per navigation; a
  first-visit-only streak (remembered in `meridian:visited`) crosses the
  stage once per browser.
- The run on the stage: while the crew works, the hero shows the speaking
  agent, days locked and sun progress (visual only — `RunAnnouncer` speaks it).
- Number continuity: a figure that changes tweens from what is on screen to
  its new value (`TweenNumber` — the owed gap, readiness, day gaps). First
  paint and unit changes snap, so a number never reads a unit it doesn't have;
  the true value is what is announced.
- Reduced-motion fallback: global flatten rule already in `globals.css`
  stands; spatial motion collapses to ≤ 150ms opacity.
- Only `transform` and `opacity` animate.

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

## Per-page allowances

- Landing MAY use the globe stage as full-bleed enrichment (it is real/modelled
  data — the product rule "nothing is decorative" holds).
- App pages MUST NOT add decoration; function carries the page.
- Statement pages (`/arrival`) may use one atmospheric ink gradient — the
  sunrise already earned there.

## What pages MUST share

- The wordmark (MERIDIAN, tracked caps) and the terminator-line motif.
- The accent placement discipline (terracotta = action; gold = the sun/data).
- Display + body + mono faces.
- CTA voice and radius rhythm.
- Section heading rhythm: eyebrow (tracked caps, 11–12px) stacked above a
  Fraunces display heading — never side-by-side hanging labels.

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
