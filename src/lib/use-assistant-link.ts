import { useCallback, useState } from "react";
import { upsertFeed } from "@/lib/feed";

/** The voice-assistant sheet's link is minted lazily on first open — it needs
 *  a saved plan to upsert a feed, so opening without one shows the sheet's
 *  honest "save a plan first" state instead of a spinner that never ends. */
export function useAssistantLink() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const openSheet = useCallback(async () => {
    setOpen(true);
    if (url || busy) return;
    setBusy(true);
    try {
      const plan = JSON.parse(localStorage.getItem("meridian:lastPlan") || "null");
      const savedTrip = JSON.parse(localStorage.getItem("meridian:lastTrip") || "null");
      const id =
        plan && savedTrip
          ? await upsertFeed({ ics: plan.ics, trip: savedTrip, days: plan.days })
          : null;
      if (id) setUrl(`${location.origin}/api/assistant/next?feed=${id}&format=text`);
    } catch {
      /* leave url null */
    } finally {
      setBusy(false);
    }
  }, [url, busy]);

  const closeSheet = useCallback(() => setOpen(false), []);

  return { open, url, busy, openSheet, closeSheet };
}
