"use client";

import { useState } from "react";
import type { RunState } from "@/state/run";

/** A screen-reader voice for the longest operation in the app. The only other
 *  aria-live region in the codebase renders inside the AgentDrawer, which is
 *  closed by default — so a blind traveller currently hears silence through
 *  the whole run. This diffs run state into one-sentence announcements and
 *  renders nothing visible. Mount once anywhere `run` reaches. */

function announce(prev: RunState | null, run: RunState): string {
  const parts: string[] = [];
  const total = run.trip?.days.length ?? 0;
  if (run.phase !== prev?.phase) {
    if (run.phase === "running") parts.push("Crew planning started. This takes about a minute.");
    if (run.phase === "done") parts.push("Crew finished planning.");
  }
  if (prev && run.locked.size > prev.locked.size) {
    parts.push(`Day locked — ${run.locked.size} of ${total} planned.`);
  }
  if (prev && run.rejected.size > prev.rejected.size) {
    parts.push("A day was rejected and is being redrafted.");
  }
  if (prev && run.replans.length > prev.replans.length) {
    parts.push("Replanning around your check-in.");
  }
  if (run.approval && !prev?.approval) {
    parts.push("Calendar changes need your approval.");
  }
  if (run.approvalResult && prev?.approvalResult !== run.approvalResult) {
    parts.push(run.approvalResult.message);
  }
  if (prev && run.errors.length > prev.errors.length) {
    parts.push(`Error: ${run.errors[run.errors.length - 1]?.message ?? "stream interrupted"}`);
  }
  if (run.briefing && !prev?.briefing) parts.push("Plan ready — the briefing is on screen.");
  return parts.join(" ");
}

export function RunAnnouncer({ run }: { run: RunState }) {
  const [prev, setPrev] = useState<RunState | null>(null);
  const [message, setMessage] = useState("");
  // Derive announcements from prop changes — the docs-sanctioned alternative
  // to a setState-inside-effect cascade.
  if (run !== prev) {
    const m = announce(prev, run);
    setPrev(run);
    if (m) setMessage(m);
  }
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}
