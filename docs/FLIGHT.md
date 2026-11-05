# The Flight — a vision for Meridian's world

*The app is the flight. One continuous sky; navigation is a camera, not a route
change. You are the sun; the crew flies ahead; the weather between you is the
work. Everything on screen is modeled truth — the world only changes when you
change it.*

---

## 1. The idea

Meridian stops being an app that *describes* a journey and becomes the journey
itself. A single persistent scene — `MeridianSky` — mounts once, under every
surface, and never unmounts. Screens are not pages; they are **altitudes in the
same sky**. The landing is ground level at night. Committing a route is a
takeoff. The feed is cruising altitude. Arrival is a descent that ends on a
ridge.

DOM keeps its job — text, forms, instruments, accessibility. The canvas is the
world the instruments float in. Every visual read still exists as words; every
scene element is derived from real state (solar model, run state, trip data).
Nothing is decorative invention.

## 2. The sky is a weather map of the body clock

The product's real data, rendered as weather — the honest version of ambient
richness:

| Body state | Weather |
|---|---|
| Owed sleep (`owedMin`) | Cloud cover — FBM cumulus banks on the horizon, mist, reduced visibility |
| Banked shift (`deliveredMin`) | Clearing — cover thins, sun burns through, visibility climbs |
| Light windows | Warm corridors of light in the scene; caffeine cutoff dims them |
| Skipped/blocked days | Local weather — a knot of cloud over that day of the route |
| Night body (`bodyAltDeg` low) | Star field, dimmer beam, deeper ink — `starFade`, already modeled |
| Risen body (`bodyAltDeg` high) | Clear bright sky, tall warm horizon — `stageSky`, already modeled |

The dread of jetlag is *felt* as fog; recovery is *seen* as clearing — progress
you can watch without reading a number.

## 3. The cast: the crew flies ahead

The USP made literal. `CrewAvatar` already owns their language
(resting/attentive/working/explaining/concerned/complete + gaze). In the world
they are scout silhouettes riding the great-circle ahead of your sun — visible
ahead because that is literally their job.

| Agent state | Flight behavior |
|---|---|
| resting / attentive | Perched at the horizon's edge, watching — or heads-up when the route resolves |
| working | Far ahead down the arc, scanning |
| explaining | Banks back toward you — the circling scout is the one with a report; its card unfolds beneath it in the feed |
| concerned | Breaks formation, drops toward the at-risk day — trouble readable in formation before it is read in text |
| complete | Settled on the ridge, wings folded |

The signature beat: **"Make my plan" is a takeoff.** Five scouts launch off the
ridge and scatter down the arc — the run is not a spinner, it is a formation
leaving. Team view multiplies it: twelve little parties, a sky full of flights.

## 4. What each repository contributes

### `phileeppov/glass` — the sun's material (already ported, deepened)
- `throughSlab` slab refraction, TIR guard, faceted rim, joint highlight,
  dispersion — already in `glass-sun-webgl.ts`
- In the scene it gets its real purpose: the glass samples the **live scene
  behind it** — clouds pass visibly *through* the sun's body. The repo's core
  trick (refraction of a real environment) finally has an environment.

### `cartuhok/3d-weather-codrops` — the atmosphere engine
- Its layered volumetric model → in-shader: FBM cloud field, mist strata,
  altitude-graded Rayleigh scatter, light shafts through breaks in cover.
- Density is not a mood setting — it is `owedMin` (section 2).

### `wehwayne2/x-challenge-geo` — instanced fields
- Its lesson (thousands of small marks, per-instance variation) → hash-placed
  star field with per-star size/brightness, sparse ember motes rising off the
  horizon band, rain of light in the beam. Fields in-shader, not DOM sprites.

### `ektogamat/webgpu-mesh-transmission` — the sun as volume
- Beer–Lambert attenuation: light absorbed by path length — edges warm to
  amber, the heart stays clear. The disc becomes a *body*.
- Chromatic rim separation where refraction bends hardest.

### `codrops/TextCharacterAnimations` — the two statements (already shipped)
- Filament on the door's headline and arrival's payoff — type performs exactly
  twice, at departure and arrival. The scene never touches text.

### `johnpolacek/museum-of-motion` — the camera
- Its pointer physics (lerped `quickTo`) becomes the camera rig:
  `u_pan`/`u_tilt`/`u_zoom` smoothed toward pointer, scroll, and route —
  the world doesn't parallax, it *flies*. Magnetic stays on the doors.
- Its beat discipline governs the journey: one deliberate moment per
  altitude change; exits are clean; nothing loops on its own clock.

## 5. The journey, frame by frame

**Door (`/`)** — ground level at night. Horizon low, stars out, the crew
perched along the ridge. Filament catches the headline letter by letter. The
instrument lamp stands at 300px, halo'd, following the pointer's light. A
world waiting to leave.

