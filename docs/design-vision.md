# Design vision — the second sun

**Date:** 2026-10-15 · **POC:** product / design (TBD) · **Status:** proposal

**TL;DR** — Meridian has two cinematic primitives no competitor uses: the
real sun moving across a real planet, and an invisible clock inside your body.
Jet lag is the gap between them. The vision is to render that gap literally —
a **Ghost Terminator** for your body's dawn, chasing the real one across the
globe — and let the crew close it on screen. Rule of the world: **nothing is
decorative**; sun position, sky colour, city lights and the body clock are real
or modelled. Build in three tiers; Tier 1 (~3–4 days) delivers most of the wow.

---

## 1. Why — research highlights

| Finding | Implication |
|---|---|
| Immersive 3D went from 23% → 41% of Awwwards Sites of the Day, 2024 → 2025 ([source](https://digitalstrategyforce.com/journal/why-are-immersive-experiences-dominating-the-2026-awwwards)). Live terminator globes are already hobby projects. | 3D alone is table stakes. Novelty must come from a **new primitive**, not the medium. |
| Light phase response curve: light *before* core-body-temperature minimum (CBTmin) delays the clock, *after* advances it; a single bright pulse moves you ~2–3 h max ([J. Circadian Rhythms](https://jcircadianrhythms.com/articles/10.1186/1740-3391-5-4)). | A built-in, true-to-science game mechanic: the same beam pushes you forward or back depending on where it lands. |
| Kronauer/Forger oscillator models are small ODE systems with a light-input stage ([Forger 1999](https://pubmed.ncbi.nlm.nih.gov/10643750)). | The world can *simulate* the plan per frame, not just illustrate it. |
| Preetham / Hosek-Wilkie analytic sky models give accurate sky colour for any sun position ([sun-sky](https://github.com/andrewwillmott/sun-sky)). | Sky colour can be derived from physics, including the body's subjective time. |
| NASA Black Marble: science-grade night-lights composites, public domain ([NASA](https://www.earthdata.nasa.gov/data/projects/black-marble)). | Real night side for free. |
| Timeshifter is correct but functional — a list of light / sleep / caffeine instructions ([guide](https://www.timeshifter.com/timeshifting/advice-guide)). | Nobody makes the shift *felt*. That is the gap. |
| Endel ([soundscapes](https://endel.io/soundscapes)), Abeto's *Messenger* ([80.lv](https://80.lv/articles/deliver-mail-on-tiny-colorful-planet-in-this-relaxing-web-game)), Flighty ([breakdown](https://blakecrosley.com/guides/design/flighty)). | References for circadian-adaptive sound, art-directed WebGL that runs on phones, and emotional flight data. |

---

## 2. The signature primitive — the Ghost Terminator

Render the real Earth with today's real day/night line. Overlay a second, ghostly
terminator: **where your body thinks dawn is.**

- LHR → HND starts with the ghost **135° of longitude** behind the real Tokyo
  dawn (9 h × 15°/h). The gap *is* the jet lag, drawn on the planet.
- Each scorer-locked day drags the ghost east across real continents.
- Climax: the two lines fuse. At 70% the handoff says honestly
  *"you'll land with 30° to go — the crew keeps working after touchdown."*

This is the image Meridian is recognised by. Everything below hangs off it.

---

## 3. Three worlds (combined, connected by camera)

| World | What it is | Role |
|---|---|---|
| **A. Orbit** | Slow-turning Earth: real terminator, Black Marble lights, atmospheric rim glow, ghost terminator. Opens on your city at your local time. The flight is a great-circle arc with the plane crossing real day and night, showing *why* the plan says "eye mask now". | The stage |
| **B. The Instrument** | An astrolabe / complication: outer ring = destination clock, middle = light PRC with advance and delay fields around CBTmin, inner = sleep window. Interventions are beams of light landing on the rings. Later: drag a beam, see the predicted shift from the oscillator. | Where the user acts |
| **C. Window Seat** | First-person aeroplane window. Its sky is rendered from your **body's** time; beside it, the **real** sky at the destination. As days lock, your sky drifts through blue hour to first light. A cheap 2D sky shader. | The ending |

Camera choreography: pull back to Orbit → focus the Instrument for planning →
dive into the Window Seat for dawn.

---

## 4. The crew in the world

| Agent | Embodiment | Signature moment |
|---|---|---|
| **Mara** · analyst | Low survey satellite | Wearable history as a glowing contrail orbit |
| **Jun** · research | Deep-sky observer | Each citation falls as a star into an **evidence constellation**; tap a star → DOI |
| **Otto** · planner | Works the Instrument | Places light beams one day at a time into advance / delay fields |
| **Iris** · eval | A ring-shaped scanning gate | Constraints light up one by one; stamps PASS or refracts the plan back with red marks on the broken rules |
| **Rex** · negotiator | Your week as a small physics model | Events are blocks, fixed commitments are anchors; Rex pushes the gym to lunch "around the walls, not through them" |

The current `CrewFeed` becomes **subtitles** — the crew's voice over the world,
not a terminal beside it.

## 5. The scorer as the drama

"Agents propose; the deterministic scorer disposes" is the differentiator, so
it gets the best moment. Example: Otto proposes 05:00 light for someone whose
adherence floor is 07:00 → the beam hits the Instrument → Iris's gate flashes →
the world briefly loses colour with a dissonant tone → the beam slides to 07:00
→ PASS, a resolved chord, a bell as the day locks.

The oscillator model (Tier 3) is labelled as a model and **never overrides
`evaluatePlan`** — see [scoring](scoring.md).

## 6. Sound

Opt-in (headphones) generative ambient score via Tone.js. Key and brightness
follow body-clock phase; each agent is an instrument; PASS resolves the harmony,
FAIL leaves it hanging; each lock adds a bell; dawn in the Window Seat is the
full chord. ~1 day of work, a large share of the immersion.

## 7. The closing artifact

Each trip produces a one-of-one **light signature** poster from real data:
terminator geometry, flight arc, evidence constellation, dates. It doubles as
the `.ics` handoff (boarding-pass variant with one tear-off stub per day) and is
the thing people share.

## 8. UI system changes

- **World full-bleed; controls float on top as a light overlay.** Remove boxes-inside-boxes.
- **Colour comes from the physics.** UI tints with the sky colour of the
  *body's* time, so the app literally gets lighter as you adapt. State colours
  (pass / fail) are reserved and never reused as agent colours.
- **Type:** display serif for the crew's voice and emotional moments, precise
  mono for readouts, nothing below 12 px, far fewer uppercase micro-labels.
- **Route picking is physical:** drag origin and destination on the globe, or a
  split-flap departures board. No native `<select>`s.
- **Opening hook:** *"It's 19:12 in your body. It's 03:12 in Tokyo."*
- **Onboarding:** no modal; a 6 s silent preview of the crossing, then each crew
  member introduces themselves in place.
- **Review page:** a 5-row × 24 h swimlane; sleep blocks form a diagonal
  staircase sliding earlier; citations in a footnote gutter.
- **Reduced motion:** the current SVG `SunTrack` becomes the fallback.

## 9. 90-second demo flow

| Time | Beat |
|---|---|
| 0–10 s | Black → the real Earth tonight. Your city lit; the ghost line 135° behind Tokyo's dawn. |
| 10–25 s | Crew satellites come online. Mara traces your sleep orbit; Jun's stars fall into a constellation. |
| 25–50 s | Otto's beams land on the Instrument. One rejected: colour drains, the beam slides to 07:00, PASS. The ghost line moves east. |
| 50–65 s | Rex's calendar blocks move around their anchors. |
| 65–85 s | Camera dives into the Window Seat: your sky at blue hour, Tokyo's at sunrise. |
| 85–90 s | The light-signature poster forms. "Add to calendar." |

---

## 10. Build plan

**Stack:** React Three Fiber + drei, three.js WebGPU renderer with WebGL
fallback, glow / bloom post-processing; `astronomy-engine` or `suncalc` for sun
position; NASA Blue / Black Marble textures (public domain); Tone.js; Framer
Motion + GSAP for interface and camera animation.

**Prerequisite:** add latitude / longitude to the city table.

| Tier | Scope | Effort |
|---|---|---|
| **0 — Fix the scaffold** | See §11. Ships regardless of the tiers below. | 1–2 days |
| **1 — Spike** | Globe with real terminator + ghost terminator driven by the existing `sunProgress`; overlay interface; Window Seat ending as a 2D sky shader. | ~3–4 days |
| **2 — World** | Crew embodiments, evidence constellation, Iris's gate drama, Rex's calendar physics, generative sound, light-signature poster. | ~1–2 weeks |
| **3 — Simulation** | Oscillator model in the browser; draggable Instrument with live predicted body clock; validation against `evaluatePlan`. | Larger |

## 11. Tier 0 — current-scaffold issues (from the 2026-10-15 UI review)

- `SunTrack.tsx` and the idle copy hardcode London / Tokyo / UTC offsets; other routes render wrong.
- "Across the dateline" is wrong — LHR → HND doesn't cross the International Date Line.
- The SVG letterboxes (fixed 1000×430 viewBox), leaving empty bands in the hero card.
- The handoff card covers the whole hero, hiding the payoff (where the sun ended up).
- Day markers sit on a straight line while the sun moves on a curve, so they never line up; labels overlap the markers.
- The sun's trail draws as grey smudges; the blinking cursor stays on every finished feed paragraph.
- The handoff score (0.90) differs from the last check (0.89) with no explanation.
- Agent colours collide with state colours (Jun = lime = PASS; Iris = rose = FAIL / error; Otto / Rex reuse the sun colours).
- The header wraps at 1200 px; the route appears twice; replay and provider chips are debug details.
- The crew panel is empty before the first run; the onboarding modal covers the hero on first load.
- `page.tsx` uses raw hex values while other pages use theme tokens.
- Console: missing `favicon.ico` (404), a script-tag render error, `themeColor` should move to the `viewport` export.
