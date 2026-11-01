"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { animate, useMotionValue, useSpring, useVelocity } from "framer-motion";
import { leanFor, smearFor, snapTarget } from "@/domain/momentum";
import { fmtMin } from "@/domain/circadian";
import { sceneSolar, type DaySceneModel, type SceneWindow } from "@/domain/day-scene";
import { laneRows, readInteractiveDay, type DaySelection } from "@/domain/interactive-day";
import type { BlockReason, Editable, MoveVerdict, UndoToken } from "@/domain/plan-edit";
import { stageSky, stageSkyVars, STAGE_SKY_VARS } from "@/domain/stage-sky";
import { stageSunFor } from "@/domain/stage-sun";
import { sunSelfRead } from "@/domain/sun-self";
import { CrewAvatar, type CrewAvatarState } from "@/components/CrewAvatar";
import { LightWindowPanel } from "@/components/LightWindowPanel";
import { StageSun } from "@/components/StageSun";
import { useUndoToast } from "@/components/UndoToast";
import type { PlanEditApi } from "@/lib/use-plan-edit";

/* The interactive day (round 31) — the one place a visitor can touch the
 * plan's mechanics directly. Exploration reads the scene and never writes;
 * edit mode (the `edit` prop, milestone 4) lets the traveller propose a new
 * time for a light window, checked by the real gate over the whole trip,
 * then apply / cancel / undo. The plan on screen is always the store's last
 * saved version — a proposal is a ghost until the gate and the store agree.
 *
 *  Three distinct reads: the lead says what matters now, the crew say why,
 *  the panel states the facts. All positions ride registered custom
 *  properties — direct tracking while dragging, glide on release. */

export interface InteractiveDayProps {
  scene: DaySceneModel;
  /** |trip.requiredShiftMin| — the total shift the route carries. */
  requiredMin: number;
  /** The trip's direction for the traveller face; falls back to inferring
   *  from the body offset when absent. */
  direction?: "east" | "west";
  /** Edit session from usePlanEdit — presence turns on proposal mode. */
  edit?: PlanEditApi;
  initialMinute?: number;
  /** Rendered after the read panel (the DayScene children slot). */
  children?: ReactNode;
  /** When set, windows show this as their not-editable reason (e.g. a crew
   *  run in flight) — edit affordances hidden behind one honest line. */
  editBlockReason?: string;
  /** The scene's moment lives on another day — jump there (DayScene's
   *  "Jump to event day" affordance). */
  onJumpToMomentDay?: () => void;
  /** DayScene's honesty flags — the details panel stamps preview/example
   *  plans accordingly. */
  preview?: boolean;
  example?: boolean;
  /** "settle" (default) is today's behaviour; "momentum" carries velocity —
   *  trail, smear, coast, settle. Reduced motion renders it as settle. */
  motionMode?: "settle" | "momentum";
}

const LANES = [
  { kind: "seek" as const, name: "Seek light" },
  { kind: "reduce" as const, name: "Reduce light" },
  { kind: "sleep" as const, name: "Sleep" },
];

/** Smallest lane-button footprint in px — a 5-char mono label plus its
 *  padding, never below the 44px hit target. */
const MIN_WINDOW_PX = 60;
/** Lane-button height — the 44px hit target plus the row gap. */
const WINDOW_ROW_PX = 48;

const snap5 = (m: number) => Math.round(m / 5) * 5;

type EditOutcome =
  | { kind: "stale" }
  | { kind: "failed" }
  | { kind: "refused"; reason: string }
  | null;

/** Scene windows that map 1:1 onto their plan's intervention minutes. */
function mappable(w: SceneWindow): Editable | null {
  if (w.fromEarlierDay || w.continuesBefore || w.continuesAfter) {
    return {
      editable: false,
      reason: "This window crosses the day edge — only windows inside the day can move.",
    };
  }
  return null;
}

