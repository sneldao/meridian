// Client side of /api/feed. `meridian:feed` = { id, key, tokens } — the key
// lets us update the same feed silently on every new plan; per-surface read
// tokens gate the webcal and assistant links. They never leave the device
// except in their own POST bodies / query params.
const FEED_KEY = "meridian:feed";

export type FeedSurface = "calendar" | "assistant";

export interface FeedRef {
  id: string;
  key: string;
  tokens?: Partial<Record<FeedSurface, string>>;
}

export function getFeedRef(): FeedRef | null {
  try {
    const raw = localStorage.getItem(FEED_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as FeedRef;
    return typeof v?.id === "string" && typeof v?.key === "string" ? v : null;
  } catch {
    return null;
  }
}

function setFeedRef(ref: FeedRef) {
  try {
    localStorage.setItem(FEED_KEY, JSON.stringify(ref));
  } catch {
    /* storage unavailable */
  }
}

/** The read token for a surface, or null for feeds created before tokens
 *  existed (their bare-id links keep working until the next update mints
 *  them). */
export function feedToken(surface: FeedSurface): string | null {
  return getFeedRef()?.tokens?.[surface] ?? null;
}

/** Creates the feed on first call, updates it afterwards. Returns the id. */
export async function upsertFeed(payload: {
  ics: string;
  trip: unknown;
  days: unknown;
}): Promise<string | null> {
  const ref = getFeedRef();
  try {
    const res = await fetch("/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ref ? { ...payload, id: ref.id, key: ref.key } : payload),
    });
    const data = (await res.json().catch(() => null)) as
      | { id?: string; key?: string; tokens?: Partial<Record<FeedSurface, string>> }
      | null;
    if (!res.ok || !data?.id) return null;
    if (data.key || data.tokens) {
      const next = { ...(ref ?? { id: data.id, key: data.key ?? "" }) };
      if (data.key) next.key = data.key;
      next.tokens = { ...(next.tokens ?? {}), ...(data.tokens ?? {}) };
      setFeedRef(next);
    }
    return data.id;
  } catch {
    return null;
  }
}

/** Push the newest ics to an existing feed — fire-and-forget from the run
 *  briefing handler. */
export function syncFeed(payload: { ics: string; trip: unknown; days: unknown }) {
  const ref = getFeedRef();
  if (!ref) return;
  void fetch("/api/feed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, id: ref.id, key: ref.key }),
  }).catch(() => {});
}

/** Rotate one surface's read token — kills links minted with the old one.
 *  Returns the fresh token, or null when there's no feed or the call fails. */
export async function rotateFeedToken(surface: FeedSurface): Promise<string | null> {
  const ref = getFeedRef();
  if (!ref) return null;
  try {
    const res = await fetch("/api/feed/rotate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ref.id, key: ref.key, surface }),
    });
    const data = (await res.json().catch(() => null)) as
      | { tokens?: Partial<Record<FeedSurface, string>> }
      | null;
    const token = res.ok ? data?.tokens?.[surface] : undefined;
    if (!token) return null;
    setFeedRef({ ...ref, tokens: { ...(ref.tokens ?? {}), [surface]: token } });
    return token;
  } catch {
    return null;
  }
}
