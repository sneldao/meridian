"use client";

import type { FixturePlayback } from "@/state/playback";

// Dev-only transport bar for a recorded run: play/pause, speed, scrub, and
// jump-to-beat buttons for the moments the demo hinges on.
export function FixtureScrubber({ pb }: { pb: FixturePlayback }) {
  const btn = "rounded-md border border-line bg-ink-2 px-2.5 py-1 text-[12px] text-paper hover:border-mist";
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-ink-2/90 px-3 py-2 font-mono2 text-[12px] text-mist backdrop-blur">
      <button className={btn} onClick={pb.toggle}>{pb.playing ? "pause" : "play"}</button>
      <button className={btn} onClick={pb.restart}>restart</button>
      <select
        value={pb.speed}
        onChange={(e) => pb.setSpeed(Number(e.target.value))}
        className="rounded-md border border-line bg-ink-2 px-1.5 py-1 text-paper"
      >
        {[0.25, 0.5, 1, 2, 4].map((s) => <option key={s} value={s}>{s}×</option>)}
      </select>
      <input
        type="range"
        min={0}
        max={pb.duration}
        step={10}
        value={pb.cursor}
        onChange={(e) => pb.seek(Number(e.target.value))}
        className="min-w-48 flex-1 accent-progress"
      />
      <span className="w-24 text-right text-paper">
        {(pb.cursor / 1000).toFixed(1)}s / {(pb.duration / 1000).toFixed(1)}s
      </span>
      <span className="text-line">|</span>
      <button className={btn} onClick={() => pb.seekTo("citation")}>1st citation</button>
      <button className={btn} onClick={() => pb.seekTo("plan_candidate")}>1st draft</button>
      <button className={btn} onClick={() => pb.seekTo("eval_result", 1)}>2nd verdict</button>
      <button className={btn} onClick={() => pb.seekTo("calendar_move")}>1st move</button>
      <button className={btn} onClick={() => pb.seekTo("briefing")}>briefing</button>
      <span className="ml-auto text-[12px]">
        {pb.run.log.length}/{pb.fixture.events.length} events · {pb.run.locked.size} locked · {pb.run.rejections} rejected
      </span>
    </div>
  );
}
