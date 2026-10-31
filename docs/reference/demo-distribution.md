# Demo distribution — the send-a-link path

The demo is a funnel, not a feature tour (pattern studied from
last-human-standing's speed-run). One link, ninety seconds, no account.

## The link

> watch this — https://<host>/demo
>
> 90 seconds: your 07:00 Tokyo meeting is 23:00 body time, and a crew of
> agents moves it. Ends with an honest stamp on the first morning.

Variants: `/demo?s=cedric` (a stage, not a boardroom), `/demo?s=alex`
(taste-first traveller). The landing CTA "Watch the ninety-second example"
points at the same door; `/?demo=1` redirects there too.

The link unfurls with its own preview (`public/og-demo.png` — the real
passport over the stage sky, the stakes line as the hook). Regenerate after
any passport or story change with `bun run scripts/make-og-demo.ts`. The
payoff beat ends with a one-tap share (Web Share API, clipboard fallback) —
the visitor's last action is passing it on.

## The arc (do not reorder)

1. **The stakes** — one moment, two clocks, the gap. Nothing else.
2. **The crew at work** — the plan is solved live in the visitor's browser;
   say so. Canned numbers would poison the trust the payoff needs.
3. **The plan** — arrival day, timed to the minute, in traveller words.
4. **The payoff** — scorecard, then the passport stamped OWED 4.5h: the
   example deliberately does not promise full adjustment, and saying so is
   the pitch. CTAs: "Make it yours" (entry form) and "Wander this trip in
   the app" (`/?example=1`, the full dashboard for the curious).

## Rules

- Every number on a beat traces to `src/domain/demo-beats.ts`; a beat may
  not display a figure that module does not compute.
- The demo never asks for an account, a wearable, or a key.
- Reduced-motion visitors get the same story without the choreography.
- If the solver's example output ever changes, the tests in
  `tests/demo-beats.test.ts` fail first — fix the story deliberately, not
  accidentally.
