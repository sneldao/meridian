# Design reset — implementation plan

**Status:** Phases 0, 1 and 2 are implemented and landed on `main` as of
2026-11-04. Phase 3 is not started. The thesis below describes the
pre-reset state (cream landing, mascot face) — it is kept for history;
the current landing is the ink Statement described in Phase 1.

Work lands directly on `main`; no long-lived branch. Review that produced
this: `artifacts/design-review/` (live captures, mobile + desktop, every
route) read against `docs/DESIGN.md`, `globals.css` and the landing
components.

## Completed handoff (Phases 0–2)

- **Phase 0** — the SunSelf face retired; one `Stamp` provenance mark per
  surface; readable radii and lighter weights; `/crew` workbench chrome
  behind `?dev=1`; the invisible 60s beam-shade loop removed.
- **Phase 1** — ink Statement landing: Fraunces type-led hero, the form
  first (mobile: form → instrument → example; resolved route gap as the
  headline via a stable `onGapChange` callback), accessible combobox
  picker, `LandingExampleDay` below the fold.
- **Phase 2** — `GlassSun` renders the same `SunSelfRead` as a glass
  instrument; `SunSelf` is now an API-compatible re-export so all six
  consumers and the SVG exports share the new body. The WebGL1 lens runs
  only when visible, `size ≥ 96`, motion allowed, `!saveData`, WebGL
  supported; SVG fallback covers small glyphs, reduced motion, save-data,
  unsupported and context-loss paths. No added Three/WebGPU dependency; the
  shader's environment is procedural — it never samples the DOM. No
  perpetual loops: demand-drawn only, a local pointer glint, a finite
  300ms tap ring.
- Domain, agents, API and persistence untouched throughout.

### Verification (frozen evidence — local review artifacts, not CI baselines)

- Full suite: **1130 pass, 0 fail** — `artifacts/design-review/phase2-final-tests.log`.
- Final SVG polish re-run: **92 pass, 0 fail** across 7 targeted files —
  `phase2-polish-tests.log`.
- `bun run typecheck` clean; replay production build passes; ESLint on
  changed TS/TSX — no errors (stylesheets are outside eslint config, not
  zero warnings); `git diff --check` clean.
- Commit handoff: a separate local cleanup removed dependencies after
  verification. The staged secret scan passed, but the pre-commit
  typecheck could no longer resolve installed packages. The user approved
  relying on the recorded green checks and bypassing the hook for this
  commit only; dependencies were not reinstalled and servers stayed off.
- Browser proof (`artifacts/design-review/phase2-proof.mjs`, run
  locally): route changes update pixels on the SAME canvas node with the
  accessible read updating; the shader's `pulse` uniform settles to 0
  with no pending draws; a REAL `emulateMedia` reduced-motion toggle
  goes WebGL → visible SVG → WebGL; a real `WEBGL_lose_context` call
  restores the visible SVG with the accessible label intact; WebGL
  disabled keeps a visible SVG with the mobile form preceding the
  instrument; 390/320 viewport checks; the `/demo` ArrowRight sweep's
  leading edge caught mid-viewport at 150ms on `--ease-glide`, frozen
  with `page.clock` so the cleanup timer can't unmount the pass —
  `proof-light-pass-travel.png`.
- Servers after handoff: own :3210 and repo :3001 are closed; no
  Meridian browser sessions remain. Restart locally with `bun run dev`
  if dependencies are present.

### Still pending

- Physical iOS/Android GPU profiling (never claimed, not done).
- `update_baselines` visual-baseline workflow — not dispatched.
- Phase 3: Today on ink, remaining pages, CSS purge, DESIGN.md compaction.
- Landing→entry measurement is NOT measured: the funnel starts at
  `entry`, so no landing-view denominator exists; requires separately
  approved measurement work. No conversion or FPS claims were made; no
  production queries were run.

## Thesis