**Resolve** — airport typed: the sky *answers*. Your destination's dawn color
floods the horizon; the crew looks up (`attentive`); the camera tilts toward
the route. Magnetic CTA answers the hand.

**Ascent (entering the feed)** — the transition is a climb: stars → haze →
thinning air as the stage pins. Your owed-sleep weather fills the frame —
fog you can feel.

**Cruise (the feed) — six altitudes** (`docs/plan/feed-altitudes.md`). The
feed is not a column over the sky; it is a sequence of viewport-sized rooms
in one world. Each room owns a side, an opaque slab for its words, and a
modeled keyframe of the sky; the words and the world never overlap. Scroll
is per-room progress (`src/domain/feed-scenes.ts`), and a room's last 35%
blends its keyframe into the next — the one beat per altitude change:

| Room | Slab | The world |
|---|---|---|
| `stage` | centre instruments | the pinned stage's own moment |
| `now` | slim · right | the same moment, one camera step down |
| `day` | wide · left | the day as ground — horizon in the top third, the route flattened into the day strip the scouts ride |
| `next` | wide · right | **push-in**: the camera zooms toward the sun at the next step's body-clock altitude |
| `plan` | full · centre | ground level — a setting disc the ridge buries two-thirds of; one lit marker per planned day on the route |
| `discover` | slim · left | landed — ridge high, ember horizon, every marker lit, the crew settled |

Depth is rate difference between separate planes (far sky, near ridge,
slab), never translucency: slabs are opaque ink, there is no scrim and no
backdrop blur, and exactly one horizon is visible at any scroll position.

**Descent (`/arrival`)** — camera sinks, weather is what you earned: clear if
the plan worked, clouded where it didn't. Filament lands the second
statement. The passport prints *from* the scene — a stamped record of the
flight, not a screenshot of it.

**Return (the door law)** — every re-entry lands at the door, prefilled,
one tap in. The world never teleports you mid-flight.

## 6. The contract holds

- **Demand-drawn**: the scene repaints on model ticks (clock, route, run
  events) and input (pointer, scroll) — no ambient rAF. Agent positions and
  weather states are deterministic functions of state at paint time.
- **Reduced motion** → the same settled frame, no camera travel.
- **Honesty** — every cloud is `owedMin`, every scout is real `run.phase`,
  the terminator is the real solar line, the arc is the real great-circle.
  It looks like a game; it is a dashboard.
- **A11y** — the scene is `aria-hidden`; instruments and text are the read.

The one line we may choose to amend deliberately in `DESIGN.md`: ambient
self-running drift (clouds moving on their own clock). The scene works
without it; it is strictly more alive with it. A decision for the contract's
owner, not a workaround.

## 7. Research amendments (what best practice corrected)

- **Adaptive quality, one-way**: start High; downgrade once to a Low
  pipeline on GPU tier, discharging battery ≤30%, or sustained frame-drop —
  never upgrade, never oscillate (vgpu playbook).
- **Playhead, not hijack**: the camera rides scroll position (Apple's
  playhead model / our `view()` timelines); scroll is never owned. NN/g's
  scroll-jack findings are the cautionary tale — users read takeover as a
  bug.
- **No live-canvas morphs**: view transitions snapshot the DOM — a
  persistent canvas freezes mid-transition. Cross-route flight = cover wipe
  or instant recut, never a morph.
- **Cheap noise**: ≤3-octave FBM or a precomputed noise texture; `mediump`
  on mobile; `mix`/`step` over branches; DPR ≤1.5 on fullscreen backdrops.
- **Markers, not formations**: scouts are state-lit ember points on the arc
  (brighten / advance / return home), not animated birds — readable,
  honest, no flight-choreography tax.
- **Short reveal ranges**: scroll reveals complete early (`entry 2% cover
  18%`) so motion never holds content hostage — NN/g's scroll-animation
  complaint is exactly this failure.

## 8. Build order

1. `src/lib/meridian-sky-webgl.ts` — renderer + camera rig, demand-draw API:
   `paint(state, pointer)`; ported lifecycle from `glass-sun-webgl`.
2. Sky pass — gradient + scatter + star field + motes (geo + weather lessons).
3. Weather pass — FBM cover/mist driven by `owedMin`/`deliveredMin`.
4. Sun pass — existing glass shader whole + Beer attenuation + fringe,
   refracting the live frame (glass + transmission).
5. Terrain + arc passes — ridges, mist, the route strip with coverage marker.
6. Crew layer — scout sprites on the arc, positions from run state, states
   from the crew vocabulary.
7. `MeridianSkyCanvas` + camera choreography; mount at app root behind DOM.
8. Route/scroll→camera wiring; `.today-stage`/`.hero`/`.arr` migrate from
   DOM-depth stacks to the shared scene; CSS stack becomes the fallback.
9. Verify — demand-draw audit (zero idle rAF), reduced-motion frame, DPR cap,
   mobile battery profile, tests for the state→weather mapping.
