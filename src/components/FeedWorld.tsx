"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { MeridianSkyCanvas } from "@/components/MeridianSkyCanvas";
import type { MeridianSkyRenderer } from "@/lib/meridian-sky-webgl";
import { fmtMin } from "@/domain/circadian";
import {
  ROOMS,
  locate,
  worldAt,
  type RoomCtx,
  type RoomId,
} from "@/domain/feed-scenes";

/* Altitudes (docs/plan/feed-altitudes.md): the feed as rooms in one world.
 *  One sticky canvas carries the painted sky; each <Room> is a
 *  viewport-sized scene whose opaque slab sits on the side it owns, leaving
 *  the rest of the frame to the world. Scroll is the playhead — one
 *  rAF-coalesced listener paints the room's keyframe, and inside a room's
 *  last 35% blends it into the next room's (the reveal). The stage is room
 *  0: `.today-stage-wrap` lives above this component and is measured from
 *  the document so the descent stays continuous with it. When the canvas
 *  can't paint (reduced motion, no GL, context lost) each room falls back
 *  to its own settled CSS sky — same keyframe, same words. */

const ROOM_INDEX = new Map(ROOMS.map((r, i) => [r.id, i]));
const PLAN_I = ROOM_INDEX.get("plan") ?? -1;
/* The altimeter's word per room — where the descent currently reads. */
const ALTI_LABELS: Record<RoomId, string> = {
  stage: "ground",
  now: "right now",
  day: "the day",
  next: "next up",
  plan: "the plan",
  discover: "landed",
};

interface FeedWorldCtxValue {
  ctx: RoomCtx | null;
  live: boolean;
}
const FeedWorldCtx = createContext<FeedWorldCtxValue>({ ctx: null, live: false });

