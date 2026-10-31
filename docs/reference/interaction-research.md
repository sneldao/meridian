# Interaction research — playable, personal, shareable

**Status:** Approved design direction; implementation is in progress. Research is
based on official product descriptions, engineering/vendor write-ups, and Apple's
design awards — not hands-on browser QA. Sources establish techniques, not causal
proof of retention or revenue.

## Summary

Meridian should combine the playability of (Not Boring), the sunlight clarity of
Lumy/Sunlitt, and the personal shareability of Flighty. Performance is the payoff;
correctly timed light is a mechanism; Qloo makes optional experiences personally
appealing. The goal is a calm daily tool with memorable, user-triggered reveals —
not an obligatory cinematic intro.

## Findings

### 1. Playable data

(Not Boring) Weather lets users scrub time through a weather scene driven by
weather inputs; physics, sound, and haptics add game feel.
Source: <https://notbor.ing/product/weather>

**Adapt:** inspect the selected day — local and estimated body time, the actual
plan's seek-light / reduce-light windows, the event marker, the optional place.
Inspecting time must not change the schedule or credit adaptation.

### 2. Spatial solar instruments

Lumy presents solar events, countdowns, and glanceable views; Sunlitt offers sun
paths, shadows, and 3D map modes.
Sources: <https://lumy.app/watch> and
<https://apps.apple.com/us/app/sunlitt-sun-tracker-seeker/id1628751457>

**Adapt:** clearly distinguish what the sun is doing from what the plan
recommends — sunrise is not automatically the right light timing. If solar
position is not computed, do not render a decorative curve as a measurement.

### 3. State-driven motion

Duolingo describes Rive state machines combining programmatically controlled
animation states.
Source: <https://blog.duolingo.com/world-character-visemes>

**Adapt:** recognizable taste objects remain continuous across
suggested / inspected / kept / swapped / unavailable states; protected times stay
anchored. Use the existing Motion stack first; Rive only if illustrated state
complexity justifies it — not as an automatic dependency.

### 4. Programmable materials

PaperShader catalog supplies grain, water, glass, dither, and light-ray effects.
Source: <https://shaders.paper.design>
This is an enabler, not proof shaders improve product outcomes.

**Adapt:** one state-driven atmospheric stage, real HTML controls and readouts,
and a static reduced-motion fallback. No everywhere-glass, perpetual particles,
or a new rendering engine just for a background.

### 5. Real-world objects as collectibles

Apple's 2025 Delight and Fun winner CapWords converts photos of objects into
interactive learning stickers.
Source:
<https://www.apple.com/newsroom/2025/06/apple-unveils-winners-and-finalists-of-the-2025-apple-design-awards>

**Adapt:** taste tokens, kept-place tickets, optional user-owned trip photos. No
unlicensed album covers or stock images pretending to be actual venues. No points
for more light or less sleep, and no pressured compliance.

### 6. Shareability as an actual product feature

Flighty Passport summarizes flight history in shareable formats
(<https://flighty.com/help/passport>); Spotify Wrapped 2025 used data-driven Rive
motion per the vendor's January 2026 case
(<https://rive.app/blog/spotify-used-rive-for-spotify-wrapped-2025>); Strava
Flyover replays routes and activities in 3D and shares social video
(<https://support.strava.com/en-us/articles/15401641-flyover>).

**Adapt:** a designed Arrival Card and vertical story view built from the same
plan state — not a full UI screenshot. Distinguish planned from completed; keep
model / recorded-Qloo / example provenance visible. Personal exact itineraries,
event names, and physiological estimates require explicit opt-in for sharing.
Fictional judge samples must retain disclosure: not actual personal data or
endorsement.

## Implementation priorities

1. Playable, accessible light-and-performance scene with native keyboard range
   controls and a written equivalent.
2. Taste-to-plan continuity with the existing Motion stack; preserve
   Keep / Swap / Dismiss / Restore semantics and source provenance.
3. Privacy-conscious Arrival Card and vertical story view; explicit user action
   for export and stable frozen data for output. Do not claim actual video
   export until it is implemented and verified.
4. Restrained state-driven atmospheric rendering; use the existing graphics
   stack, fallbacks, pause when hidden or under reduced motion, no autoplay
   audio.

## Constraints

Preserve the clinical solver/scorer, calendar commitments, and the legacy guided
view. No forced perfect alignment; a user's inspection or scrubbing is not
adherence. Qloo venues are not light interventions without verified outdoor
logistics. No fake affinity percentages. 44px touch targets, focus and high
contrast support, no drag-only fact access. Sample flows are memory-only; actual
trips are not mutated by examples. A capture view does not change the source
plan or promise outcomes. Native haptics and Live Activities are not assumed
available in the web app. No new tracking, autoposting, or sharing permissions
are implied.

## Initial local implementation

Status of the first pass against this direction:

- **Playable day**: `DayScene` (`src/components/DayScene.tsx`) — native range
  input (0–1439) plus jump buttons per plan window; modeled solar altitude and
  gradient come from `src/domain/day-scene.ts` (real dated solar math, separate
  from plan guidance). Play is user-triggered only, pauses on hidden tab, and is
  disabled under reduced motion.
- **Sun vs plan separation**: the sky curve is modeled sun position, explicitly
  labeled "not a weather forecast"; seek/reduce/sleep lanes show the actual plan
  windows on the same 0–1440 axis. No decorative curve is presented as a
  measurement.
- **Taste continuity**: `ArrivalDayView` favorites render as pill tokens, and the
  venue name/categories crossfade on swap; keeping preserves the venue and adds a kept treatment via the existing framer-motion
  stack (`springCalendar`); reduced motion disables it. No Rive or shader
  dependencies were added.
- **Privacy-conscious card**: `DayCardShare` builds a frozen `PublicDayCard` via
  the privacy projection; opt-in checkboxes gate date/windows, event, body
  time, and taste names; PNG (canvas) and SVG (Blob) downloads are generated
  locally from `src/lib/day-card-svg.ts`. A focused vertical story view cycles
  the same three chapters for screen capture — it is **not** an MP4/video export.
- **Verification level**: SSR + unit tests and local SVG rasterization (sharp).
  No browser QA, no external calls, no benchmark claims. Separate page-wide palette/body-sky work is outside this milestone.
