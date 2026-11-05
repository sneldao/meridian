"use client";

import { useState } from "react";
import { Check, ChevronDown, Circle, CircleDashed, Loader2, MapPin, RotateCcw, X } from "lucide-react";
import { CrewAvatar, type CrewAvatarState } from "@/components/CrewAvatar";
import type { CrewJob } from "@/lib/crew-jobs";

/* TaskRows (docs/plan/agent-native.md step 5): the crew's jobs as live
 * status rows in the AgentDrawer — "{status icon} {job label} {count/pill}"
 * with expandable detail steps underneath.
 *
 * Rows enter staggered fade-up 80ms apart on drawer open (CSS nth-child,
 * no JS timer). The detail fold is the grid-template-rows 0fr→1fr + opacity
 * pattern; under reduced motion the rows appear settled and the fold snaps
 * instead of animating — expand/collapse still works. Statuses are real:
 * Running only while a stage is in flight, Failed only from real errors.
 */

const AVATAR_STATE: Record<CrewJob["status"], CrewAvatarState> = {
  queued: "resting",
  running: "working",
  completed: "complete",
  failed: "concerned",
};

function StatusIcon({ job }: { job: CrewJob }) {
  switch (job.status) {
    case "running":
      return <Loader2 size={13} className="crew-job-run text-progress" aria-hidden="true" />;
    case "completed":
      return job.source === "preview" ? (
        <CircleDashed size={13} className="text-mist" aria-hidden="true" />
      ) : (
        <Check size={13} className="text-pass" aria-hidden="true" />
      );
    case "failed":
      return <X size={13} className="text-fail" aria-hidden="true" />;
    default:
      return <Circle size={11} className="text-dim" aria-hidden="true" />;
  }
}

function Pill({ job }: { job: CrewJob }) {
  const label =
    job.status === "running"
      ? "Working"
      : job.status === "failed"
        ? "Failed"
        : job.status === "queued"
          ? "Queued"
          : job.source === "preview"
            ? `Preview${job.count ? ` · ${job.count}` : ""}`
            : `Done${job.count ? ` · ${job.count}` : ""}`;
  const tone =
    job.status === "running"
      ? "border-progress/30 bg-progress/10 text-progress"
      : job.status === "failed"
        ? "border-fail/30 bg-fail/10 text-fail"
        : job.status === "queued"
          ? "border-line bg-ink-3/60 text-dim"
          : job.source === "preview"
            ? "border-line bg-ink-3 text-mist"
            : "border-pass/30 bg-pass/10 text-pass";
  return (
    <span
      className={`shrink-0 rounded-md border px-2 py-0.5 font-mono2 text-2xs font-semibold ${tone}`}
    >
      {label}
    </span>
  );
}

export function CrewJobs({
  jobs,
  notes,
  onRetry,
}: {
  jobs: CrewJob[];
  /** Errors the log could not attribute to one job — named plainly. */
  notes: string[];
  onRetry?: () => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="scroll-thin h-full overflow-y-auto pr-1">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="text-2xs font-semibold uppercase tracking-wider text-dim">Jobs</p>
        <p className="font-mono2 text-2xs text-dim">
          {jobs.filter((j) => j.status === "completed").length}/{jobs.length} settled
        </p>
      </div>
      {jobs.some((j) => j.source === "preview" && j.status === "completed") && (
        <p className="mb-2 text-2xs leading-relaxed text-mist">
          Solver numbers — the night shift hasn&#8217;t run.
        </p>
      )}
      {notes.map((n, i) => (
        <p key={i} className="mb-2 rounded-md border border-fail/20 bg-fail/10 px-2.5 py-1.5 text-2xs text-fail">
          {n}
        </p>
      ))}

      <ul className="flex flex-col gap-1.5">
        {jobs.map((job) => {
          const isOpen = open.has(job.id);
          return (
            <li key={job.id} className="crew-job-item">
              <div className="flex items-stretch gap-1">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-line bg-ink-3/40 px-2.5 py-2 text-left transition-colors hover:border-mist/50 hover:bg-ink-3"
                  aria-expanded={isOpen}
                  onClick={() => toggle(job.id)}
                >
                  <span className="flex w-4 shrink-0 items-center justify-center">
                    <StatusIcon job={job} />
                  </span>
                  {job.agent ? (
                    <CrewAvatar id={job.agent} size={20} state={AVATAR_STATE[job.status]} decorative />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center text-mist">
                      <MapPin size={13} aria-hidden="true" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-paper">
                    <span className="font-semibold">{job.owner}</span>
                    <span className="text-mist"> · {job.job}</span>
                  </span>
                  <Pill job={job} />
                  <ChevronDown
                    size={14}
                    className={`crew-job-chev shrink-0 text-dim${isOpen ? " open" : ""}`}
                    aria-hidden="true"
                  />
                </button>
                {job.canRetry && onRetry && (
                  <button
                    type="button"
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-fail/30 bg-fail/10 px-2.5 text-2xs font-semibold text-fail transition-colors hover:bg-fail/20"
                    onClick={onRetry}
                  >
                    <RotateCcw size={11} aria-hidden="true" />
                    Retry
                  </button>
                )}
              </div>
              {/* inert while folded: the 0fr fold hides the steps visually,
                  and this keeps them out of the tab order and the a11y tree
                  to match — a collapsed disclosure shouldn't read its insides. */}
              <div className={`crew-job-detail${isOpen ? " open" : ""}`} inert={!isOpen}>
                <div>
                  <ul className="crew-job-steps px-1.5 pb-1 pt-1.5 font-mono2 text-2xs leading-relaxed">
                    {job.steps.length === 0 && (
                      <li className="text-dim">
                        <span className="mr-1.5 text-dim">├─</span>nothing recorded yet
                      </li>
                    )}
                    {job.steps.map((s, i) => (
                      <li
                        key={i}
                        className={
                          s.tone === "fail" ? "text-fail" : s.tone === "note" ? "text-mist" : "text-paper"
                        }
                      >
                        <span className="mr-1.5 text-dim">├─</span>
                        {s.text}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