const rgb = (c: [number, number, number]) =>
  `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;

export function Room({
  id,
  mascot,
  children,
}: {
  id: RoomId;
  /** The bounded mascot beat (§5b): a DOM sun-self face seated over the
      room's painted disc — discover only. The pin is sticky inside a
      room-filling overlay so it holds on the viewport-fixed disc while the
      room is located; decorative, aria-hidden, pointer-events none. */
  mascot?: ReactNode;
  children?: ReactNode;
}) {
  const { ctx } = useContext(FeedWorldCtx);
  const i = ROOM_INDEX.get(id) ?? 0;
  const def = ROOMS[i];
  /* The settled frame: the room's own keyframe as a static sky. Hidden
     while GL is live; it is the whole world under reduced motion. */
  const key = ctx ? def.key(ctx) : null;
  const skyStyle = key
    ? ({
        "--rs-top": rgb(key.top),
        "--rs-mid": rgb(key.mid),
        "--rs-hor": rgb(key.hor),
        "--rs-horH": `${key.horizonH * 100}%`,
      } as CSSProperties)
    : undefined;
  return (
    <section className="room" data-room={id} data-side={def.side} data-slab={def.slab}>
      {key && <div className="room-sky" aria-hidden="true" style={skyStyle} />}
      {mascot && (
        <div className="room-mascot" aria-hidden="true">
          <span className="room-mascot-pin">{mascot}</span>
        </div>
      )}
      <div className="slab">{children}</div>
    </section>
  );
}

export function FeedWorld({ ctx, children }: { ctx: RoomCtx | null; children?: ReactNode }) {
  const wrap = useRef<HTMLDivElement>(null);
  const renderer = useRef<MeridianSkyRenderer | null>(null);
  const ctxRef = useRef(ctx);
  const geom = useRef<{ starts: number[]; lengths: number[]; scrollH: number; fwTop: number }>({
    starts: [],
    lengths: [],
    scrollH: -1,
    fwTop: -1,
  });
  const last = useRef<{ i: number; p: number }>({ i: -1, p: -1 });
  const repaint = useRef<(() => void) | null>(null);
  const [live, setLive] = useState(false);
  // The altimeter's room — state, not an attribute, because the chip is DOM.
  const [roomI, setRoomI] = useState(0);
  useEffect(() => {
    ctxRef.current = ctx;
  });

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;

    // Measure the rooms: the stage wrap (document-level, room 0) plus every
    // rendered <Room>, mapped by data-room. Absent rooms get length 0 — the
    // keyframes still hold, locate() just never rests there. Measuring is a
    // forced layout, so it only happens when geometry can have changed:
    // ResizeObserver, load/resize, a scrollHeight change between frames,
    // and once more after the load-time reflow settles.
    const measure = () => {
      const starts: number[] = new Array(ROOMS.length).fill(0);
      const lengths: number[] = new Array(ROOMS.length).fill(0);
      const scrollY = window.scrollY;
      const stage = document.querySelector<HTMLElement>(".today-stage-wrap");
      if (stage) {
        starts[0] = stage.getBoundingClientRect().top + scrollY;
        lengths[0] = stage.offsetHeight;
      }
      el.querySelectorAll<HTMLElement>(".room").forEach((room) => {
        const idx = ROOM_INDEX.get(room.dataset.room as RoomId);
        if (idx === undefined) return;
        starts[idx] = room.getBoundingClientRect().top + scrollY;
        lengths[idx] = room.offsetHeight;
      });
      let prevEnd = starts[0] + lengths[0];
      for (let i = 1; i < ROOMS.length; i++) {
        if (lengths[i] === 0) starts[i] = prevEnd;
        prevEnd = starts[i] + lengths[i];
      }
      geom.current = {
        starts,
        lengths,
        scrollH: document.documentElement.scrollHeight,
        fwTop: el.getBoundingClientRect().top + scrollY,
      };
    };

    const paint = () => {
      if (!el.isConnected) return;
      // Heights can redistribute without scrollHeight moving (a block above
      // the feed unmounts while something inside it grows) — one rect read
      // on the wrapper catches any shift above it; shifts inside are RO's.
      if (
        el.getBoundingClientRect().top + window.scrollY !== geom.current.fwTop ||
        document.documentElement.scrollHeight !== geom.current.scrollH
      ) {
        measure();
      }
      const { starts, lengths } = geom.current;
      const { i, p, t } = locate(window.scrollY, starts, lengths);
      if (i === last.current.i && Math.abs(p - last.current.p) < 1 / 512) return;
      const c = ctxRef.current;
      const r = renderer.current;
      if (i !== last.current.i) {
        // The altitude changed — the altimeter ticks (DOM, so it ticks
        // with or without the canvas) and one scout streaks across to the
        // sun. Input-caused only (scroll located the room); skipped on the
        // first paint so a load doesn't fly anything in.
        if (last.current.i >= 0) r?.streak();
        setRoomI(i);
      }
      last.current = { i, p };
      el.dataset.room = ROOMS[i].id;
      el.style.setProperty("--room-p", p.toFixed(4));
      el.style.setProperty("--room-t", t.toFixed(4));
      if (!c || !r) return;
      const canvas = el.querySelector<HTMLCanvasElement>(".meridian-sky");
      const c2 = { ...c, w: canvas?.clientWidth || c.w || 2, h: canvas?.clientHeight || c.h || 2 };
      const key = worldAt(window.scrollY, starts, lengths, c2);
      // The plan's coverage marker draws itself across the room's first
      // 30% — progress-driven, so nothing animates at rest.
      if (i === PLAN_I && key.arc) key.arc.t *= Math.min(1, p / 0.3);
      r.paint(key);
      r.pan(0, -(i + p) * 0.25);
    };

    repaint.current = paint;
    measure();
    paint();
    const ro = new ResizeObserver(() => {
      measure();
      paint();
    });
    ro.observe(el);
    el.querySelectorAll<HTMLElement>(".room").forEach((room) => ro.observe(room));
    const stage = document.querySelector<HTMLElement>(".today-stage-wrap");
    if (stage) ro.observe(stage);
    window.addEventListener("load", measure);
    window.addEventListener("resize", measure);
    // Late-loading content reflows the room tops without a resize — one
    // re-measure after the storm settles covers it.
    const settle = setTimeout(measure, 1000);

    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        paint();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("load", measure);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", onScroll);
      clearTimeout(settle);
      cancelAnimationFrame(raf);
    };
  }, []);

  // The model ticks (clock, run progress, new plan) repaint the world in
  // place — same demand-draw contract as the stage's canvas.
  useEffect(() => {
    repaint.current?.();
  }, [ctx]);

  return (
    <FeedWorldCtx.Provider value={{ ctx, live }}>
      <div
        className={`feed-world${live ? "" : " feed-world--css"}`}
        ref={wrap}
      >
        {ctx && (
          <MeridianSkyCanvas
            onLive={setLive}
            onRenderer={(r) => {
              renderer.current = r;
              last.current = { i: -1, p: -1 };
            }}
          />
        )}
        {children}
        {ctx && (
          /* The altimeter — last child so its natural spot is the feed's
             foot: sticky-bottom then floats it at the viewport's edge for
             the whole descent and docks it at the end. Redundant with the
             slabs, so aria-hidden. */
          <div className="alti" aria-hidden="true">
            {`0${roomI + 1}/${String(ROOMS.length).padStart(2, "0")} · ${ALTI_LABELS[ROOMS[roomI]?.id ?? "stage"]}`}
            {ctx.nowMin != null ? ` · ${fmtMin(ctx.nowMin)} body` : ""}
          </div>
        )}
      </div>
    </FeedWorldCtx.Provider>
  );
}
