-- Arrival receipts ride the same share store as plan cards: `arrival`
-- carries the post-landing read (claimed vs delivered), either column may
-- be the payload's whole content, so briefing goes nullable.
alter table public.meridian_shares
  alter column briefing drop not null;
alter table public.meridian_shares
  add column if not exists arrival jsonb;

-- Recipient→sender funnel bottom: a share page's "Make your own plan" that
-- ends in a committed trip. Counted from /api/share/{id} POST.
alter table public.meridian_shares
  add column if not exists recipient_count integer not null default 0;

create or replace function public.increment_share_recipient(share_id text)
returns void
language sql
as $$
  update public.meridian_shares
     set recipient_count = recipient_count + 1
   where id = share_id;
$$;