Meridian is two apps. The ink surfaces (`/demo`, `/arrival`, `/crew`) are the
product the ads promise — Fraunces at scale, mono numerals, a horizon. The
cream surface (`/`, Today) is what visitors actually land on: an emoji-faced
sun, pastel ridge art, Inter 700 at 28–44px, pill chrome, three disclaimers a
viewport. The reset commits to the ink side as the default, makes type the
hero, turns the sun from a character into an instrument, and gives motion
enough amplitude to be seen.

References, as DNA not pixels:

- codrops *TextCharacterAnimations* → the text is the object. One face, one
  weight, enormous scale, each letter a body. Two effects for the whole app,
  not nineteen.
- *smear-blur-showreel* → motion with mass. Sharp leading edge, blurred tail,
  deterministic, visible. For us: light that moves leaves a tail.
- *phileeppov/glass* → an object, not a character. A refractive disc whose
  light reports state. Same `SunSelfRead` input, no face.

## Rules for landing on main

1. **Every commit is green on its own**: `bun run typecheck && bun test tests`
   locally before each push (that is exactly what CI runs). No "fix tests in
   the next commit".
2. **Tests that pin the old design are updated in the same commit** that
   changes the design, never deleted wholesale. The pinned files are:
   `tests/landing-hero.test.tsx`, `tests/sun-self-surfaces.test.tsx`,
   `tests/sun-self.test.ts`, `tests/motion-language.test.ts`,
   `tests/design-contract.test.ts` (HEDGES allowlist, `HEX_CEILING`,
   `STYLE_CEILING`, `MOTION_DEBT`), `tests/stage-css.test.ts`,
   `tests/home-entry.test.ts`, `tests/ux-surfaces.test.tsx`.
3. **Visual baselines** (`visual/*-snapshots`) are regenerated only on CI:
   dispatch the workflow with `update_baselines=true` once at the end of each
   phase, not per commit. The `visual` job is expected red between a phase's
   first visual commit and that dispatch; `verify` must never be.
4. **Domain, agents, API routes, persistence: untouched.** This is a
   presentation reset. `src/domain/**`, `src/agents/**`, `src/app/api/**`,
   `src/state/**`, `src/tools/**` are out of scope. The only domain-adjacent
   file that changes is `src/domain/sun-self.ts` if the glass sun needs an
   extra derived field (it should not — it reads `lid`, `rayCount`, `mood`,
   `tiltDeg` as light parameters).
5. **DESIGN.md gets one amendment per phase**, written when the phase ships,
   describing what shipped. No amendments ahead of code. Part 1 laws stay;
   Rule 3's amplitude arithmetic (rounds 50–52) is superseded by Phase 2's
   "visible or deleted" gate.
6. **Measure.** `src/lib/funnel.ts` already records `entry` → `run` per trip
   into Supabase via `/api/funnel`. **Correction (Phase 1):** the funnel
   starts at `entry` — there is no `landing_view` stage, so
   `/api/funnel/summary` cannot report landing→entry conversion; it only
   covers entry→run. A landing-view denominator is separately approved
   measurement work — do not add tracking or query the (secret-protected)
   API as part of this reset.
7. **Feature flags: none.** Each phase is small enough to land as a sequence
   of commits that leave the app coherent at every step. Where a phase swaps
   a component (the sun), the new component lands behind the old prop
   surface so call sites do not change in the same commit.

---

## Phase 0 — Kill list (≈1 day, 6 commits)

Stops the "toy" read without designing anything new. Each commit is
independently shippable.

### 0.1 Retire the face

- `src/components/SunSelf.tsx`: remove the eye ellipses, lids and smile
  path. Keep the disc, halo and rays (they are the readouts that survive
  into Phase 2). Keep the exported props and `aria-label`; the label already
  carries the mood word, so the accessible read is unchanged.
- `src/components/dial/SolLunaMascot.tsx`, `MascotSyncReveal.tsx`: same —
  strip face geometry, keep disc + rays.
- Sun portrait export (`src/components/ArrivalPassportCard.tsx` /
  `sun-portrait` twin): draw the same faceless disc. `tests/sun-self-surfaces.test.tsx`
  "lids: both renderers close at the same threshold" is retired; "rays" and
  "halo" stay and still pass. `tests/motion-language.test.ts` "no loop
  animates the eyes" becomes "no sun element but the disc loops" (one
  selector change).
