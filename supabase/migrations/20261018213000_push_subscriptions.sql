create table public.meridian_push_subscriptions (
  endpoint text primary key,
  feed_id text not null references public.meridian_feeds(id) on delete cascade,
  keys jsonb not null,
  sent jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Server-side access only via service_role key (bypasses RLS).
alter table public.meridian_push_subscriptions enable row level security;
