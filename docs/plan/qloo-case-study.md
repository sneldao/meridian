# Meridian × Qloo — the personal-subgraph story

One page for Qloo's developer-relations team. Live product:
<https://meridian.trustfall.xyz> — 90-second demo: `/demo` (beat 4 is the
taste beat). Repo: <https://github.com/sneldao/meridian>

## What it is

Meridian is a crew of agents that plans your body-clock around a trip —
and knows what you love when you get there. The pitch that matters to
this ecosystem: *agents are culturally blind AND body-blind. Qloo fixes
the first half; a phase-response model fixes the second. Meridian is the
agent that knows your taste and your body clock.*

## Why it's a Qloo story, not a Qloo sticker

- **The taste graph is the semantic layer.** Favourites (music, film,
  books, brands) resolve to entity URNs via `/search`; destination reads
  use `/v2/insights` with `signal.interests.entities` — cross-domain
  correlation a location search can't produce. Björk's Tokyo (galleries,
  listening bars) is not Luke Combs's Tokyo — visible in one click in
  `/demo`.
- **A personal subgraph rides the global one.** Every keep/swap/dismiss
  lands as a graph edge keyed on Qloo entity IDs
  (`recordTasteSignal` → `Traveler -[:KEPT|DISMISSED]-> TastePlace`).
  On the next trip, kept IDs re-enter `signal.interests.entities` beside
  declared favourites and dismissed places are suppressed outright
  (`tasteHistory`). Recommendations compound instead of resetting — the
  card says so: "remembered picks."
- **Taste decides what, never when.** A deterministic placement solver
  drafts the day and a phase-response-model scorer gates it — Qloo
  answers never touch sleep, light, caffeine, or calendar timing. The
  cultural layer is load-bearing for *what's offered*, provably absent
  from *when it happens*.

## The engineering discipline worth retelling

- "Agents propose, code disposes" — the same guardrail pattern applies
  to taste: favourites reach the model as untrusted data, never
  instructions.
- Honest degradation: no `QLOO_API_KEY` → the feature is disabled, not
  broken. Upstream reads are cached in-process with last-good fallback.
  Memory writes are best-effort (204 either way); graph down → identical
  behaviour to before.

## Artifacts

| What | Where |
|---|---|
| Live app | `https://meridian.trustfall.xyz` |
| The demo (beat 4 = taste) | `/demo` — recorded profiles, can't flake |
| Live read | `GET /api/taste?city=Tokyo&lon=139.7&lat=35.7` |
| Memory loop | `POST /api/taste/feedback` → `src/domain/graph-memory.ts` |
| Roadmap | `docs/plan/taste-flagship.md` |

## What we'd build next on the API

- **Destination briefing** — "what this city loves" across music, dining
  and art; wants per-domain insights reads.
- **More favourite domains** — podcasts, TV, hotel style; the picker
  already supports the entity types.
- **Time-aware recommendations** — the gap we kept hitting: daytime vs
  evening suitability is filtered client-side from category tags today;
  a temporal or venue-hours filter upstream would deepen the
  integration and sharpen the "taste ∩ when" story that makes Meridian
  unique in this ecosystem.
