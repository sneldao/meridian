create table public.meridian_feeds (
  id text primary key,
  key_hash text not null,
  ics text not null,
  trip jsonb not null,
  days jsonb not null,
  updated_at timestamptz default now()
);

-- Server-side access only via service_role key (bypasses RLS).
-- Deny anon/authenticated access by default.
alter table public.meridian_feeds enable row level security;