export function InteractiveDay({ scene, requiredMin, direction, edit, initialMinute, children, editBlockReason, onJumpToMomentDay, preview, example, motionMode = "settle" }: InteractiveDayProps) {
  const firstMinute = scene.momentDayIndex === scene.dayIndex && scene.moment
    ? scene.moment.localMin
    : scene.windows.find((w) => w.kind === "seek")?.startMin ?? 720;
  const [sel, setSel] = useState<DaySelection>({
    type: "time",
    minute: Math.max(0, Math.min(1439, Math.round(initialMinute ?? firstMinute))),
  });
  const [dragging, setDragging] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [trackPx, setTrackPx] = useState(560);

  // Edit session — null is the Exploring state. `proposal` is the proposed
  // startMin while Editing; `outcome` is a terminal result to show.
  const [proposal, setProposal] = useState<{ window: SceneWindow; startMin: number } | null>(null);
  const [propDragging, setPropDragging] = useState(false);
  const [outcome, setOutcome] = useState<EditOutcome>(null);
  const [appliedNote, setAppliedNote] = useState<string | null>(null);
  // The traveller sun's one-shot answer to the edit's outcome: "cheer" is a
  // squash-and-flare when the gate applies, "shy" a small recoil when it
  // refuses. `n` keys the remount so each outcome replays once, never loops.
  const [sunFx, setSunFx] = useState<{ kind: "cheer" | "shy"; n: number } | null>(null);
  const { toast, show: showToast } = useUndoToast();
  // The toast's undo callback fires after re-renders — it must call the
  // CURRENT api (post-apply plans + version), not the apply-time closure.
  const editRef = useRef<PlanEditApi | undefined>(edit);
  useEffect(() => {
    editRef.current = edit;
  });

  const read = readInteractiveDay(scene, sel);
  const solar = useMemo(
    () => sceneSolar(scene.city, scene.date, read.minute),
    [scene, read.minute],
  );
  const sun = stageSunFor(solar?.altitude ?? null, read.minute / 1440, solar?.label ?? null);
  const gaze = (read.minute / 1439) * 2 - 1;

  // The traveller's face — computed from the same numbers the read carries:
  // still-owed is |bodyOffsetMin|, banked is the rest of the required shift.
  const owed = Math.abs(Math.round(scene.bodyOffsetMin));
  const face = sunSelfRead({
    owedMin: owed,
    deliveredMin: Math.max(0, Math.round(requiredMin) - owed),
    requiredMin: Math.max(1, Math.round(requiredMin)),
    direction: direction ?? (scene.bodyOffsetMin <= 0 ? "east" : "west"),
  });

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  const momentum = motionMode === "momentum" && !reduceMotion;

  // Momentum values — pointer-minute and the sun's trailing spring. React
  // state only sees the quantised 5-min value; continuous motion stays on
  // motion values and lands in the DOM as CSS custom properties.
  const minuteMV = useMotionValue(read.minute);
  const scrubActive = useRef(false);
  const sunSpring = useSpring(minuteMV, { stiffness: 260, damping: 22, mass: 0.9 });
  const sunVel = useVelocity(sunSpring);
  const propMV = useMotionValue(0);
  const propVel = useVelocity(propMV);
  const lastValidStart = useRef<number | null>(null);

  // The lane-button footprint in minutes follows the measured track width
  // (px → minutes), so sub-row stacking matches what is on screen.
  const minSpanMin = Math.max(20, (MIN_WINDOW_PX / Math.max(1, trackPx)) * 1440);

  const rootRef = useRef<HTMLElement>(null);
  const skyRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const propRef = useRef<HTMLButtonElement | null>(null);
  const dragState = useRef<{ track: HTMLDivElement; durMin: number } | null>(null);

  // Sky band: modeled gradient + sun position, written as registered custom
  // properties so the release glide animates without touching layout props.
  useEffect(() => {
    const el = skyRef.current;
    if (!el) return;
    const vars = stageSkyVars(stageSky(solar?.altitude ?? -12, 0, 1)) as Record<string, string>;
    for (const name of STAGE_SKY_VARS) el.style.setProperty(name, vars[name]);
    el.style.setProperty("--iday-sun-x", `${(sun.x * 100).toFixed(2)}%`);
    el.style.setProperty("--iday-sun-y", `${(sun.y * 100).toFixed(2)}%`);
    return () => {
      for (const name of [...STAGE_SKY_VARS, "--iday-sun-x", "--iday-sun-y"]) el.style.removeProperty(name);
    };
  }, [solar?.altitude, sun.x, sun.y]);

  // Momentum: the cursor spring follows the minute the user has quantised to.
  useEffect(() => {
    if (!momentum || scrubActive.current) return;
    if (Math.abs(minuteMV.get() - read.minute) > 0.5) {
      animate(minuteMV, read.minute, { type: "spring", stiffness: 260, damping: 22, mass: 0.9 });
    }
  }, [momentum, read.minute, minuteMV]);

  // Sky position + smear: springs write CSS vars on the band directly —
  // the sun trails the pointer and the tail stretches with speed.
  useEffect(() => {
    if (!momentum) return;
    const el = skyRef.current;
    if (!el) return;
    const unsubX = sunSpring.on("change", (v) => {
      const frac = Math.max(0, Math.min(1, v / 1440));
      const sol = sceneSolar(scene.city, scene.date, v);
      const sm = stageSunFor(sol?.altitude ?? null, frac, sol?.label ?? null);
      el.style.setProperty("--iday-sun-x", `${(sm.x * 100).toFixed(2)}%`);
      el.style.setProperty("--iday-sun-y", `${(sm.y * 100).toFixed(2)}%`);
    });
    // Selection commits come from the hand (minuteMV), not the trailing
    // spring — and only while a scrub or its coast is live, so a window
    // selection or a ±15 step is never overwritten.
    const unsubM = minuteMV.on("change", (v) => {
      if (!scrubActive.current) return;
      const q = snap5(v);
      setSel((prev) => (prev.type === "time" && prev.minute === q ? prev : { type: "time", minute: q }));
    });
    const unsubV = sunVel.on("change", (v) => {
      const sm = smearFor(v);
      el.style.setProperty("--smear-l", `${sm.length.toFixed(1)}px`);
      el.style.setProperty("--smear-sa", sm.scaleAlong.toFixed(4));
      el.style.setProperty("--smear-sc", sm.scaleAcross.toFixed(4));
      el.style.setProperty("--smear-g1", sm.ghostOpacity[0].toFixed(3));
      el.style.setProperty("--smear-g2", sm.ghostOpacity[1].toFixed(3));
      el.style.setProperty("--smear-g3", sm.ghostOpacity[2].toFixed(3));
      el.style.setProperty("--smear-v", String(Math.sign(v)));
      // Secondary motion for the characters — one normalised velocity,
      // written on the section root so the crew (siblings of the sky) can
      // inherit it.
      const root = rootRef.current;
      if (root) {
        const nv = Math.max(-1, Math.min(1, v / 900));
        root.style.setProperty("--av-v", nv.toFixed(3));
        root.style.setProperty("--av-gaze", (nv * 0.6).toFixed(3));
      }
    });
    return () => { unsubX(); unsubV(); unsubM(); };
  }, [momentum, sunSpring, sunVel, minuteMV, scene]);

  // The timeline's fixed furniture: the cursor and the moment marker.
  useEffect(() => {
    const el = tlRef.current;
    if (!el) return;
    el.style.setProperty("--iday-cursor-x", `${((read.minute / 1439) * 100).toFixed(2)}%`);
    const m = scene.momentDayIndex === scene.dayIndex ? scene.moment : null;
    if (m) el.style.setProperty("--iday-moment-x", `${((m.localMin / 1439) * 100).toFixed(2)}%`);
  }, [read.minute, scene]);

  // Measure the lane track so the min-width footprint converts to minutes.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => setTrackPx(el.clientWidth || 560);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The proposed block's position rides the same vars as lane windows.
  // Momentum: the var follows a motion value the spring writes; the disc
  // leans with velocity and trails a smear.
  useEffect(() => {
    const el = propRef.current;
    if (!el || !proposal) return;
    const dur = proposal.window.endMin - proposal.window.startMin;
    const span = Math.max(dur, minSpanMin);
    const start = Math.min(Math.max(0, proposal.startMin), 1440 - span);
    el.style.setProperty("--w-l", `${((start / 1440) * 100).toFixed(2)}%`);
    el.style.setProperty("--w-w", `${((span / 1440) * 100).toFixed(2)}%`);
    el.style.setProperty("--w-t", "0px");
  }, [proposal, minSpanMin, momentum]);

  // Pointer scrub on the axis strip — momentum only. The minute rides the
  // pointer exactly; on release a coast + snap. Horizontal intent only, so
  // vertical page scroll is never stolen.
  const scrubIntent = useRef<{ x0: number; on: boolean } | null>(null);
  const axisMinute = (el: HTMLDivElement, clientX: number) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(1439, ((clientX - r.left) / r.width) * 1440));
  };
  const onAxisPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!momentum) return;
    scrubIntent.current = { x0: e.clientX, on: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onAxisPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const it = scrubIntent.current;
    if (!it || !momentum) return;
    if (!it.on && Math.abs(e.clientX - it.x0) < 8) return;
    it.on = true;
    scrubActive.current = true;
    minuteMV.set(axisMinute(e.currentTarget, e.clientX));
  };
  const onAxisPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const it = scrubIntent.current;
    scrubIntent.current = null;
    if (!it?.on || !momentum) return;
    const v = sunVel.get();
    const edges = scene.windows.flatMap((w) => [w.startMin, w.endMin]);
    animate(minuteMV, axisMinute(e.currentTarget, e.clientX), {
      type: "inertia",
      velocity: v,
      power: 0.35,
      timeConstant: 320,
      modifyTarget: (m) => snapTarget(m, edges),
      onComplete: () => {
        scrubActive.current = false;
        const q = snap5(minuteMV.get());
        setSel({ type: "time", minute: q });
      },
    });
    setAnnounce(`${scene.city.name} ${fmtMin(snap5(minuteMV.get()))}`);
  };

  // Ambient sky drift — pauses off-screen or on a hidden tab.
  const [ambOn, setAmbOn] = useState(true);
  useEffect(() => {
    if (!momentum) return;
    const el = skyRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([en]) => setAmbOn(en.isIntersecting && !document.hidden));
    io.observe(el);
    const vis = () => setAmbOn(!document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => { io.disconnect(); document.removeEventListener("visibilitychange", vis); };
  }, [momentum]);

  const setTrackRef = (el: HTMLDivElement | null) => {
    if (el && !trackRef.current) trackRef.current = el;
  };

  const setTrackVars = (rowCount: number) => (el: HTMLDivElement | null) => {
    setTrackRef(el);
    if (el) el.style.setProperty("--rows", String(rowCount));
  };

  const setWindowVars = (w: SceneWindow, row: number) => (el: HTMLButtonElement | null) => {
    if (!el) return;
    const span = Math.max(w.endMin - w.startMin, minSpanMin);
    const start = Math.min(w.startMin, 1440 - span);
    el.style.setProperty("--w-l", `${((start / 1440) * 100).toFixed(2)}%`);
    el.style.setProperty("--w-w", `${((span / 1440) * 100).toFixed(2)}%`);
    el.style.setProperty("--w-t", `${row * WINDOW_ROW_PX}px`);
  };

  const selectTime = (minute: number, speak: boolean) => {
    const m = Math.max(0, Math.min(1439, Math.round(minute)));
    setSel({ type: "time", minute: m });
    if (speak) setAnnounce(`${scene.city.name} ${fmtMin(m)}`);
  };

  const selectWindow = (windowId: string) => {
    setSel({ type: "window", windowId });
    const w = scene.windows.find((x) => x.id === windowId);
    if (w) {
      setAnnounce(`${w.label} ${fmtMin(w.startMin)} selected`);
      if (momentum && !scrubActive.current) {
        animate(minuteMV, w.startMin, { type: "spring", stiffness: 260, damping: 22, mass: 0.9 });
      }
    }
  };

  // --- Edit session -------------------------------------------------------

  const windowEditable = (w: SceneWindow): Editable =>
    editBlockReason
      ? { editable: false, reason: editBlockReason }
      : mappable(w) ?? (edit ? edit.editable(w.id) : { editable: false, reason: "Moving windows isn't available here." });

  // Live verdict — recomputed on every proposal change (it's microseconds).
  const verdict: MoveVerdict | null =
    proposal && edit ? edit.check(proposal.window.id, proposal.startMin) : null;
  const blocked = verdict?.status === "blocked";
  const firstReason: BlockReason | null = blocked ? verdict.reasons[0] ?? null : null;


  const propStart = proposal ? snap5(proposal.startMin) : 0;
  const propDur = proposal ? proposal.window.endMin - proposal.window.startMin : 0;
  const propEnd = propStart + propDur;

  // Track the last start the gate called valid — a blocked release springs
  // back to it instead of the original.
  useEffect(() => {
    if (!proposal) { lastValidStart.current = null; return; }
    if (verdict?.status === "valid") lastValidStart.current = snap5(proposal.startMin);
    else if (lastValidStart.current === null) lastValidStart.current = proposal.window.startMin;
  });

  // Momentum: block x rides propMV; release coasts then snaps to 5-min; a
  // blocked verdict springs back to the last valid start.
  useEffect(() => {
    if (!momentum || !proposal) return;
    const unsub = propMV.on("change", (v) => {
      const el = propRef.current;
      if (!el) return;
      const q = Math.round(v);
      setProposal((prev) => (prev && prev.startMin === q ? prev : prev ? { ...prev, startMin: q } : prev));
    });
    const unsubL = propVel.on("change", (v) => {
      const el = propRef.current;
      if (!el) return;
      el.style.setProperty("--prop-lean", `${leanFor(v).toFixed(2)}deg`);
      const sm = smearFor(v);
      el.style.setProperty("--prop-smear", `${sm.length.toFixed(1)}px`);
      el.style.setProperty("--prop-sa", sm.scaleAlong.toFixed(4));
      el.style.setProperty("--prop-sc", sm.scaleAcross.toFixed(4));
    });
    return () => { unsub(); unsubL(); };
  }, [momentum, proposal, propMV, propVel, minSpanMin]);

  useEffect(() => {
    if (!momentum || !proposal) return;
    if (propDragging) return; // pointer drives it
    propMV.set(snap5(proposal.startMin)); // keyboard path follows the spring
  }, [momentum, proposal, propDragging, propMV]);


  const announceVerdict = (v: MoveVerdict | null) => {
    if (!v) return;
    setAnnounce(
      v.status === "valid" ? "Checks out" : v.status === "blocked" ? v.reasons[0]?.message ?? "Blocked" : "The plan changed",
    );
  };

  const moveProposal = (startMin: number, speak: boolean) => {
    if (!proposal) return;
    setProposal({ ...proposal, startMin: Math.round(startMin) });
    if (speak && edit) announceVerdict(edit.check(proposal.window.id, startMin));
  };

  const cancelEdit = () => {
    setProposal(null);
    setOutcome(null);
    setAnnounce("Proposal cancelled");
  };

  const applyEdit = () => {
    if (!proposal || !edit) return;
    const res = edit.apply(proposal.window.id, propStart);
    if (res.status === "applied") {
      const w = proposal.window;
      const token: UndoToken = res.token;
      setProposal(null);
      setOutcome(null);
      setSunFx((f) => ({ kind: "cheer", n: (f?.n ?? 0) + 1 }));
      setAppliedNote(null);
      setAppliedNote(
        res.sync === "synced"
          ? "Applied — your calendar subscription and reminders will update."
          : res.sync === "no-calendar"
            ? "Applied — calendar subscription and reminders update next time the crew runs."
            : "Applied.",
      );
      setAnnounce(`Moved ${w.label} to ${fmtMin(propStart)}`);
      showToast(`Moved ${w.label} to ${fmtMin(propStart)}`, () => {
        const api = editRef.current;
        if (!api) return;
        const u = api.undo(token);
        setAnnounce(u.status === "undone" ? `${w.label} restored to ${fmtMin(token.previous.startMin)}` : `Undo failed — ${"reason" in u ? u.reason : u.status}`);
        setOutcome(u.status === "undone" ? null : u.status === "refused" ? { kind: "refused", reason: u.reason } : { kind: u.status });
      });
    } else if (res.status === "stale") setOutcome({ kind: "stale" });
    else if (res.status === "failed") setOutcome({ kind: "failed" });
    else {
      setOutcome({ kind: "refused", reason: res.reasons[0]?.message ?? "Blocked" });
      setSunFx((f) => ({ kind: "shy", n: (f?.n ?? 0) + 1 }));
    }
  };

  // Pointer drag on the proposed block — direct tracking, snap on release.
  const onPropPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!proposal) return;
    const track = (e.currentTarget.closest(".iday-track") as HTMLDivElement | null);
    if (!track) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { track, durMin: propDur };
    setPropDragging(true);
  };
  const onPropPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragState.current;
    if (!d || !proposal) return;
    const r = d.track.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const start = frac * 1440 - d.durMin / 2;
    if (momentum) propMV.set(start);
    setProposal({ ...proposal, startMin: Math.round(start) });
  };
  const onPropPointerUp = () => {
    if (!dragState.current || !proposal) return;
    dragState.current = null;
    setPropDragging(false);
    const snapped = snap5(proposal.startMin);
    if (momentum) {
      const v = propVel.get();
      const settle = blocked
        ? (lastValidStart.current ?? proposal.window.startMin)
        : snapped;
      animate(propMV, settle, blocked
        ? { type: "spring", stiffness: 400, damping: 28 }
        : { type: "inertia", velocity: v, power: 0.35, timeConstant: 320, modifyTarget: (m) => snapTarget(m, scene.windows.flatMap((w) => [w.startMin, w.endMin])) });
      if (!blocked) moveProposal(snapped, true);
      else announceVerdict(verdict);
      return;
    }
    moveProposal(snapped, true);
  };

  const onPropKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!proposal) return;
    const step = e.shiftKey ? 15 : 5;
    if (e.key === "ArrowLeft") { e.preventDefault(); moveProposal(propStart - step, false); }
    else if (e.key === "ArrowRight") { e.preventDefault(); moveProposal(propStart + step, false); }
    else if (e.key === "Home") { e.preventDefault(); moveProposal(0, false); }
    else if (e.key === "End") { e.preventDefault(); moveProposal(1440 - propDur, false); }
    else if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
    else return;
  };
  const onPropKeyUp = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && verdict) announceVerdict(verdict);
  };

  const momentHere = scene.momentDayIndex === scene.dayIndex && scene.moment ? scene.moment : null;
  const selEditable = read.selectedWindow && edit ? windowEditable(read.selectedWindow) : null;

  // Crew reads — the edit session overrides the exploration lines.
  let otto: { state: CrewAvatarState; line: string | null } = read.crew[0];
  let iris: { state: CrewAvatarState; line: string | null } = read.crew[1];
  if (proposal) {
    const unchanged = propStart === proposal.window.startMin;
    otto = unchanged
      ? { state: "attentive", line: "Drag the block or use the arrow keys to try another time." }
      : {
          state: propDragging ? "working" : "explaining",
          line: `Moving ${proposal.window.label} to ${fmtMin(propStart)}–${fmtMin(propEnd)}.`,
        };
    iris = unchanged
      ? { state: "resting", line: null }
      : verdict?.status === "valid"
        ? { state: "complete", line: `Checks out across all ${edit!.plans.length} days.` }
        : verdict?.status === "blocked"
          ? { state: "concerned", line: firstReason?.message ?? "That move doesn't clear the gate." }
          : { state: "attentive", line: "Checking the whole trip…" };
  }

  return (
    <section className="iday" ref={rootRef} data-motion={motionMode} data-dragging={dragging ? "yes" : "no"} aria-label={`The day over ${scene.city.name} — explore only`}>
      <header className="iday-head">
        <h3 className="iday-headline">{read.headline}</h3>
        <p className="iday-lead">{read.lead}</p>
      </header>

      <div className="iday-sky" ref={skyRef} role="img" aria-label={`Modeled sky over ${scene.city.name} at ${fmtMin(read.minute)}: ${sun.bandLabel ?? "sun position unavailable"}`} data-sun-fx={sunFx?.kind}>
        {motionMode === "momentum" && (
          <>
            <div className="iday-amb" aria-hidden="true" data-on={ambOn ? "yes" : "no"} />
            <div className="iday-smear" aria-hidden="true">
              <i /><i /><i />
            </div>
          </>
        )}
        <StageSun
          key={sunFx ? `${sunFx.kind}-${sunFx.n}` : "rest"}
          sun={sun}
          read={face}
          label={`${fmtMin(read.minute)} ${scene.city.name}: ${sun.bandLabel ?? "sun position unavailable"}`}
        />
      </div>

      <div className="iday-crew">
        <div className="iday-crew-line">
          <CrewAvatar id="planner" state={otto.state} gaze={gaze} size={48} decorative motionVar={momentum} />
          <p className="iday-crew-text"><b>Otto</b>{otto.line}</p>
        </div>
        <div className="iday-crew-line" data-quiet={iris.line === null ? "yes" : "no"}>
          <CrewAvatar id="evaluator" state={iris.state} gaze={gaze} size={48} decorative motionVar={momentum} />
          <p className="iday-crew-text"><b>Iris</b>{iris.line ?? "Iris is watching for conflicts."}</p>
        </div>
      </div>

      {scene.moment && scene.momentDayIndex !== scene.dayIndex && onJumpToMomentDay && (
        <button type="button" className="iday-jump" onClick={onJumpToMomentDay}>
          Jump to event day
        </button>
      )}
      <div className="iday-timeline" ref={tlRef}>
        <div className="iday-axis" aria-hidden="true" onPointerDown={onAxisPointerDown} onPointerMove={onAxisPointerMove} onPointerUp={onAxisPointerUp} onPointerCancel={() => { scrubIntent.current = null; }}>
          {[0, 360, 720, 1080, 1439].map((m, i) => (
            <span key={m} className="iday-tick" data-pos={i}>{["00", "06", "12", "18", "24"][i]}</span>
          ))}
          {momentHere && (
            <span className="iday-moment" title={`${momentHere.title} ${fmtMin(momentHere.localMin)}`}>
              ▲ {momentHere.title} {fmtMin(momentHere.localMin)}
            </span>
          )}
          <span className="iday-cursor" />
        </div>
        {LANES.map((lane) => {
          const laneWindows = scene.windows.filter((w) => w.kind === lane.kind);
          const layout = laneRows(laneWindows, minSpanMin);
          const editingHere = proposal && proposal.window.kind === lane.kind;
          return (
            <div key={lane.kind} className="iday-lane">
              <span className="iday-lane-name">{lane.name}</span>
              <div
                className="iday-track"
                ref={setTrackVars(layout.rowCount + (editingHere ? 1 : 0))}
                data-editing={editingHere ? "yes" : "no"}
              >
                {laneWindows.map((w, i) => {
                  const isGhost = proposal?.window.id === w.id;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      className={`iday-window${isGhost ? " iday-window-ghost" : ""}`}
                      data-kind={w.kind}
                      aria-pressed={read.selectedWindow?.id === w.id}
                      aria-label={`${w.label} ${fmtMin(w.startMin)}–${w.endMin >= 1440 ? "24:00" : fmtMin(w.endMin)}${w.continuesBefore ? ", continues from the day before" : ""}`}
                      ref={setWindowVars(w, layout.rows[i])}
                      onClick={() => selectWindow(w.id)}
                    >
                      {w.continuesBefore ? "‹" : ""}{fmtMin(w.startMin)}
                    </button>
                  );
                })}
                {editingHere && (
                  <>
                    <button
                      key="prop"
                      type="button"
                      className="iday-window iday-window-proposed"
                      data-kind={proposal!.window.kind}
                      data-blocked={blocked ? "yes" : "no"}
                      data-dragging={propDragging ? "yes" : "no"}
                      aria-label={`Proposed ${proposal!.window.label} start ${fmtMin(propStart)} — arrow keys move it, Escape cancels`}
                      ref={propRef}
                      onPointerDown={onPropPointerDown}
                      onPointerMove={onPropPointerMove}
                      onPointerUp={onPropPointerUp}
                      onKeyDown={onPropKeyDown}
                      onKeyUp={onPropKeyUp}
                    >
                      {fmtMin(propStart)}
                    </button>
                    {firstReason && (
                      <span
                        className="iday-window-reason"
                        ref={(el) => {
                          if (!el) return;
                          el.style.setProperty("--w-l", `${((Math.min(Math.max(0, propStart), 1440 - propDur) / 1440) * 100).toFixed(2)}%`);
                          el.style.setProperty("--w-t", `${layout.rowCount * WINDOW_ROW_PX}px`);
                        }}
                      >
                        <i className="iday-window-caret" aria-hidden="true" />
                        {firstReason.message}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
        <div className="iday-scrub">
          <button type="button" onClick={() => selectTime(read.minute - 15, true)} aria-label="Back 15 minutes">−15m</button>
          <input
            type="range"
            min={0}
            max={1439}
            step={1}
            value={read.minute}
            aria-label={`Time in ${scene.city.name} — inspect only`}
            aria-valuetext={`${fmtMin(read.minute)} ${scene.city.name} local; ${fmtMin(read.bodyMin)} estimated body time`}
            onPointerDown={() => setDragging(true)}
            onPointerUp={() => { setDragging(false); setAnnounce(`${scene.city.name} ${fmtMin(read.minute)}`); }}
            onKeyUp={() => setAnnounce(`${scene.city.name} ${fmtMin(read.minute)}`)}
            onBlur={() => setDragging(false)}
            onChange={(e) => selectTime(Number(e.target.value), false)}
          />
          <button type="button" onClick={() => selectTime(read.minute + 15, true)} aria-label="Forward 15 minutes">+15m</button>
        </div>
      </div>

      {proposal ? (
        <div className="iday-edit" role="group" aria-label="Propose a new time">
          <p className="iday-edit-line">
            Proposed start <b>{fmtMin(propStart)}</b>–<b>{fmtMin(propEnd)}</b>
          </p>
          {verdict && verdict.status !== "stale" && (
            <p className="iday-edit-est">
              Model estimate: {(verdict.result.coverage.achievedMin / 60).toFixed(1)}h of {(verdict.result.coverage.requiredMin / 60).toFixed(1)}h covered
              (now {(verdict.before.coverage.achievedMin / 60).toFixed(1)}h)
            </p>
          )}
          {outcome?.kind === "stale" && (
            <p className="iday-edit-outcome">
              The plan changed since you started — your proposal wasn&rsquo;t applied.{" "}
              <button type="button" onClick={() => { edit?.refresh(); cancelEdit(); }}>
                Start again from the current plan
              </button>
            </p>
          )}
          {outcome?.kind === "failed" && (
            <p className="iday-edit-outcome">Couldn&rsquo;t save — your plan is unchanged.</p>
          )}
          {outcome?.kind === "refused" && (
            <p className="iday-edit-outcome">{outcome.reason}</p>
          )}
          <div className="iday-edit-controls">
            <button type="button" onClick={() => moveProposal(propStart - 15, true)} aria-label="Proposed time back 15 minutes">−15m</button>
            <button type="button" onClick={() => moveProposal(propStart + 15, true)} aria-label="Proposed time forward 15 minutes">+15m</button>
            <button type="button" className="iday-edit-apply" disabled={blocked || verdict?.status !== "valid"} onClick={applyEdit}>
              Apply
            </button>
            <button type="button" onClick={cancelEdit}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="iday-read-wrap">
          <p className="iday-read">{read.explanation}</p>
          {outcome?.kind === "stale" && (
            <p className="iday-edit-outcome">
              The plan changed since you started — your proposal wasn&rsquo;t applied.{" "}
              <button type="button" onClick={() => { edit?.refresh(); setOutcome(null); }}>
                Start again from the current plan
              </button>
            </p>
          )}
          {outcome?.kind === "failed" && (
            <p className="iday-edit-outcome">Couldn&rsquo;t save — your plan is unchanged.</p>
          )}
          {outcome?.kind === "refused" && (
            <p className="iday-edit-outcome">{outcome.reason}</p>
          )}
          {appliedNote && (
            <p className="iday-edit-note">{appliedNote}</p>
          )}
          {(edit || editBlockReason) && read.selectedWindow && selEditable && (
            <p className="iday-edit-cta">
              {selEditable.editable ? (
                <button
                  type="button"
                  onClick={() => {
                    setProposal({ window: read.selectedWindow!, startMin: read.selectedWindow!.startMin });
                    setOutcome(null);
                    setAnnounce(`Proposing a new time for ${read.selectedWindow!.label}`);
                  }}
                >
                  Try another time
                </button>
              ) : (
                <span className="iday-edit-no">{selEditable.reason}</span>
              )}
            </p>
          )}
        </div>
      )}

      <details className="day-scene-details">
        <summary>See light, sleep and caffeine details</summary>
        <LightWindowPanel plan={scene.plan} date={scene.date} city={scene.city.name} preview={preview} example={example} />
      </details>
      <p className="iday-foot">
        Body-clock estimates, not measured alertness — modeled sky, not a weather forecast.
        Exploring and proposing don&rsquo;t record completed steps.
      </p>
      {children}
      <p className="iday-live" aria-live="polite">{announce}</p>
      {toast}
    </section>
  );
}
