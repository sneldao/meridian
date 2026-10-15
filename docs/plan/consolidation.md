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

- [x] Merge PR #1 (typecheck, lint, 143 tests green on the merged tree)
- [x] `src/domain/nudges.ts`: `evidence?` field on `TravelerNudge` + populated
      from `verdicts`/`rejected` in `buildDailyNudgesForDay` (day-level chain:
      latest verdict score + violation messages + draftRejected)
- [x] `NudgeFeedScreen`: "Why & details" drawer renders the crew evidence row
      (score, violations, retry flag, backing citation)
- [x] Operator view: resurrected verbatim at `/crew` — `/` links to it from
      the nav menu ("See the crew work →")
- [x] Remove `DEFAULT_CITATIONS` fake-evidence fallback
- [ ] Depth control component + `?depth=` param + localStorage — v1 ships the
      dial implicitly (expanders = Guided, /crew = Operator); a global param
      is still worth it for judge-facing URLs
- [ ] Guided ribbon component (distilled beats, ~4 lines) — human-readable
      eval/calendar beats distilled from the event stream
- [ ] `memoryPath` provenance — needs `recallFindings` results mapped back to
      days (tool_results aren't keyed by day yet)
- [ ] Update the video shot list — better arc now: calm face → why-expansion → full crew

## Why this shape

Meridian's differentiator is provable provenance, not the dashboard. The
consumer surface becomes the *compressed* agent story; operator depth stays
the evidence judges inspect. Same submission assets, stronger product.
