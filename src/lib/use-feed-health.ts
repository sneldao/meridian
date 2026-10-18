import { useEffect, useState } from "react";

const STALE_KEY = "meridian:feedStale";

/** True once feed syncs have failed enough times in a row that the
 *  traveller's calendar is silently drifting — the UI's cue to say so.
 *  Set by noteFeedResult in src/lib/feed.ts; cleared by the next success. */
export function useFeedStale(): boolean {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setStale(localStorage.getItem(STALE_KEY) === "1");
      } catch {
        /* storage unavailable */
      }
    }, 0);
    const onStale = () => setStale(true);
    window.addEventListener("meridian:feed-stale", onStale);
    return () => {
      clearTimeout(t);
      window.removeEventListener("meridian:feed-stale", onStale);
    };
  }, []);
  return stale;
}
