// Morning check-in: the adherence-replan beat, always available once a run
// exists. The trigger stays a compact header button (doesn't disturb the
// "fits one line at 1200px" header), but opens onto a consumer-facing panel —
// Alex's view of "the crew is still on this," not a dev console — where she
// can say what actually happened and when the crew should expect to hear it,
// instead of a scripted check-in firing on click with no say in either.
//
//   <MorningCheckin phase={run.phase} lockedCount={run.locked.size}
//     totalDays={run.trip?.days.length ?? 5} sessionStartedAt={run.sessionStartedAt}
//     onCheckIn={(extra) => beginStream(extra)} />
"use client";

import { useEffect, useRef, useState } from "react";
import { parseCheckInText } from "@/domain/adherence";
import { AnchoredPopover } from "@/components/AnchoredPopover";

interface Props {
  phase: "idle" | "running" | "done";
  /** Nights locked so far, out of the trip — "3 of 5 nights planned." */
  lockedCount: number;
  totalDays: number;
  /** Wall-clock start of this session (survives the night → morning
   *  boundary on the same route) — "on the job 6h 40m." */
  sessionStartedAt?: number;
  onCheckIn: (extra: { checkins: string; startDay: number }) => void;
}

/** ms since sessionStartedAt, as "6h 40m" / "40m" / "just now". */
function sinceLabel(startedAt: number, now: number): string {
  const mins = Math.floor((now - startedAt) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem ? `${hrs}h ${rem}m` : `${hrs}h`;
}

const DEFAULT_NOTE = "couldn't face the 5am light";
const DEFAULT_TIME = "07:10";

export function buildMorningCheckIn(note: string, now = Date.now()): { checkins: string; startDay: number } {
  const checkIn = parseCheckInText({ text: note.trim() || DEFAULT_NOTE, dayIndex: 1 });
  return { checkins: btoa(JSON.stringify([{ ...checkIn, at: now }])), startDay: 2 };
}

export function MorningCheckin({ phase, lockedCount, totalDays, sessionStartedAt, onCheckIn }: Props) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [time, setTime] = useState(DEFAULT_TIME);
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, []);

  // Tick while the panel's open so "on the job" reads live, not stale.
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [open]);

  if (phase === "idle") return null;

  const since = sessionStartedAt ? sinceLabel(sessionStartedAt, now) : null;

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={phase === "running"}
        title="Tell the crew how it went — they'll replan from here"
        className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
          phase === "running"
            ? "cursor-not-allowed border-line text-dim"
            : "border-paper bg-paper text-ink hover:bg-white"
        }`}
      >
        {phase === "running" ? "crew's on it…" : `check in · ${time}`}
      </button>

      {open && phase === "done" && (
        <AnchoredPopover anchorRef={ref}>
          <div className="w-72 rounded-xl border border-line bg-ink-2 p-3 shadow-xl">
            <p className="font-voice text-base leading-snug text-paper">
              Your crew is on it.
            </p>
            <p className="mt-1 text-[12px] text-mist">
              {lockedCount} of {totalDays} nights planned
              {since ? ` · on the job ${since}` : ""}
            </p>
            <p className="mt-2.5 text-[12px] leading-relaxed text-mist">
              Tell them how last night actually went, and they&apos;ll replan
              the rest around it.
            </p>

            <label className="mt-3 block text-[11px] tracking-wide text-dim">
              WHAT HAPPENED
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={DEFAULT_NOTE}
              className="mt-1 w-full rounded-lg border border-line bg-ink px-2.5 py-1.5 text-[12px] text-paper placeholder:text-dim focus:border-mist focus:outline-none"
            />

            <label className="mt-2.5 block text-[11px] tracking-wide text-dim">
              NEXT CHECK-IN
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              title="When the crew should expect to hear from you"
              className="mt-1 w-full rounded-lg border border-line bg-ink px-2.5 py-1.5 text-[12px] text-paper focus:border-mist focus:outline-none"
            />

            <button
              onClick={() => {
                onCheckIn(buildMorningCheckIn(note));
                setOpen(false);
                setNote("");
              }}
              className="mt-3 w-full rounded-lg border border-paper bg-paper px-3 py-2 text-xs font-bold text-ink transition-colors hover:bg-white"
            >
              Check in now
            </button>
          </div>
        </AnchoredPopover>
      )}
    </div>
  );
}
