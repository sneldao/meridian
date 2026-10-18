import { useCallback, useState } from "react";
import { feedToken, getFeedRef, rotateFeedToken, upsertFeed } from "@/lib/feed";

function assistantUrl(id: string): string {
  const t = feedToken("assistant");
  return `${location.origin}/api/assistant/next?feed=${id}&format=text${t ? `&t=${t}` : ""}`;
}

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
      if (id) setUrl(assistantUrl(id));
    } catch {
      /* leave url null */
    } finally {
      setBusy(false);
    }
  }, [url, busy]);

  const closeSheet = useCallback(() => setOpen(false), []);

  /** Kill the link currently shown and mint a fresh one — for when it was
   *  shared somewhere it shouldn't have been. */
  const resetLink = useCallback(async () => {
    const token = await rotateFeedToken("assistant");
    const id = getFeedRef()?.id;
    if (token && id) {
      setUrl(`${location.origin}/api/assistant/next?feed=${id}&format=text&t=${token}`);
    }
  }, []);

  return { open, url, busy, openSheet, closeSheet, resetLink };
}