- `tests/sun-self.test.ts`: keep `lid` in the read (Phase 2 maps it to
  bloom), drop any assertion on `smile`/`closed`.

### 0.2 One provenance mark per surface

- Add `src/components/ui/Stamp.tsx`: a **13px** JetBrains Mono, letter-spaced
  uppercase tag — `EXAMPLE`, `PREVIEW`, `LOCKED`, `FICTIONAL` — positioned
  top-right inside the surface it describes. (11–12px would violate the
  existing accessibility floor: nothing informative below 13px.) Colour from
  the existing token palette; no new hex. Props: `kind`, optional
  `className`; LOCKED means the accepted/verified plan, not immutable —
  it never marks an unaccepted one.
- Replace the sentence-length hedges with a `<Stamp>` **plus a concise
  disclosure where the fact is load-bearing**: the replaced sentence must
  not conceal that example calendar/wearable data isn't the traveller's or
  that a body-clock estimate isn't measured alertness. Sites:
  `InteractiveDay.tsx:813`, `DemoBeats.tsx:477`, `ScenarioExperience.tsx:145`,
  `SampleJourneys.tsx:23`, `PerformanceBrief.tsx:66`, the `.example-banner`
  in `src/app/page.tsx`. Keep the demo's alternate-scenario navigation.
- `tests/design-contract.test.ts` HEDGES allowlist: remove every retired
  phrase (the test fails if a listed phrase no longer appears — that is the
  intended pressure). The Stamp words are component labels in unquoted JSX
  and are not scanned, so nothing is added to HEDGES for them.
- The one-line "Timing guidance, not medical advice" in the More sheet and
  `/privacy` stays.

### 0.3 Weight and radius

- `globals.css` + Tailwind utilities: `font-weight: 800` → `600`,
  `font-weight: 700` → `500` everywhere except `.brand b` (wordmark) and
  `.arr-cell em` / `.demo-*` display numerals (which move to Fraunces 500 in
  Phase 1 anyway). Mechanical: `sed` the CSS, grep `font-bold`/`font-extrabold`
  in TSX and swap to `font-medium`/`font-semibold`. UI text only — SVG
  wordmarks and display numerals keep their weight.
- Radii: `border-radius: 999px` → `6px` on every button, chip, input and
  badge except the primary CTAs (`.p1`, `.entry-cta`, `.landing-tease-cta`,
  `.arr-btn`, `.demo-cta-primary`), which stay pill. `14px–28px` surface-card
  radii → `10px`. **Scoped, not global:** 999px and numeric radii on discs,
  dials, avatars, rays/halos, progress bars, dots and marker geometry are
  NOT touched — only controls/chips/badges/cards. The bottom-nav active
  pill (`BottomNav.tsx`) → a 2px top rule, not a filled pill.

### 0.4 Pull the ridge art off cream

- `src/components/LandingDepth.tsx`: take an explicit `tone?: "paper" |
  "ink"` prop (default `paper`) and mount the artwork only for `ink` —
  never sniff the theme from the DOM during SSR. Do not delete the
  component — `demo-depth.ts` and its tests stay; the planes return in
  Phase 1 on ink where they belong.
- `tests/landing-hero.test.tsx` "the ambient depth hangs behind the page" →
  assert it is absent on cream.

### 0.5 Hide the workbench on `/crew`

- `src/app/crew/page.tsx`: the `First run?` banner (`:551`), the provider
  label, `director on`, the `space` / `1 2 3 4` key-hint pills, and the
  duplicate `Make my plan` in the header render only when `?dev=1` is
  present (read from `window.location.search` in the existing mount effect —
  avoids a `useSearchParams` Suspense requirement). The "Sample calendar in
  use" banner stays visible as a concise EXAMPLE CALENDAR mark (a Stamp +
  one clause), not dev-gated — its disclosure is real. Keep the keyboard
  shortcuts themselves working; only the hint chrome hides.
