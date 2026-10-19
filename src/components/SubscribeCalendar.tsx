"use client";

import { useState } from "react";
import { feedToken, upsertFeed } from "@/lib/feed";

/** "Subscribe in my calendar" — creates (or refreshes) the plan's webcal feed,
 *  then surfaces the link plus a copy button. */
export function SubscribeCalendar({
  ics,
  trip,
  days,
  className,
}: {
  ics: string;
  trip: unknown;
  days: unknown;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "busy" | "ready" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const go = async () => {
    setState("busy");
    const id = await upsertFeed({ ics, trip, days });
    if (!id) {
      setState("error");
      return;
    }
    const t = feedToken("calendar");
    setUrl(
      `webcal://${location.host}/api/feed/${id}/calendar.ics${t ? `?t=${t}` : ""}`,
    );
    setState("ready");
  };

  if (state === "ready" && url) {
    return (
      <span className="inline-flex flex-col gap-1">
        <span className="inline-flex items-center gap-2">
          <a href={url} className={className}>
            Subscribe in my calendar
          </a>
          <button
            type="button"
            className={className}
            onClick={() => {
              void navigator.clipboard?.writeText(url.replace(/^webcal:/, "https:"));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
        </span>
        <span className="text-xs text-mist">
          Your calendar app checks for updates every few hours.
        </span>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button type="button" className={className} onClick={go} disabled={state === "busy"}>
        {state === "busy" ? "Making link…" : "Subscribe in my calendar"}
      </button>
      {state === "error" && (
        <span className="text-xs text-mist">Couldn&apos;t make a link — try again.</span>
      )}
    </span>
  );
}
