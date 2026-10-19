alter table public.meridian_feeds
  add column if not exists tokens jsonb;

-- tokens is a map of surface name ("calendar", "assistant") → sha256 hex of
-- the read token. Raw tokens are only ever returned to the write-key holder;
-- readers present ?t= and we compare hashes in constant time.
