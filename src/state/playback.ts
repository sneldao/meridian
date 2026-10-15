// Play a recorded run (fixture) through the same reducer the live stream uses.
// Lenses can be built, scrubbed and screen-recorded with no pipeline running.
//
//   const pb = useFixturePlayback();          // default fixture, 1x
//   <ShiftBoard drafts={pb.run.drafts} ... /> <FixtureScrubber pb={pb} />
//
// Re-record: `bun scripts/record-fixture.ts LHR HND 2026-10-18`.

"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { CrewEvent } from "@/domain/types";
import defaultFixture from "./fixture-events.json";
import { initialRunState, reduceRun, type StampedEvent } from "./run";

export interface Fixture {
  route: string;
  date: string;
  recordedAt: string;
  events: StampedEvent[];
}

export const DEFAULT_FIXTURE = defaultFixture as unknown as Fixture;

export function useFixturePlayback(opts: { fixture?: Fixture; speed?: number; autoplay?: boolean } = {}) {
  const fixture = opts.fixture ?? DEFAULT_FIXTURE;
  const events = fixture.events;
  const duration = events.length ? events[events.length - 1].t : 0;

  const [run, send] = useReducer(reduceRun, undefined, initialRunState);
  const [cursor, setCursor] = useState(0); // ms into the fixture
  const [playing, setPlaying] = useState(opts.autoplay ?? false);
  const [speed, setSpeed] = useState(opts.speed ?? 1);
  const applied = useRef(0); // number of events already dispatched

  // Advance the cursor while playing.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) * speed;
      last = now;
      setCursor((c) => {
        const next = Math.min(duration, c + dt);
        if (next >= duration) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, duration]);

  // Dispatch every event whose timestamp the cursor has passed.
  useEffect(() => {
    let i = applied.current;
    const batch: StampedEvent[] = [];
    while (i < events.length && events[i].t <= cursor) batch.push(events[i++]);
    if (batch.length) {
      applied.current = i;
      send({ kind: "batch", items: batch });
    }
  }, [cursor, events]);

  const seek = useCallback(
    (t: number) => {
      const target = Math.max(0, Math.min(duration, t));
      const upTo = events.filter((e) => e.t <= target);
      send({ kind: "reset" });
      send({ kind: "batch", items: upTo });
      applied.current = upTo.length;
      setCursor(target);
    },
    [events, duration],
  );

  /** Jump to just after the n-th event of a given type (e.g. the first rejection). */
  const seekTo = useCallback(
    (type: CrewEvent["type"], nth = 0) => {
      const hits = events.filter((e) => e.event.type === type);
      const hit = hits[Math.min(nth, hits.length - 1)];
      if (hit) seek(hit.t);
    },
    [events, seek],
  );

  const restart = useCallback(() => {
    seek(0);
    setPlaying(true);
  }, [seek]);

  return {
    run,
    cursor,
    duration,
    playing,
    speed,
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying((p) => !p),
    setSpeed,
    seek,
    seekTo,
    restart,
    fixture,
  };
}

export type FixturePlayback = ReturnType<typeof useFixturePlayback>;
