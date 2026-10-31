# Hackathon submission text — base template

Reusable scaffold for every Devpost submission. Per-sponsor variants change
only the **Sponsor-tech delta** paragraph and the final paragraph. Keep the
voice plain, the verbs concrete, and the claims honest — every quoted number
is reproducible against `bun run replay:check` or the live Render URL.

---

## Title
Meridian — agents that fly ahead of you

## Tagline (1 sentence)
A crew of five long-running agents that shift your body clock as far as you'll
honestly go before you fly, and finishes the job after you land — gated by a
deterministic phase-response scorer that won't let the planner oversell your
physiology.

## The problem (2–3 sentences)
You land at 8 a.m. Tokyo. Your client walks in at 9. Your body thinks it's
midnight. The travel industry ships you a pillow and a melatonin gummy and
calls it wellness — nobody schedules the one thing that decides your week:
the multi-day circadian shift before and after the flight. $1.7T of business
travel rides on a problem no one solves.

## What Meridian is (3–4 sentences)
A product, not a chatbot. The same five-agent crew — Mara (analyst), Jun
(researcher), Otto (planner), Iris (evaluator), Rex (negotiator) — runs every
trip. Otto drafts each day's plan from a solver-placed skeleton; Iris argues
back from a fresh context; the deterministic scorer (a closed-form
phase-response model, no LLM in the loop) decides. **Agents propose, code
disposes.** Every step in the published plan carries a gate score, a citation
with a DOI, and a hop-path through a per-traveller graph. The trip's arrival
morning (`/arrival`) scores the plan against what actually happened — and
that number is what the next trip plans from.

## Sponsor-tech delta
*(per-submission — see variants in this directory)*

## What's new this window
The home surface is now a one-question dial with a depth toggle. The check-in
loop is real: per-step did/skip marks a ledger entry, the rail re-solves the
day, the calendar reshapes. The flight picker actually plans — pick a
departure window, the whole week re-places around the moved flight. Memory is
per-traveller (`meridian:{tid}` in FalkorDB) — your second trip differs from
whoever used the demo last. The arrival surface (`/arrival`) finally cashes
"land at 100%" against the day's actual score.

## Try it
- Live: https://meridian.trustfall.xyz
- Repo: https://github.com/sneldao/meridian
- Demo video: https://meridian.trustfall.xyz/video (or attach the .mp4)
- Replay harness: `bun run replay:check` — same crew, same routes, same
  outcomes deterministically (no API keys required)

## Built with
- Next.js 16.4.1 · TypeScript · FalkorDB (cross-run graph memory)
- Open-weight models by default (Qwen3-32B / Nemotron 3 Ultra via Token
  Factory) — provider-agnostic, verified identical outcomes on Claude and
  Nemotron against the same D-1 physiological-limit scenario
- ElevenLabs Sarah (voice handoff) · MCP server (Streamable HTTP, protocol
  2025-11-25, 8 tools)
