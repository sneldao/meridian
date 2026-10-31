-- Funnel events: entry → run → handoff → arrival → outcome, once per stage
-- per trip (src/lib/funnel.ts, /api/funnel). The app no-ops honestly when
-- this table is absent, so the migration is additive only.
create table if not exists public.meridian_funnel (
  id bigint generated always as identity primary key,
  stage text not null check (stage in ('entry', 'run', 'handoff', 'arrival', 'outcome')),
  trip text,
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists meridian_funnel_stage_at_idx
  on public.meridian_funnel (stage, at desc);