- The 🔊/🔈 emoji toggle (`:528`) → lucide `Volume2`/`VolumeX`.

### 0.6 Remove motion nobody can see

- Delete the 60s `.beam::after` shade and `beam-travel` keyframes
  (`globals.css:178-212`) and the `--beam-phase` write in `page.tsx`.
  `clockPhaseDelay` in `src/lib/clock-phase.ts` stays (it is unit-tested and
  Phase 2 reuses it).
- `tests/motion-language.test.ts` "ambient motion is clock-locked and
  perceptible" describe block: remove; replace with a targeted guard that
  the retired beam loop stays retired (no `.beam::after`, no `beam-travel`,
  no `--beam-phase` in CSS or `page.tsx`) while the static `.beam` tint
  stays. No arbitrary global duration ceiling — legitimate ambient loops
  (e.g. `ld-motes-*`) survive until Phase 2's perceptibility gate.
- Keep `sunself-breath` for now; Phase 2 replaces it.

**Phase 0 exit:** dispatch `update_baselines`. Amend DESIGN.md Part 2 with
"the face is retired; one stamp per surface; weights 400–600; radii 6/10".

---

## Phase 1 — Landing on ink (≈4 days, 5 commits)

The screen the ads land on. Macrostructure changes from *Marquee Hero over
an example card* to a **Statement**: one line of type, the visitor's own
number, one field, all in the first viewport.

### 1.1 Ink becomes the landing's theme

- `src/app/page.tsx` setup branch (`:1709-1741`): wrap in a
  `<div className="landing-ink">` that sets `--m-bg`, `--m-ink`, `--m-muted`,
  `--m-card`, `--m-border` to the night values already declared at
  `globals.css:2822-2834`. Nothing else on `/` changes theme in this phase;
  Today stays cream until Phase 3.
- `LandingDepth` returns on this surface: two mote planes + one ridge, ink
  family, grain. Haze colour `--color-sun-dest` at α0.12 along the horizon.

### 1.2 Type-led hero

