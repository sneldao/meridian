# BRIEF — Meridian demo video (one video, three hackathon submissions)

workflow: product-launch-video
flow: companion

## Purpose

A single ~3 min demo video submitted to **Graph Hacks (Oct 18)**,
**Amazon Developer (Oct 23)** and **Nebius × NVIDIA (Oct 30)** hackathons.
Qloo (Oct 30) uses the same cut once its `destinationTaste` beat can be
filmed. Per-submission tailoring = voiceover emphasis + final frame card only;
footage never changes. Shot list lives in `docs/plan/hackathon-submissions.md`
→ "One video for all".

## Subject

Meridian — a crew of five agents that plans a day-by-day circadian shift
around a trip across time zones: what you can bank pre-flight under your
real adherence limits, and what honestly lands after touchdown. "Agents
propose, code disposes": a deterministic phase-response scorer gates every
plan. Live: https://meridian-afud.onrender.com

## What must appear (the sponsor deltas, in shot order)

1. Route picker → crew run starts (world lens + feed)
2. Jun calls `searchScience` then `searchWeb` (Tavily) — Tavily prize beat
3. Scorer rejects a draft, Iris explains, retry locks — the gate beat
4. `recall_findings` with hop path / cross-run memory — Graph Hacks beat
5. Otto calls `destinationTaste`, a plan note grounds a light break in a real
   Tokyo venue — Qloo beat (block on key)
6. Briefing card + `.ics` + calendar moves
7. Terminal: `tools/call plan_shift` on the live URL via MCP — Amazon beat
8. Close frame: tagline + provider badge (`nebius` — NVIDIA beat)

## Audio

Narration via ElevenLabs (Sarah, `eleven_v4_turbo` — same voice identity as
the product's morning handoff). Script + per-scene WAVs in `audio/` —
generated from `script.md`.

## Canvas / constraints

16:9 1080p, dark UI to match the product. Runtime under 180s. No stock
footage; real app capture only.
