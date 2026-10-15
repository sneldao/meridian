# Commercial & deployment — the "live product" story

Written pre-freeze for the pitch. Judges reward monetisation; the honest
version is: **the demo is the free tier, the team view is the paid tier.**

---

## 1. Deployment — yes, it should be a live URL

The app already does the hard part: real SSE streams (`maxDuration = 300` on
both run routes), real Google Calendar writes, server-side keys. Two ways to
ship a public URL today:

| Option | Verdict |
|---|---|
| **Vercel** | Zero-config for Next.js, SSE streams fine. Watch `maxDuration`: 300 s needs fluid compute (Hobby historically caps lower) — verify the plan before demoing on it. |
| **Railway / Render / Fly** | Long-lived Node process (`bun run build && bun start`), no timeout ceiling, SSE trivially fine. The boringly safe choice. |

**Recommended shape — two deployments, one repo:**

1. **Public URL (`AGENT_PROVIDER=replay`)** — free, instant, can't burn tokens,
   works if judges open it on their phones. This is the *product surface*:
   route picker, four lenses, check-in beat, `.ics` download. Zero cost per
   visitor.
2. **Stage machine (`AGENT_PROVIDER=anthropic`)** — stays local or private.
   Live tokens, live calendar writes, for the pitch only.

Before the public URL goes up (all config, no code):

- Confirm secrets are server-side only (they are — nothing reaches the
  browser bundle except `NEXT_PUBLIC_AGENT_PROVIDER`).
- The Composio Google connection is one demo account. Public visitors would
  move *that* calendar's events — acceptable if it's a fixture account;
  decide before sharing the link.
- Optional: a password on the live-provider deployment. The replay URL needs
  nothing.
- Custom domain is a 5-minute nicety, not a freeze item.

The pitch line this unlocks: *"It's not a video — the link is live right
now, on your phone."*

## 2. Monetisation

### The funnel

| Tier | Price (hypothesis) | What it is |
|---|---|---|
| **Free** | £0 | One trip. Full crew run, plan, readiness badges, `.ics` import. **The demo is the free tier** — the aha moment is the red badge: "your body thinks it's 06:00 at your pitch." |
| **Traveller** | ~£8–10/trip or ~£12/mo | Unlimited trips, wearable sync, **morning check-ins + replans** (the long-running loop), adherence learning via trip history. Anchored by Timeshifter's proven $9.99/plan, $24.99/yr consumer pricing. |
| **Team** | ~£20–30/seat/mo | The `/team` dashboard — a travel manager watching 12 crews at once. Duty-of-care reporting, fleet readiness, policy compliance. Buyer: travel manager, HR, exec assistant. |

**Ordering for the pitch:** lead B2B (that's where the money and the duty-of-
care mandate live), consumer freemium is top-of-funnel *and* the viral
surface. Don't invert it — Timeshifter's price point proves consumer
willingness-to-pay exists but is thin; the team's engine is what incumbents
don't have.

### Onboarding (< 60 s to first badge)

1. Pick a route on the map — or paste a flight confirmation email (the crew
   extracts the route; already specced as a stretch in §2).
2. Connect Google Calendar (Composio flow exists).
3. Wearable optional: three-question chronotype picker as baseline fallback
   for consumer signups without a Garmin.
4. First run produces the readiness badge — **that number is the product**.

### The engagement loop (already built, just unlabelled)

- **D-3 → landing:** nightly shift run → morning check-in → replan. A daily
  push ("your crew moved tonight's light block") is a notification with a
  reason to exist — not a streak gimmick.
- **Post-trip:** `/outcome` self-report feeds adherence history → the next
  plan starts smarter. Retention = compounding personalisation, and it's
  already the memory architecture (graph memory + `meridian:history`).
- **Recurring travellers:** a flight email landing is the trigger for the
  next run — the loop re-opens itself.

### Viral hooks (all free distribution inside the artifact)

- **The `.ics` is the ad.** Moved meetings land in colleagues' calendars with
  Meridian attribution in the event body. Ambient, zero-effort.
- **Body-clock passport card** — ghost line + shift + before/after readiness
  as a shareable image. "My body thinks it's 06:00 at the board meeting" is
  a post people actually write.
- **Team invites:** the travel manager buys seats → each traveller onboarded
  is a new seat + a new social surface. Classic bottom-up B2B expansion.
- **Badge in shared invites:** "this meeting was moved by Meridian so the
  traveller is actually awake" — the readiness number travels with the
  meeting.

### What to say vs. what to claim

- Say pricing as a **hypothesis** (already the plan's framing); cite
  Timeshifter's real pricing as market proof, GBTA's $1.71 T spend as the
  pool.
- Don't claim billing exists — say the deployed replay URL *is* the free
  tier, live on stage.
- The moat claim is honest: **adherence history per traveller** — incumbents
  ship static plans; Meridian's plans get better every trip because the
  check-in/outcome data is proprietary to the loop.
