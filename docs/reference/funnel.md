# The funnel — stages, storage, and how to read it

Round 17 made the journey measurable; round 22 made it readable. The
funnel is a metric, never a dependency: writes are fire-and-forget, reads
are locked behind a key, and neither may ever block or re-render the UI.

## Stages (the locked vocabulary)

| Stage     | Fired when                                            | Trip key        |
| --------- | ----------------------------------------------------- | --------------- |
| `entry`   | a route is committed (setup → trip)                   | `LHR-SIN-2026…` |
| `run`     | a crew run locks its first day                        | same            |
| `handoff` | the plan hands off (traveller takes it to the air)    | same            |
| `arrival` | the arrival read is opened on the morning after       | same            |
| `outcome` | the day-after knock is answered                       | same            |

One event per stage per trip (client-side dedupe in `src/lib/funnel.ts`,
localStorage ring + fire-and-forget POST).

## Storage

`meridian_funnel` (Supabase, migration `20261101000000_meridian_funnel.sql`):

```sql
stage text not null,       -- the locked vocabulary above
trip  text,                -- route key; null only before a route exists
at    timestamptz not null default now()
```

## Reading

### The endpoint

```
GET /api/funnel/summary?key=***        (or header x-funnel-key)
GET /api/funnel/summary?key=***&days=7 (window 1–90, default 30)
```

- **No `FUNNEL_SUMMARY_KEY` in the environment → 403, always.** The funnel
  is a product metric, not a public surface; an unset key locks it rather
  than opening it.
- Without Supabase the endpoint answers honestly: `{ configured: false }`
  with an empty summary — it never pretends there is data.
- Response: per-stage event/trip counts, trip-level conversion between
  consecutive stages (`0` = reached the earlier stage and stopped, `null`
  = no trips at the earlier stage, no signal), and a trailing-week pulse.

### Quick SQL (Supabase dashboard)

```sql
-- Reach by stage, last 30 days
select stage, count(*) events, count(distinct trip) trips
from meridian_funnel
where at > now() - interval '30 days'
group by stage order by min(at);

-- Where journeys die: trips seen at each stage
with s as (
  select distinct trip, stage from meridian_funnel
  where trip is not null and at > now() - interval '30 days'
)
select stage, count(*) trips from s group by stage;

-- Daily pulse
select date_trunc('day', at) day, stage, count(*)
from meridian_funnel
where at > now() - interval '14 days'
group by 1, 2 order by 1 desc;
```

## What the numbers are for

- `entry->run` measures whether the crew earns trust on first contact.
- `arrival->outcome` measures whether the payoff loop closes — the knock
  only exists where a feed does, so a low number says the morning-after
  surface isn't being reached.
- Do not optimise a stage you cannot watch for a week: the pulse exists
  so changes are judged by cohorts, not anecdotes.
