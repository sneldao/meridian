# Consolidation spec — consumer face, agent depth dial

Decided 2026-10-15. The Base44 redesign (PR #1, `base44/setup-c4ea0b8c`)
becomes the face of the app; the crew/lens surface demotes to depth-3 rather
than being deleted. Principle: **the nudge is the face, the evidence is
underneath** — one `CrewEvent` stream, purely presentational depth.

## Depth model

| Depth | Audience | Surface |
|---|---|---|
| Calm (default) | traveller | `NudgeFeedScreen` + `HandoffBanner` + `TripPassport` |
| Guided | skeptic | + per-nudge "why" expansion + slim crew ribbon (human verdicts, not raw tokens) |
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

- [ ] Merge PR #1 first (after `bun run typecheck && bun test && bun run build`)
- [ ] `src/state/run.ts`: depth-agnostic provenance extraction → `evidence` map keyed `dayIndex`+`intervention`
- [ ] `src/domain/nudges.ts`: `evidence?` field on `TravelerNudge`
- [ ] `NudgeFeedScreen`: per-nudge expander rendering evidence chain
- [ ] Depth control component + `?depth=` param + localStorage
- [ ] Guided ribbon component (distilled beats, ~4 lines)
- [ ] Operator view: resurrect lens shell under depth=operator
- [ ] Remove `DEFAULT_CITATIONS` fake-evidence fallback
- [ ] Update the video shot list — better arc now: calm face → why-expansion → full crew

## Why this shape

Meridian's differentiator is provable provenance, not the dashboard. The
consumer surface becomes the *compressed* agent story; operator depth stays
the evidence judges inspect. Same submission assets, stronger product.
