create table public.meridian_events (
  id uuid default gen_random_uuid() primary key,
  kind text not null,
  payload jsonb not null,
  created_at timestamptz default now()
);

-- Server-side access only via service_role key (bypasses RLS).
-- Deny anon/authenticated access by default.
alter table public.meridian_events enable row level security;
