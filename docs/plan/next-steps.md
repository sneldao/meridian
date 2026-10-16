# Next steps — consumer simplification

Captured 2026-10-15 from user feedback: "halfway between a bad mobile app
and a bad web app." Diagnosis + direction below.

## Calacanis lens (researched 2026-10-15 — he may judge/invest $25k via Qloo)

**Why he's nearly the ICP:** frequent-flyer power user (podcasts from
planes, Sydney/SF runs), early Calm investor — $378k into consumer wellness
when "VCs wouldn't fund it." Jet-lag-as-a-product is his lived pain; an
agentic wellness coach is Calm-shaped with a defensible engine underneath.

**What he looks for** (his stated criteria + Founder U ethos):
- Founder-market fit + speed of shipping > idea quality
- Measurable early traction — DAU, WoW growth, "get users" over decks
- Capital efficiency; simple, demo-able product — he asks basic questions
  and watches whether the answer is considered ("Columbo approach")
- Community around the product

**So shape the slice for him:** a 5-second comprehension — "app that
kills jet lag with one instruction at a time" — with the agent depth
available on tap (the dial is our "there's real tech under this" answer).
Calm surface + provable engine = the pitch shape.

## Diagnosis: app-cosplay

The surface borrows mobile-app idioms (bento cards, pill navs, chunky
chips, progress rings, checkbox tasks) without delivering app behavior —
and underuses the web canvas (space, map, route, horizon).

1. **Looks tappable, isn't.** Cards read as buttons, nudges read as tasks —
   a consumer expects to act (timer, done, remind), gets a document.
2. **Hero is decorative.** The terminator panel is pretty but answers
   nothing; it should answer "what do I do next?"
3. **Flight advisor is fabricated.** `getFlightRecommendations` returns
   hardcoded flight times + readiness percents presented as real — a user
   will try to book "Departs 11:20". Wire real data or label "ideal
   windows".
4. **~7 visual species.** Hero/hr/flight/tb/day/chips/drawer — no learned
   rhythm. One card shape, repeated, is the fix.
5. **Two screens where there should be one flow.** Guide / Setup split is
   web-app thinking; consumer model is linear: set trip → see today. Setup
   collapses into a state, not a destination.

## Direction: "the one thing to do now"

Product in one sentence: **tell me your trip; I tell you the one thing to
do now so you land fresh.**

- **Next-action hero** — countdown + one instruction ("outside light in
  1h 42m — leave at 07:05"); terminator arc becomes a thin garnish band.
- **Today = a timeline, not a grid** — single left-rail day view
  (07:05 light · 08:00 run · 13:00 cutoff · 21:45 wind-down), not five
  nudges to triage.
- **The score is the payoff** — arrival-readiness % climbing as nudges
  complete is the dopamine loop; surface it as the live number, not a
  static stat.
- **Mobile = the check-in surface.** Real "app" moment is D+1..D+4:
  one card, one big done/partial/skipped button, readiness moving. The
  planning surface is touched ~twice per trip; optimize the daily touch.
- **Keep the depth dial as-is** — Calm/Guided/Operator + `/crew` is the
  right agent-provenance story; simplification applies to Calm only.

## Order (when resumed)

1. Next-action hero card on `/` (countdown-driven).
2. Collapse Trip Setup into an edit state on the guide surface.
3. Timeline view for the day (replaces nudge grid as default).
4. Readiness % as the live score.
5. Honest flight-advisor fix (real data or "ideal windows" framing).
6. Mobile check-in surface (done/partial/skipped, thumb-sized).
