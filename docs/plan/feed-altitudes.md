# Altitudes — the feed as rooms in one world, not cards over a sky

*Plan for replacing the `feed-world` experiment (uncommitted, round 53). Scope:
`NudgeFeedScreen` below the pinned stage. The stage itself, the landing and
`/arrival` are untouched by this plan except where named.*

---

## 0. Why the current direction cannot get there

Measured on `/?example=1` at 1440×900 (scroll 0 / 900 / 1800 / 3000):

1. **One canvas under everything + a scrim column.** The 720px
   `.feed-world::before` gradient draws a hard vertical band. Sections are
   720 / 1140 / 960 / 720 px wide (`right-now-card`, `.hero.slim`,
   `.tl.wide`, `.taste-discovery`), so the hero and the timeline straddle the
   band's edge and read as stripes. The ridge line, sun glow and arc dots
   surface in the gaps between cards at arbitrary heights. That is the "mud".
2. **Three skies in one viewport.** The feed canvas, `InteractiveDay`'s own
   ink sky (sun + ridge inside the card), and the hero's `StageStars` strip
   each paint their own horizon. Three horizons at three heights is the
   opposite of a world.
3. **The transition is over before the content starts.** `feedSky` lerps
   day→night across `scrollY / innerHeight` (one viewport, 0→1) and then the
   world is static for the remaining ~3,800px. Nothing below is keyed to what
   you are reading.
4. **Frosted panes over a painted scene.** `backdrop-filter: blur(16px)` on
   every `.card/.tl/.dac/.dial` over FBM cloud and star noise reads as dirt
   and costs a full-screen GPU pass per pane.
5. **It is still a column.** Heterogeneous cards with margins is a feed. No
   section owns a viewport; no section owns its backdrop; no section says
   where you are.

Iterating on scrim opacity, blur radius or card alpha cannot fix 1–5. The
composition unit is wrong.

## 1. What the references actually do (studied, not paraphrased)

| Reference | Composition law we inherit |
|---|---|
| **Shader.se** (Codrops 2026-05) | *A page-section config* — `[{type, length}]`; cumulative starts turn scroll into **per-scene progress**. Each scene is its own render; only in-range scenes render. A transition is scene N **revealing scene N+1's output** (screen-space sample through a mask, or the camera physically flying into the monitor plane until its frustum matches). Scenes start rendering a few scroll units early so the texture is ready. |
| **OPTIKKA** (Codrops 2025-10) | *One deterministic animation; scroll is the playhead.* One sticky canvas; text sections are sparse and placed in the animation's **negative space**; idle loop at the top hands off to scrubbing on first scroll; frames preload in the scroll direction. |
| **joebentaylor1995/infinite-scroll-with-parallax** | *Every section is exactly `100svh` and owns a full-bleed, opaque backdrop.* Parallax is `yPercent -50→50` of the image across **that section's** `top bottom → bottom top` range; marquee scale `1.5→0.5` on the same range — depth is **rate difference between visibly separate planes**. Fixed chrome sits on edge-only gradients. |
| **surya-aditya/codrops-infinite-scroll-and-content-transition** | *Rhythm by lateral stagger and varied widths* (`--stagger: ±8…28vw`, `--img-w` per item) — never a centred column. On open, the image Flips to a **fixed 100vh plane on the left**, the text column lives in **reserved space beside it** (`padding-inline: calc(80vh + 1.5vw)`), on a solid page colour. Image plane and text plane never mix. |

Five laws fall out, and none of them is "put a canvas under the cards":

- **L1 Room, not column.** The unit of scroll is a viewport-sized scene that
  owns its backdrop and its layout.
- **L2 One horizon per viewport.** Never two skies visible at once.
- **L3 Scroll → per-scene progress.** A scene config with lengths; every
  transition is a function of its own scene's progress and *reveals* the next
  room; the world outside the transition window is at rest.
- **L4 Text planes are opaque, or sit in empty sky.** Never translucent over
  painted detail.
- **L5 World on one side, words on the other.** Lateral split per room,
  alternating sides for rhythm; the scene composes its focal element into the
  side the words leave free.

Meridian's own contract already agrees: the camera rides and never owns
(`DESIGN.md` round 53), one deliberate beat per altitude change
(`FLIGHT.md` §4), instruments stay DOM, reduced motion gets the settled frame.
Those stay binding. Lenis smooth-scroll and `mandatory` snap are therefore
*not* inherited — they are the hijack NN/g measured.

## 2. The design: six altitudes