- `LandingHero.tsx`: headline → `<h1>` in `--font-display` (Fraunces, wght
  500, opsz auto) at `--text-display` (not `-s`), `letter-spacing: -0.02em`,
  `line-height: 0.95`, left-aligned, max 9 words. Keep the `.lh-char` span
  split and the CSS stagger (`--stagger-step` 22ms is right; raise
  `--dur-settle` for the char rise to 560ms with `--ease-settle` and add a
  `filter: blur(6px) → 0` on each char — the one place `filter` animates,
  already permitted by the motion gate's "paint" clause). GSAP is in
  `package.json` but unused in `src/`; do not add it for this.
- Copy: the headline is the visitor's gap once a route exists
  (`routeGapHeadline`), else "Land on their clock." The `.ls-pain` and
  `.ls-mech` lines collapse to one 18px Inter 400 line, muted.
- Remove the hero `SunSelf` orbit and the scroll-descent effect
  (`LandingHero.tsx:79-129`). The sun returns once, in Phase 2, as glass, at
  the horizon of the ink stage — not three times.
- `tests/landing-hero.test.tsx`: rewrite the five round-31 assertions —
  headline present and `h1`, display font class, CTA + demo link, no orbit,
  form is in the first `section`.

### 1.3 Form first, example second

- Reorder the setup branch: `LandingHero` → `TripEntryScreen` → example day
  (`InteractiveDay` inside its instrument frame) → `EverydayRhythm`.
- `TripEntryScreen.tsx`: drop the `SunSelf` sleeping/waking face; the
  response to typing is the headline above it changing (already wired via
  `onGapChange`). Inputs: 56px tall, ink field, hairline border, mono
  IATA codes, Fraunces city name under the code once resolved. `ArrowRight`
  CTA stays the one pill on the page.
- The `#trip-entry` anchor stays so `/plan/[id]` share links still land on
  the form.
- `tests/home-entry.test.ts`, `tests/ux-surfaces.test.tsx`: update order
  assertions; the "form is the hero CTA's target" test stays green.

### 1.4 Example day as an instrument panel

- `InteractiveDay.tsx` / `.iday-*` CSS: on ink, hairline `--color-line`
  frame, `Stamp` `EXAMPLE` in the head bar, the 24h axis labels and window
  times already mono — keep. Remove `.iday-headline` 800 weight (covered by
  0.3). The `OTTO`/`IRIS` lines become one row each with the avatar glyph
  at 20px, Inter 400 15px.

### 1.5 Desktop composition

- `.root` max-width stays 1140, but the landing uses a 12-col grid: headline
  spans 1–9, the form sits 1–6 beneath, the example instrument spans 1–12
  as the second screen. No centred 720px column on desktop.
- Below the fold must not be empty cream: the page ends at the example +
  `EverydayRhythm`; `EverydayRhythm` moves onto ink with the same tokens.

**Phase 1 exit:** `update_baselines` (not dispatched — pending); DESIGN.md
amendment: "Landing macrostructure is Statement on ink; type is the hero;
the traveller's number precedes the example." The funnel starts at
`entry`, so `/api/funnel/summary` was not queried and cannot provide a
landing-view denominator; that is separately approved measurement work.

---

## Phase 2 — The instrument sun and light with a tail

> **Correction (as implemented):** the glass is an original lightweight
> WebGL1 lens over a polished SVG fallback — NOT WebGPU/Three, no new
> dependencies, no copied code from the transmission-material reference
> (its environment is procedural; nothing samples the DOM). `raysLit`
> rides `read.raysLit` — never inferred from `rayCount`. Perceptibility
> is judged by actual screenshots, not a fixed %-frame threshold; no
> scoring/pipeline config was authored.

The two things that make it *delightful*, not merely not-embarrassing.

### 2.1 `GlassSun` — same read, light instead of a face

As shipped:

- `src/components/GlassSun.tsx` holds the component and `SunSelfProps`;
  `src/components/SunSelf.tsx` is a compatibility re-export so all call
  sites (TodayStage, StageSun, ArrivalPassportCard, CrewFeed and
  NudgeFeedScreen) get the new renderer unchanged. LandingInstrument
  imports GlassSun directly. BottomNav was never a consumer — it has no sun.
- `LandingInstrument.tsx` sits in `.landing-entry-stage` — after the form
  on mobile, beside it on desktop — not inside `LandingHero`.
- Rendering: a shared SVG body (`src/lib/glass-sun-svg.ts`,
  `glassSunSvgGroup`, unique safe IDs + escaped palette) is the SSR and
  fallback; a WebGL1 fragment shader
  (`src/lib/glass-sun-webgl.ts`) enhances when visible, `size >= 96`,
  motion allowed, `!saveData`. `data-renderer` exposes `"svg" | "webgl"`;
  context loss restores the SVG.
- `src/lib/glass-sun.ts` `glassParams(read)` maps the read: `lid` →
  bloom + roughness, `glow` → core light, `raysLit` = read-provided lit
  ticks over a fixed `rayCount` 12 (never inferred from progress),
  `tiltDeg` → graticule angle, mood + tone → palette tokens.
- `follow` drives a local pointer highlight on the GPU; `speak` uses a
  native button whose tap plays one finite 300ms ring; `pulseKey`/
  `wake` replay the glint. No sound, no ambient rAF.
- Tests: `tests/phase2-glass.test.tsx` pins exact params, safe IDs,
  escaping, a11y, export parity.

### 2.2 Light-tail primitive

As shipped:

- One `.light-pass` element in `globals.css` — `top:0; height:160px`,
  travelling `translateY(100vh) → -180px` on `--ease-glide`, ~900ms: a
  2px leading edge and a trailing gradient tail (static blur ~18px),
  transform/opacity only. Reduced motion degrades to a ~150ms
  opacity-only pass.
- `useLightSweep()` keeps its exact API; `/demo` beats and the mode
  switches that already use the hook pick up the pass automatically.
  The typed route clip-path wipe and global `.rise` expanders are
  unchanged — the pass is for sweep-caused transitions, not everything.
- Perceptibility was judged on a real captured frame (edge + tail
  visible at 150ms into the travel), not a 2%-of-frame threshold: no
  scoring, pipeline or numeric-threshold config was authored.

### 2.3 Retire the invisible loops

- `sunself-breath` and `stage-sun-breathe` are deleted (declarations and
  keyframes); the `motion-language` suite asserts no sun element carries
  an idle loop. The crew `working` pose loops survive by design.

### 2.4 `/demo` adopts the primitives

- `DemoBeats.tsx` beat transitions ride the shared `useLightSweep` pass.
  No per-letter choreography was added to the demo — that extension was
  not implemented.

**Phase 2 exit:** `update_baselines` still pending; physical GPU
profiling outstanding. DESIGN.md amendment shipped: the sun is a glass
instrument (GlassSun/SunSelf re-export); the light pass carries sweep
transitions.

---

## Phase 3 — Today on ink, chrome, purge (≈1 week, ongoing)

### 3.1 Today joins the stage

- `NudgeFeedScreen.tsx` (2209 lines) and `TodayStage.tsx`: default theme
  becomes night; `auto` keeps flipping to cream *only* when the destination
  sun is up (`src/domain/theme.ts` unchanged — it is the one place where
  cream is a meaning). Cards → hairline cells on `--color-ink-2`.
- `BottomNav.tsx`: 56px, ink, three labels in 12px mono uppercase, active =
  2px `--color-sun-dest` top rule.

### 3.2 `/history`, `/review`, `/outcome`, `/shift`, `/team`

- Already dark or near it; apply 0.3 weights/radii and the Stamp. No
  layout changes.

### 3.3 CSS purge

- `globals.css` is 8,444 lines. After Phases 0–2, run a coverage pass
  (Chrome DevTools CSS coverage across every route in
  `artifacts/design-review/notes.txt`) and delete rules with zero hits
  across all routes. Expect 30–40% removal. One commit per 1,000 lines so
  the diff is reviewable and bisectable.
- `tests/stage-css.test.ts` and `design-contract` selector lists are the
  guardrail: a deleted rule that a test names fails the commit.

### 3.4 DESIGN.md compaction

- Part 4 (the round log) moves to `docs/archive/design-log-2026-10.md`.
  Part 1 keeps the four rules plus the three phase amendments. Target:
  under 600 lines. The caveat "not verified by a human in a browser" is
  replaced by the capture set and the frame-diff test.

---

## Sequencing and effort

| Phase | Commits | Calendar | Visual baseline dispatch |
|---|---|---|---|
| 0 Kill list | 6 | 1 day | once, at exit |
| 1 Landing on ink | 5 | 3–4 days | once, at exit; measurement separately approved |
| 2 Glass sun + light tail | 4 | 5–6 days | once, at exit |
| 3 Today + purge | 6–10 | ongoing, 1 week first pass | per 2–3 commits |

Phases 0 and 1 are the churn fix. Phase 2 is the delight. Phase 3 is debt.
If only one week is available, ship 0 and 1 and measure.

## Risks

- **Hydration:** `LandingDepth` and the glass sun are client-only; both
  must render a deterministic SSR placeholder (the SVG disc, an empty
  stage) so `tests/landing-hero.test.tsx` SSR assertions and Next's
  hydration both hold.
- **Bundle:** no new runtime dependency. The shader is inline GLSL; the
  char animation is CSS. Verify `next build` first-load JS for `/` does not
  grow by more than 5kB gz.
- **Tests as design pins:** the biggest cost is `tests/motion-language.test.ts`
  (52 assertions, many pinning specific selectors and durations). Budget
  half a day in Phase 0 and half in Phase 2 for it; do not weaken it to
  "exists".
- **Accessibility:** every removal of a face keeps the `aria-label` mood
  word; every Stamp is real text; the light pass is `aria-hidden` and the
  written read beneath it is complete (Rule 2 unchanged).
- **Direct-to-main:** a broken commit is live for the length of a Render
  deploy. Mitigation is rule 1 (local typecheck + test before every push)
  and small commits; `git revert` is the rollback, never a force-push.
