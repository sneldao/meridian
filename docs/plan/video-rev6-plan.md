# Demo video — rev5 post-mortem + rev6 plan

**Status:** rev5 cut rendered (`~/Downloads/meridian-demo-rev5.mp4`, 3m 16s,
33MB, 1920×1080 h264+aac, `npm run check` passes). User feedback after
watching: cut feels **static, uninspired, anachronistic** — long slides
where nothing happens, no transitions or motion design, no artefacts
substantiating the storytelling, no sponsor references. This document
captures the diagnosis, the rev6 plan, and the named primitives we'll
install from the HyperFrames registry to fix it.

## Why rev5 read as static

Reading the HyperFrames creative docs against rev5 surfaces the failure
modes by name:

- **Same ease on everything.** `power3.out` on nearly every entrance across
  13 scenes. The motion principles doc says: *"no more than 2 independent
  tweens with the same ease in a scene."*
- **Same entrance direction.** `y: 30, opacity: 0` on every element. The
  house-style doc lists this as an "AI design tell."
- **Static decoratives.** Radial glows, sun, globe, clock face — drawn but
  not breathing. House-style: *"All decoratives should have slow ambient
  GSAP animation — breathing, drift, pulse. Static decoratives feel dead."*
- **One focal point per scene.** Card or headline, surrounded by paper or
  void. House-style: *"Two focal points minimum per scene. The eye needs
  somewhere to travel."*
- **No sponsor callouts.** No FalkorDB, Nemotron, Qloo, Tavily, or MCP
  branding visible anywhere in the film. Sponsor judges scan for their
  tech at the beat each technology does its work.
- **Long slides, nothing happens.** 16-26s scenes with one motion peak.
  Shorts-era attention drops at 8s, 45s, 1m40s — not enough eye-travel
  to hold judges at those moments.

The dev's earlier "layer named primitives" pass was on the right track but
applied primitives as **decoration on top of a static skeleton**. rev6
applies them as the **structural skeleton** of each scene.

## rev6 plan — scene by scene

| # | Scene | rev5 failure | rev6 fix | Registry primitive |
|---|---|---|---|---|
| 1 | Hook | Static kinetic type | Add word-sweep highlight on *"1 a.m."* synced to VO. Ambient drift on clock face. | `mk-callout-highlight` |
| 2 | Crew feed | Static card + stat bar | Replace with specs checklist of 18 tools, each with a sponsor-tag chip (`qwen3-32b · nebius-token-factory · tavily · falkordb`). | `mk-specs-list` |
| 3 | Calm face | Real capture, OK | Add mask-reveal lower third naming the depth-dial affordance. | `lt-mask-reveal` |
| 4 | The loop | Real capture, OK | Add dual focal points: capture on right, live ledger counter on left counting steps marked. | `mk-progress-stat` |
| 5 | Guided depth | Static type card | Replace with decision tree showing gate → revise-once → lock with cursor interaction. | `flowchart` |
| 6 | Dive dark | Boring void | Replace with freeze-frame + speed-ramp + hard cut as act-break. | `beat-freeze-cut` |
| 7 | Gate | One chip-row, static | Dual focal points: ledger on left, gate-score trace graph on right. | `mk-line-graph` |
| 8 | Memory | Three nodes, static | Real decision tree showing skip → record → adherence → next trip differs. | `flowchart` |
| 9 | Flight picker | Two static cells | Solari departure board spelling the chosen flight. | `split-flap-board` |
| 10 | Handoff | Static evidence fan | Keep Qloo-grounded note + add specs check of .ics contents and citations. | `mk-specs-list` |
| 11 | MCP | 10s static terminal | **Amazon beat.** Code-typing JSON-RPC envelope with badges. Three focal points. | `code-typing` |
| 12 | Landing | Three static cells | Three count-up stat cards side by side + mask-reveal lower third. | `mk-progress-stat` + `lt-mask-reveal` |
| 13 | Close | Static tagline | Keep tagline + dawn globe, add word-sweep highlight on the word *"ahead"*. | `mk-callout-highlight` |

## Sponsor callouts at the beat each tech does its work

