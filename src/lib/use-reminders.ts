import { useCallback, useEffect, useState } from "react";
import type { DayPlan, Trip } from "@/domain/types";
import { scheduleReminders, upcomingReminders } from "@/lib/reminders";

const REM_KEY = "meridian:reminders";

export interface ExternalMark {
  id: string;
  status: "done" | "skipped";
  nonce: number;
}

/** Reminder toggle + scheduling + notification-tap marks.
 *
 *  Marks arrive two ways: the service worker postMessages an open window
 *  ("meridian-mark"), or a notification tap opened the app with the mark in
 *  the URL (?mark=&status=). Both land in `externalMark`; `onMarkDay` pans
 *  the day pills to the step's day. The URL params are consumed once and
 *  stripped so a refresh doesn't re-apply the mark.
 *
 *  Scheduling is setTimeout-based: reminders fire only while Meridian is
 *  open — an installed-but-closed app does not run them. */
export function useReminders(opts: {
  trip: Trip | null;
  lockedDays: Map<string, DayPlan>;
  onMarkDay: (dayLabel: string) => void;
}) {
  const { trip, lockedDays, onMarkDay } = opts;
  const [remindersOn, setRemindersOn] = useState(false);
  const [remindersBlocked, setRemindersBlocked] = useState(false);
  const [externalMark, setExternalMark] = useState<ExternalMark | null>(null);

  useEffect(() => {
    // Post-mount: a notification tap lands here with the mark in the URL —
    // apply it, then strip the params so a refresh doesn't re-apply.
    const t = setTimeout(() => {
      try {
        setRemindersOn(localStorage.getItem(REM_KEY) === "on");
      } catch {
        /* storage unavailable */
      }

      const url = new URL(window.location.href);
      const mark = url.searchParams.get("mark");
      const status = url.searchParams.get("status");
      if (mark && (status === "done" || status === "skipped")) {
        onMarkDay(mark.replace(/-[^-]+$/, ""));
        setExternalMark({ id: mark, status, nonce: Date.now() });
        url.searchParams.delete("mark");
        url.searchParams.delete("status");
        window.history.replaceState(null, "", url.toString());
      }
    }, 0);

    const onMessage = (ev: MessageEvent) => {
      const d = ev.data as { type?: string; id?: string; status?: string };
      if (
        d?.type === "meridian-mark" &&
        d.id &&
        (d.status === "done" || d.status === "skipped")
      ) {
        onMarkDay(d.id.replace(/-[^-]+$/, ""));
        setExternalMark({ id: d.id, status: d.status, nonce: Date.now() });
      }
    };
    navigator.serviceWorker?.addEventListener?.("message", onMessage);
    return () => {
      clearTimeout(t);
      navigator.serviceWorker?.removeEventListener?.("message", onMessage);
    };
  }, [onMarkDay]);

  // Next 24h of Done/Skip-able steps, rebuilt whenever the plan or route moves.
  useEffect(() => {
    if (!remindersOn || !trip || lockedDays.size === 0) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted")
      return;
    return scheduleReminders(
      upcomingReminders(trip, [...lockedDays.values()], new Date()),
    );
  }, [remindersOn, trip, lockedDays]);

  const toggleReminders = useCallback(() => {
    if (remindersOn) {
      setRemindersOn(false);
      try {
        localStorage.setItem(REM_KEY, "off");
      } catch {
        /* ignore */
      }
      return;
    }
    if (typeof Notification === "undefined") {
      setRemindersBlocked(true);
      return;
    }
    Notification.requestPermission()
      .then((perm) => {
        if (perm !== "granted") {
          setRemindersBlocked(true);
          return;
        }
        setRemindersBlocked(false);
        setRemindersOn(true);
        try {
          localStorage.setItem(REM_KEY, "on");
        } catch {
          /* ignore */
        }
      })
      .catch(() => setRemindersBlocked(true));
  }, [remindersOn]);

  return { remindersOn, remindersBlocked, externalMark, toggleReminders };
}
