// Morning check-in: the adherence-replan beat, always available once a run
// exists. Builds the scripted "skipped the 5am light" check-in and replans
// from D-2 onward — the long-running story in one button.
//
//   <MorningCheckin phase={run.phase} onCheckIn={(checkins, startDay) => ...} />
"use client";

interface Props {
  phase: "idle" | "running" | "done";
  onCheckIn: (extra: { checkins: string; startDay: number }) => void;
}

/** The demo check-in: skipped the 05:00 light anchor on D-1, replan from D-2. */
export function buildMorningCheckIn(now = Date.now()): { checkins: string; startDay: number } {
  return {
    checkins: btoa(
      JSON.stringify([
        {
          id: "ci-1",
          dayIndex: 1,
          kind: "light_exposure",
          startMin: 300,
          status: "skipped",
          text: "couldn't face 5am light",
          at: now,
        },
      ]),
    ),
    startDay: 2,
  };
}

export function MorningCheckin({ phase, onCheckIn }: Props) {
  if (phase === "idle") return null;
  return (
    <button
      onClick={() => onCheckIn(buildMorningCheckIn())}
      disabled={phase === "running"}
      title="The wearer skipped the 5am light — replan D-2 onward under the updated adherence profile"
      className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
        phase === "running"
          ? "cursor-not-allowed border-line text-dim"
          : "border-paper bg-paper text-ink hover:bg-white"
      }`}
    >
      Morning check-in · D-2 07:10
    </button>
  );
}