Not as a logo-card fest, not crammed into the close — as a beat where the
technology is doing its work and a small chip names it:

- **s2** Jun's tool list: `qwen3-32b · nebius-token-factory` (Nebius/NVIDIA) and `tavily · live web` (Tavily $3K prize).
- **s5** Hop path: `falkordb · per-traveller graph` (Graph Hacks).
- **s9** Flight picker: `qloo · destinationTaste` (Qloo).
- **s11** Terminal corner: `streamable-http · protocol 2025-11-25` (Amazon).
- **s13** Close badge: `nebius` (NVIDIA).

## Motion vocabulary changes

Per the HyperFrames motion principles guardrails:

- **Vary eases across scenes.** `power3.out` for hooks, `expo.out` for chip
  lands, `sine.inOut` for ambient breathing, `elastic.out` for split-flap
  commit, `back.out(1.6)` for flowchart node pops.
- **Vary entrance directions.** Split-flap board has its own per-cell drum
  stagger; flowchart nodes pop in; mk-callout-highlight sweeps words on the
  VO scalar; beat-freeze-cut gives hard cuts where the dev had crossfades.
- **Ambient decoratives breathe.** Every radial glow, sun, globe gets a
  slow `to(...yoyo:true, repeat:-1...)` breath **attached to the timeline**
  (per the load-bearing GSAP rule — ambient pulses on `tl`, never bare
  `gsap.to()`).
- **2+ focal points per scene.** Every scene now has at least one registry
  primitive + the existing content card.

## Installed registry blocks (2026-10-17)

`hyperframes add` against this project:

- `mk-callout-highlight` — word-by-word highlight sweep
- `mk-progress-stat` — big-numeral count-up stat card
- `mk-specs-list` — left-aligned specs checklist
- `beat-freeze-cut` — beat-driven speed ramp + freeze-frame + hard cut
- `split-flap-board` — Solari departure board with flap stagger
- `lt-mask-reveal` — cardless lower-third with accent sweep
- `mk-line-graph` — SVG line graph that draws on
- `code-typing` — token-streamed typing reveal with caret
- `flowchart` — animated decision tree with SVG connectors and cursor

All installed under `video/compositions/`. Each mounts into the host via
`data-composition-src` with `data-start`, `data-duration`, and matching
`data-composition-id`.

## Per-sponsor tailoring

Already scaffolded at `video/compositions/last-frame/`:

- `graph-hacks.html` — graph memory framing
- `amazon.html` — MCP surface as the closer
- `nebius-nvidia.html` — provider badge
- `qloo.html` — grounded venue as the closer

Submission text variants at `docs/plan/hackathon-text/`:

- `template.md` — base scaffold
- `graph-hacks.md` — sponsor-tech delta paragraph
- `amazon.md` — sponsor-tech delta paragraph
- `nebius-nvidia.md` — sponsor-tech delta paragraph
- `qloo.md` — sponsor-tech delta paragraph

`LICENSE` (MIT) is at repo root — Qloo's OSI requirement is already met.

## Work plan

1. **Phase 1 — wire the registry primitives.** Replace the static elements
   in s1, s2, s5, s6, s7, s8, s9, s11, s12, s13 with the registry blocks
   listed above. Add sponsor chips in the corner of each scene where the
   tech is doing its work.
2. **Phase 2 — apply the motion guardrails.** Vary eases, vary entrance
   directions, attach ambient decoratives to the timeline.
3. **Phase 3 — render rev6.** Catch any sub-composition nesting or
   visibility-window issues with `npm run check` between each scene.

**Estimated time:** 3–4 hours focused work.

## Why this approach

The rev5 cut reused v4's working vocabulary (terminator blade, chip reject/
pass, cursor-click on flight picker, dawn globe, gradient-text sweep on
the close) but applied it as **decoration over a static skeleton** — the
critique the dev's earlier "layering" pass correctly got, and what rev6
fixes by replacing the static skeleton itself with named, seekable
primitives. Sponsor callouts land at the beat each technology does its
work, not as a logo-card fest. Two focal points per scene give the eye
somewhere to travel at the 8s, 45s, and 1m40s drop cliffs.