The feed becomes six rooms. Each is `min-height: 100dvh`, owns a side, a
slab width, and a **modeled** sky keyframe (every value is real state — the
honesty clause of `FLIGHT.md` §6 holds room by room).

| # | Room (`data-scene`) | Content it holds today | Slab | World keyframe (all from real state) |
|---|---|---|---|---|
| 0 | `stage` | `TodayStage` (pinned, unchanged) | centre instruments, no slab | as today — `stageSkyFor(trip, owed, liveDate)` |
| 1 | `now` | `RightNowCard` + `PerformanceBrief` | slim, **right** | same moment as the stage; camera tilts down 1 step; sun stays left; cover = `owedMin` |
| 2 | `day` | `InteractiveDay` / `InteractiveDayEditor` + `DaySkyStrip` | wide, **left** | **the day as ground**: horizon rises to the top third; the arc becomes the day strip (light windows lit on the ground, caffeine cutoff dims the right end); scouts at `run.phase` |
| 3 | `next` | `.hero` next-up card (+ Voice) | wide, **right**, sun on the left (built: the hero's two-column grid needs the wide slab; the sun stays on the stage's side for the push-in) | sun at the **next step's body-clock altitude** (`bodyAltDeg` at that step's local time), zoomed toward — the frustum-match beat |
| 4 | `plan` | `.tl` timeline + `DayStepper` | full (1200px), **centre** — ground level | descent: horizon at the slab's top edge, the route arc carries one marker per day with coverage; stars by `starFade` |
| 5 | `discover` | `TasteDiscovery` / `TasteItineraryCard` / arrival | slim, **right** | destination at arrival time: `stageSkyFor` evaluated at arrival; ridge high, scouts settled (`complete`) |

The slab is the words. The world is the rest. They do not overlap.

### 2.1 Planes and their rates (where the depth comes from)

Three planes, three rates, visibly separate — joebentaylor's rule, not blur:

| Plane | What | Moves at |
|---|---|---|
| far | sky gradient, stars, cloud field (in-shader) | `u_pan.y` from room progress × 0.3 |
| near | ridge + mist + arc + scouts (in-shader) | `u_pan.y` × 1.0 (already a separate multiplier in `meridian-sky-webgl.ts` L78–81) |
| slab | the opaque reading plane (DOM) | scroll rate, 1:1 |

Plus one optional foreground: a `pointer-events:none` sticky mist band at the
viewport's bottom edge (edge-only gradient, the joebentaylor footer) — the only
thing allowed in front of a slab.

### 2.2 Transitions are reveals (one beat per boundary)

Each room's last 35% of scroll is its transition window:
`t = smoothstep(0.65, 1, p)`. In that window two things happen in lockstep:

- **World:** `blendKeys(room[i].key, room[i+1].key, t)` painted to the one
  canvas (Shader.se's "render the next scene early and sample it").
- **Slab:** *(amended in build)* no `clip-path` — clipping a slab while it
  is still being read holds content hostage, exactly the NN/g failure. The
  incoming slab uses the app's existing `view()` `reveal-up` entrance
  (`entry 0% entry 30%`); the beat is the world's alone.

The named beats (`FLIGHT.md` §5, one per altitude change):

| Boundary | Beat |
|---|---|
| stage → now | exists (`stage-recede` / `stage-hand-off`) — keep |
| now → day | **tilt down**: horizon climbs, the arc flattens into the day strip; the slab slides in from the left under the rising ground |
| day → next | **push in**: `zoom` toward the sun until its disc fills the `next` slab's window; the slab's eyebrow reads on the sun's rim |
| next → plan | **descend**: zoom out, horizon drops to the slab's top edge; day markers light along the arc in order |
| plan → discover | **land**: ridge rises past the slab; stars by `starFade`; scouts settle |

Outside transition windows the world is at rest (demand-draw). Only the
round-53 weather drift (cover texture, not value) may move on its own.

### 2.3 Narrow viewports

Below 760px the lateral split collapses the joebentaylor way: each room is a
full-width opaque slab with the world as a `38dvh` sticky band above it. The
band is the same single canvas; room keyframes still drive it. No side
alternation; rhythm comes from slab height and headline scale.

### 2.4 Reduced motion / no WebGL

Each room renders a static CSS sky from its own keyframe (the existing
`stageSkyFor` → `--stage-*` vars path, one `<div class="room-sky">` per room,
`display:none` under `.sky-gl`). No transitions, no canvas. Same six rooms,
same slabs, settled frames. Every read is already a word in the slab.

## 3. Architecture

### 3.1 `src/domain/feed-scenes.ts` (pure, tested)

```ts
export type RoomId = "stage" | "now" | "day" | "next" | "plan" | "discover";

export interface SkyKey {
  top: Rgb; mid: Rgb; hor: Rgb;
  horizonH: number;      // 0..1 from bottom
  stars: number; cover: number;
  sun: { x: number; y: number; r: number; color: Rgb };
  arc: { ax: number; ay: number; bx: number; by: number; t: number; markers?: number[] };
  scouts: number[];
  cam: { pan: [number, number]; zoom: number };   // zoom new; pan exists
}

export interface Room {
  id: RoomId;
  side: "left" | "right" | "center";
  slab: "slim" | "wide";
  key: (ctx: RoomCtx) => SkyKey;   // ctx = trip, dawnOwedMin, liveDate, sunRead, run, selected day, next step, w/h
}

export const ROOMS: Room[];

/** scrollY + measured starts → which room, its 0..1 progress, and blend t. */
export function locate(scrollY: number, starts: number[], lengths: number[]):
  { i: number; p: number; t: number };

export function blendKeys(a: SkyKey, b: SkyKey, t: number): SkyKey;
```

Tests (`tests/feed-scenes.test.ts`): `locate` boundaries and monotonicity;
`blendKeys(a,b,0)===a`, `(…,1)===b`; every room's `key()` keeps the sun inside
the open side for `side: left|right` at 1440×900 and 1024×768; `cover` equals
`owedMin/req` clamp at `t=0` for every room (honesty).

### 3.2 Renderer (`meridian-sky-webgl.ts`)

- Add `u_zoom` (scale `uv` about the sun's position), `u_arcMarkers[8]`
  (day markers along the arc, lit by coverage). Keep `pan`.
- `paint(state)` unchanged in shape; `MeridianSkyState` gains `cam.zoom`,
  `arc.markers`.
- Cap DPR at 1.5 on this canvas; `mediump` on mobile (FLIGHT §7).

### 3.3 `FeedWorld` component (replaces `feed-world` div)

```tsx
<FeedWorld rooms={ROOMS} ctx={roomCtx}>
  <Room id="now">…RightNowCard, PerformanceBrief…</Room>
  <Room id="day">…</Room>
  …
</FeedWorld>
```

- One `MeridianSkyCanvas` (sticky, `100dvh`, `margin-bottom:-100dvh`,
  `z-index:-1` inside an isolated stacking context — the part of the current
  mount that is right and stays).
- `ResizeObserver` on each `<Room>` → `lengths[]`; `starts[]` cumulative from
  the stage wrapper's bottom.
- One passive `scroll` listener → **rAF-coalesced** `paint(blend)` (today it
  paints synchronously per scroll event). Skip when `|Δp| < 1/512`.
- Writes `data-room`, `--room-p`, `--room-t` on the wrapper so the slabs'
  `clip-path` reveals are pure CSS off the same numbers.
- `onLive(false)` (context lost / reduced motion) → `.room-sky` fallbacks show.

### 3.4 CSS

- New: `.room { min-height:100dvh; display:grid; grid-template-columns: … }`,
  `.room[data-side=left] .slab { grid-column: 1 }`, `.slab--slim { width: 520px }`,
  `.slab--wide { width: 760px }`, `.slab { background: var(--m-ink-solid);
  border: 1px solid var(--m-border); }` — **opaque**, no blur.
- Slab reveal: `clip-path: inset(0 0 calc((1 - var(--room-t)) * 100%) 0)`
  style, `view()`-timeline fallback for entrances where supported.
- Delete: `.feed-world::before` scrim, the `--m-card: rgba(…0.82)` override,
  every `backdrop-filter` in the `.feed-world` block.
- Stand down `InteractiveDay`'s internal sky and the hero's `StageStars`
  inside rooms (`.sky-gl .iday-sky, .sky-gl .hero .stage-stars { display:none }`)
  — the one-horizon rule; the room's world *is* their sky now.

## 4. Build order (each step ships green on its own)

1. **Stop the bleeding** (½ day). Remove the scrim column, the blur panes and
   the translucent card var; make `.card/.tl/.dac/.dial` opaque inside the
   feed. Hide the hero's `StageStars` and `InteractiveDay`'s sky when the
   canvas is live. Result: one horizon, readable text, still a column — but
   an honest baseline for screenshots.
2. **Scene config + locate + blend** (`feed-scenes.ts` + tests). No UI yet.
   Drive the existing canvas from `locate()` instead of `scrollY/innerHeight`.
   Verify the world now changes *per room* across the whole 4,700px.
3. **Rooms + slabs** — wrap the six sections, apply sides/widths, 100dvh
   rooms, narrow-viewport collapse. Playwright: 6 rooms × {p=0, 0.5, 1} at
   1440 and 390 wide.
4. **Renderer additions** — `u_zoom`, arc markers; the five beats from §2.2;
   `clip-path` slab reveals keyed to `--room-t`.
5. **Fallbacks** — `.room-sky` static skies for reduced motion / no GL; verify
   the six settled frames.
6. **Audit** — zero idle rAF (perf trace with the tab still for 10s),
   DPR cap, text contrast ≥ 4.5:1 on every slab by construction (opaque),
   NN/g check: scroll never resisted or snapped mandatorily; reduced-motion
   snapshot; mobile battery profile.
7. **Docs** — `FLIGHT.md` §5 "Cruise" rewritten as the six altitudes;
   `DESIGN.md` Macrostructure: the feed's family becomes *Altitudes*
   (room-per-viewport) rather than Workbench column.

## 5. Acceptance (what "it feels like a world" means, testably)

- At any scroll position exactly **one** horizon is visible.
- No text pixel sits over a painted pixel: slabs are opaque; the sun, arc
  marker and scouts are inside the open side (test in §3.1).
- Scrolling 4,700px produces **five** distinct world states with transitions
  only inside the last 35% of each room; outside those windows the canvas does
  not repaint (counter in dev build).
- Each boundary has one nameable beat (§2.2) and no other motion.
- Reduced motion shows six settled rooms with static skies and the same
  words.
- Scroll is native; nothing animates `width/height/margin/inset`.

## 5a. The delight pass (round 2 of Altitudes)

Depth alone wasn't enough — the rooms needed life and the landing needed its
people. All additions stay input-caused and honest:

- **Scout flyover** — when scroll crosses a room boundary, one ember bursts
  from the previous arc's end toward the new room's sun (`u_streakP`,
  an 80-frame bounded burst through the shared `queue()` — no ambient loop).
- **Pointer magnetism** — `u_mag` rides the existing `pan()` wiring: the sun
  and arc lean toward the hand, strength keyed per room (`SkyKey.magnet`,
  stage 0 → discover 0.9). The world notices you.
- **The plan draws itself** — inside `plan`, the route's coverage marker
  sweeps `t = glow·min(1, p/0.3)` — scroll progress, never a timer.
- **The altimeter** — `.alti`, a sticky mono chip at the viewport's lower
  left: `0N/06 · {room label} · {body time}`. Orientation as instrumentation.
- **Focal presence** — `day` room sun ×0.9, day strip lowered to 0.24,
  horizon warmed ×1.08 — the empty half of each room hosts a real element.
- **The sun gains a face on landing** — a DOM `SunSelf` sticky-pinned to
  the `discover` room's painted disc (72%, 36%), opacity keyed to the
  room's progress; settled at full opacity under reduced motion.

## 5b. The adverts (landing)

`SampleJourneys` ("Four arrivals") was a text wall; the characters it names
already exist as film. `public/ads/` carries the trimmed stills + clips
(~9MB total, lazy). The cast's file names are the truth — diego/earl/marcus —
so the personas took them: Diego Vidal, **Marcus** Mercer, **Earl** Rivers
(the scenario ids `miles`/`danny` stay opaque keys; Sofia keeps a text row —
her advert was never shot. When stills exist: drop `sofia.webp` in
`public/ads/` matching the 800px 4:5 crop and set `sofia: "sofia"` in
`SAMPLE_AD` — a one-line manifest change; a voice toggle needs a line). Composition: the feature frame pairs with the
trip form inside `.landing-entry-stage` (the who beside the ask), the tile
rail + caption runs beneath as the stage's floor, and `LandingInstrument`
pairs with `LandingExampleDay` (the mechanism beside its proof). Tiles are
muted IO-gated loops; a tap moves that character into the frame and plays
his full 34s spot with audio; a speaker toggle plays each cast voice line
(~5s). `EverydayRhythm` is cut — the close lands on the adverts. The
disclosure law holds: `FICTIONAL` stamp on the caption and foot.

## 6. Explicitly not doing

- Lenis / smooth-scroll / mandatory snap (hijack).
- Infinite looping (our arc ends at the destination).
- UI in canvas (`@pmndrs/uikit`): instruments stay DOM by contract.
- Per-card parallax tweens: depth comes from the three planes in §2.1, not
  from moving cards.
