# Consumer appeal — implementation plan

2026-10-15. Full plan derived from `next-steps.md` (diagnosis + research
synthesis + Calacanis lens). Sequenced against the submission cluster:
P0 items are video-visible and cheap; P1 post-video; P2 post-Oct-30.

Invariants: the scorer stays authoritative; evidence rows/chips never show
fabricated provenance; replay fallback stays stage-safe.

## P0 — pre-video (consumer face reads as a product, not a dashboard)

1. **Instant-value preview** (value-before-friction)
   - `NudgeFeedScreen` already shows fixture-derived nudges before any run —
     that's the preview. Make it deliberate: label the pre-run state subtly
     ("preview — run the crew for yours") and keep `REPLAY`-warm data so a
     stranger sees a populated feed in <10s.
   - Files: `NudgeFeedScreen.tsx` header copy only. ~20 lines.

2. **Next-action hero polish** (shipped this session; extend)
   - Add a big time-context line: "Your next move — {countdown}" as the
     visual anchor above the nudge title. Countdown already computes; style
     it as the hero's headline element, not a prefix on the time window.
   - Files: `NudgeFeedScreen.tsx` `.hr` block. ~15 lines.

3. **Day timeline view** (one rhythm, not five cards)
   - Add a `timeline` view mode to `GuideViewMode` ("focus" | "cards" |
     "timeline"): left-rail vertical list, `HH:MM — title — status check`.
     Same `allDayNudges` data, sorted by `startMin` (already sorted).
     Timeline becomes the default for first-time visitors ("cards" still
     available via the view switcher).
   - Files: `NudgeFeedScreen.tsx` (~60 lines render + mode). No domain
     changes — nudges already carry `startMin`/`timeWindow`/completion.

4. **Crew-as-mascot on the consumer surface**
   - HandoffBanner + evidence rows already name-check the crew implicitly;
     add agent chips (`AgentChip` from `components/ui`) to the "From the
     crew" evidence row — the source of each verdict visible by name/avatar.
   - Files: `NudgeFeedScreen.tsx` drawer, `HandoffBanner.tsx`. ~30 lines.

## P1 — post-video, pre-Oct-30 submissions

5. **Shareable plan card** (the viral loop)
   - `POST /api/share` (or reuse `/api/persistence/runs`): persist a run's
     briefing (summary, days, scores, citations, .ics) under a short id;
     `GET /plan/[id]` renders a read-only branded card — trip, readiness %,
     day strip, "built by the Meridian crew" footer + CTA "make your own".
   - Files: `src/app/api/share/route.ts`, `src/app/plan/[id]/page.tsx`
     (server component, static-ish), reuse `BriefingCard` markup trimmed.
   - ~150 lines + one Supabase table or artifact-backed blob.

6. **Outcome language sweep** (copy, not code)
   - Audit consumer strings: no "circadian", "phase-advance", "zeitgeber",
     "scorer" on Calm/Guided surfaces. Pain terms: "land ready", "day one",
     "energy". Mechanism words live on `/crew` + expanders.
   - Files: `NudgeFeedScreen.tsx`, `TripSetupScreen.tsx`, `HandoffBanner.tsx`
     copy pass. ~1 hour, zero logic.

7. **Flight-advisor honesty** *(done for the domain + home feed: `48223a0`
   replaced the fake numbers with `badge` + `bestFor`, `5f3cc83` deleted the
   hardcoded preview window. Remaining: the setup-screen rendering, task 3.8 in
   [home-page-overhaul.md](home-page-overhaul.md).)*
   - `getFlightRecommendations` returns fabricated flight numbers/times —
     relabel "ideal departure windows" (it's genuinely useful circadian
     guidance) or wire a real flight API later. Never present fake flights
     as bookable.
   - Files: `src/domain/nudges.ts` labels + `TripSetupScreen.tsx` heading.

8. **Mobile check-in surface**
   - `MorningCheckin` exists on `/crew`; add a phone-first card on `/` when
     `phase === "done"` and a day is "today": one card, three thumb-sized
     buttons (done / partial / skipped), readiness delta. The daily touch.
   - Files: new `DailyCheckin` card in `NudgeFeedScreen` or standalone;
     reuses `summarizeCheckIn` + `beginStream` checkin path.

## P2 — post-submissions

9. localStorage depth persistence; per-day-keyed `memoryPath` (tool_results
   aren't day-keyed yet — needs a runtime change).
10. Tool-call response cache for Tavily/Qloo/science (bounded TTL map in
    `src/lib/`), token budgets per run, Supabase RLS when a real user
    model lands.
11. Real flight data provider (if the flight advisor graduates from
    "ideal windows" to live options).

## What this plan deliberately does NOT do

- No auth/accounts — the zero-signup funnel is the positioning.
- No paywall — every share link lands inside the product.
- No native app — mobile web card is the app; a wrapper is a P2 decision.
