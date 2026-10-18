// Client side of /api/feed. `meridian:feed` = { id, key } — the key lets us
// update the same feed silently on every new plan; it never leaves the device
// except in the update POST body.
const FEED_KEY = "meridian:feed";

export interface FeedRef {
  id: string;
  key: string;
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
      body: JSON.stringify(ref ? { ...payload, ...ref } : payload),
    });
    const data = (await res.json().catch(() => null)) as
      | { id?: string; key?: string }
      | null;
    if (!res.ok || !data?.id) return null;
    if (data.key) setFeedRef({ id: data.id, key: data.key });
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
    body: JSON.stringify({ ...payload, ...ref }),
  }).catch(() => {});
}
