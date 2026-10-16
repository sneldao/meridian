# Consolidation spec — consumer face, agent depth dial

Decided 2026-10-15. The Base44 redesign (PR #1, `base44/setup-c4ea0b8c`)
becomes the face of the app; the crew/lens surface demotes to depth-3 rather
than being deleted. Principle: **the nudge is the face, the evidence is
underneath** — one `CrewEvent` stream, purely presentational depth.

## Depth model

| Depth | Audience | Surface |
|---|---|---|
| Calm (default) | traveller | `NudgeFeedScreen` + `HandoffBanner` + `TripSummary` chip (the old `TripPassport` was deleted in the home-page overhaul — the trip is a fact you gave, not a section to configure) |
| Guided | skeptic | + per-nudge "why" expansion + `DeepDiveVisuals` (globe / swimlane / week) + slim crew ribbon (human verdicts, not raw tokens) |
| Operator | judge/dev | full lens shell: `LensShell`, `CrewFeed`, `WorldLens`, `ShiftBoard`, `CalendarLens`, `Ledger` |

Toggle: a persistent depth control named for curiosity — **Calm → Guided →
Operator** — not "simple/advanced". Implement as a `?depth=` param (shareable
URL for judges/video) + a UI control; `localStorage` remembers it.

## Nudge-level provenance

Extend `TravelerNudge` (`src/domain/nudges.ts`) with refs into the run:

```ts
evidence?: {
  citationId?: string;        // → run.citations
  evalVerdict?: { score: number; violations: string[] }; // from eval_result for its day
  memoryPath?: string;        // graph hop path text, when recallFindings shaped it
  draftRejected?: boolean;    // this day was rejected once before locking
}
```

Populate in `useRunState`/run-state mapping from the same `CrewEvent`s the
ledger already consumes — `day_locked`, `eval_result`, `citation`,
`tool_result(recallFindings)`. No new event types.

**Never fabricate provenance.** Remove `DEFAULT_CITATIONS =
fallbackCitations()` in `page.tsx` — show "no citation for this one" instead.
The value is that the evidence is real.

## Crew ribbon (Guided depth)

A compact strip of human-readable beats distilled from the event stream —
not raw tokens:

`Otto drafted D-2 → scorer rejected (SHIFT_TOO_FAST) → locked on retry · score 0.91`

Source: `plan_candidate`, `eval_result`, `day_locked`, `calendar_move`,
`error` events. Reuse `ledgerEvents` from `src/state/run` where possible.

## Operator depth

The pre-PR `page.tsx` lens shell, unmodified, behind the dial — it is the
video surface (shot list beats 2–7) and the Graph Hacks/MCP demo. Do not
delete the orphaned imports; re-home them under the depth-3 view.

## Implementation checklist

- [x] Merge PR #1 (typecheck, lint, 143 tests green on the merged tree)
- [x] `src/domain/nudges.ts`: `evidence?` field on `TravelerNudge` + populated
      from `verdicts`/`rejected` in `buildDailyNudgesForDay` (day-level chain:
      latest verdict score + violation messages + draftRejected)
- [x] `NudgeFeedScreen`: "Why & details" drawer renders the crew evidence row
      (score, violations, retry flag, backing citation)
- [x] Operator view: resurrected at `/crew` — `/` links from the nav pill +
      menu; `/crew` links back ("← the traveller's view"). NOTE: first attempt
      silently captured the wrong rev (merge fast-forwarded, `HEAD^1` was a
      branch commit, not pre-merge main) — restored correctly from `bc26481`
      and verified the lens surface (LensShell/CrewFeed/lenses) is real.
- [x] Remove `DEFAULT_CITATIONS` fake-evidence fallback
- [x] `?depth=` param — `guided` opens every evidence drawer, `operator`
      redirects to `/crew` (shareable judge URLs). localStorage persistence
      deferred — URL param + menu link covers the v1 dial
- [x] Guided ribbon — `dayBeat` line under the day strip: "Crew: drafted 2× ·
      scorer rejected 1× · locked at 0.91 · trip memory consulted", derived
      from verdicts/drafts/locked only (never reconstructed)
- [x] `memoryPath` provenance — `page.tsx` extracts the latest
      recallFindings/priorFailures hop path from `run.log` tool_results,
      flows into every nudge's evidence row
- [ ] Update the video shot list — better arc now: calm face → why-expansion → full crew

## Why this shape

Meridian's differentiator is provable provenance, not the dashboard. The
consumer surface becomes the *compressed* agent story; operator depth stays
the evidence judges inspect. Same submission assets, stronger product.

## Brand harmonization (2026-10-15, post-merge)

The two surfaces now share one identity instead of trading it off:

- **Hero = the namesake.** The stock photo is gone; the hero panel is a
  night-ink gradient with the glowing terminator line (`--color-ghost`),
  destination sun + home dot — "ghost terminator" as the literal product
  visual inside the sunlit card.
- **Depth is visible.** Third nav pill "Crew" — Operator is a rung, not a
  buried link.
- **Evidence is a badge.** Gate score / rejected-retried / citation /
  memory-path render as chips (`.evchip`), not a prose footnote.
- **Honesty tightened.** Index-picked citation fallbacks removed — a nudge
  shows a paper only when the intervention carries a real `citationId`.

Palette note: sunlit `#D96B43` is terminator gold `#ffd98a` deepened for
daylight — the same dawn, seen from the consumer side.

- **Transition, not teleport.** `.dawnIn` overlay: crossing `/` → `/crew`
  replays the hero's terminator horizon full-screen for a beat before
  resolving to ink — the same dawn seen from inside the mission.
- **Motif at chip scale.** `.day::before` — a 7px circle bisected ink/gold —
  the terminator rides inside every day button.
