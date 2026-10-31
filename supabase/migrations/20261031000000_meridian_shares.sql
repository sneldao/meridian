-- Durable share payloads behind /plan/{id}. Supersedes artifacts/share/*.json
-- on hosts with ephemeral disks; src/lib/share.ts falls back to the files
-- when Supabase is unconfigured, so replay mode keeps working.
create table public.meridian_shares (
  id text primary key,
  briefing jsonb not null,
  trip jsonb,
  shared_at timestamptz not null default now(),
  view_count integer not null default 0
);

-- Server-side access only via service_role key (bypasses RLS).
-- Deny anon/authenticated access by default.
alter table public.meridian_shares enable row level security;

-- Atomic view counter for the recipient-facing page. The OG image path
-- deliberately does not call this — crawler unfurls aren't viewers.
create or replace function public.increment_share_view(share_id text)
returns void
language sql
as $$
  update public.meridian_shares
     set view_count = view_count + 1
   where id = share_id;
$$;
