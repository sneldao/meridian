import { fmtMin } from "@/domain/circadian";
import {
  inspectDayScene,
  type DaySceneModel,
  type SceneWindow,
} from "@/domain/day-scene";
import type { CrewAvatarState } from "@/components/CrewAvatar";

/* The interactive day as data (round 31). Exploration only — selecting a
 * time or a window reads the scene, it never touches the saved plan, the
 * action ledger or the adaptation estimate. All the maths is day-scene's;
 * this module only decides what the read says and which crew member has
 * something to say about it. */

export type DaySelection =
  | { type: "time"; minute: number }
  | { type: "window"; windowId: string };

export interface CrewReaction {
  agent: "planner" | "evaluator";
  state: CrewAvatarState;
  line: string | null;
}

export interface InteractiveDayRead {
  /** Local minute in scene.city. */
  minute: number;
  bodyMin: number;
  selectedWindow: SceneWindow | null;
  activeWindows: SceneWindow[];
  /** First window starting after minute. */
  nextWindow: SceneWindow | null;
  /** e.g. "Tokyo · 07:30 — next: Seek light at 08:00". */
  headline: string;
  /** What matters now, under the headline — short and distinct from the
   *  facts panel. */
  lead: string;
  /** Persistent read of the selected time/window — the facts: local time,
   *  estimated body time, active windows, solar label. */
  explanation: string;
  /** The plan's own note for the selected window, when the plan carries one
   *  (e.g. "Shade and indoors until 12:15 — this light would push you back"). */
  selectedNote: string | null;
  /** Always-on day facts in one line — sleep range + caffeine cutoff. */
  planSummary: string | null;
  /** Local minute of the caffeine cutoff, for the axis marker. */
  caffeineMin: number | null;
  /** Always [otto, iris]. */
  crew: CrewReaction[];
}

const endLabel = (w: SceneWindow) => (w.endMin >= 1440 ? "24:00" : fmtMin(w.endMin));

const rangeLabel = (w: SceneWindow) => `${w.label} ${fmtMin(w.startMin)}–${endLabel(w)}`;

/** What the window is for — the words the light panel and day scene already
 *  use. Descriptions of the ask, never invented physiology. */
const PURPOSE: Record<SceneWindow["kind"], string> = {
  seek: "timed light the plan asks you to seek — right light, right time",
  reduce: "light held back on purpose — not more sun, the right sun",
  sleep: "the day's sleep window",
};

function carryover(w: SceneWindow): string {
  if (!w.fromEarlierDay && !w.continuesBefore) return "";
  return " — carries over from the day before";
}

export function readInteractiveDay(
  scene: DaySceneModel,
  selection: DaySelection,
): InteractiveDayRead {
  const selectedWindow =
    selection.type === "window"
      ? scene.windows.find((w) => w.id === selection.windowId) ?? null
      : null;
  const minute =
    selectedWindow ? selectedWindow.startMin
    : selection.type === "time" ? selection.minute
    : 720;
  const read = inspectDayScene(scene, minute);
  const active = read.activeWindows;
  // First window starting after the minute — take the minimum startMin
  // rather than trusting input order.
  const nextWindow = scene.windows
    .filter((w) => w.startMin > read.localMin)
    .sort((a, b) => a.startMin - b.startMin)[0] ?? null;

  const momentHere =
    scene.moment && scene.momentDayIndex === scene.dayIndex ? scene.moment : null;

  // The drawer's content, integrated (round 34): the note lives on the plan's
  // intervention — a window id is `${dayIndex}:${index}` — and sleep/caffeine
  // become a persistent facts line plus an axis marker.
  const selectedNote = (() => {
    if (!selectedWindow || !scene.plan) return null;
    const [d, i] = selectedWindow.id.split(":").map(Number);
    if (d !== scene.plan.dayIndex) return null;
    return scene.plan.interventions[i]?.note || null;
  })();
  const sleepIv = scene.plan?.interventions.find((i) => i.kind === "sleep_window");
  const caffeineIv = scene.plan?.interventions.find((i) => i.kind === "caffeine_cutoff");
  const planSummary =
    scene.plan
      ? [
          sleepIv ? `Sleep ${fmtMin(sleepIv.startMin)}${sleepIv.endMin != null ? `–${fmtMin(sleepIv.endMin)}` : ""}` : null,
          caffeineIv ? `Caffeine cutoff ${fmtMin(caffeineIv.startMin)}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null
      : null;
  const caffeineMin = caffeineIv?.startMin ?? null;

  const headline = `${scene.city.name} · ${fmtMin(read.localMin)}${nextWindow ? ` — next: ${nextWindow.label} at ${fmtMin(nextWindow.startMin)}` : ""}`;

  // Otto — the planner. A window gets the full read; a bare time gets what
  // is active there or what comes next.
  let otto: CrewReaction;
  if (selectedWindow) {
    const w = selectedWindow;
    otto = {
      agent: "planner",
      state: "explaining",
      line: `${rangeLabel(w)} — ${selectedNote ?? PURPOSE[w.kind]}${carryover(w)}.`,
    };
  } else if (active.length) {
    otto = {
      agent: "planner",
      state: "attentive",
      line: `At ${fmtMin(read.localMin)} you're inside ${active.map((w) => `${w.label} (until ${endLabel(w)})`).join(" and ")}.`,
    };
  } else if (nextWindow) {
    otto = {
      agent: "planner",
      state: "attentive",
      line: `Nothing timed at ${fmtMin(read.localMin)} — next up, ${rangeLabel(nextWindow)}.`,
    };
  } else {
    otto = {
      agent: "planner",
      state: "attentive",
      line: `Nothing timed at or after ${fmtMin(read.localMin)} on ${scene.dayLabel}.`,
    };
  }

  // Iris — the evaluator. She speaks only when there is something to check.
  let iris: CrewReaction = { agent: "evaluator", state: "resting", line: null };
  if (selectedWindow) {
    if (momentHere && momentHere.localMin >= selectedWindow.startMin && momentHere.localMin < selectedWindow.endMin) {
      iris = {
        agent: "evaluator",
        state: "concerned",
        line: `${momentHere.title} at ${fmtMin(momentHere.localMin)} sits inside this ${selectedWindow.label.toLowerCase()} window.`,
      };
    } else if (selectedWindow.continuesBefore || selectedWindow.fromEarlierDay) {
      iris = {
        agent: "evaluator",
        state: "attentive",
        line: `This ${selectedWindow.label.toLowerCase()} window carries over from the day before.`,
      };
    }
  } else if (momentHere && Math.abs(read.localMin - momentHere.localMin) <= 15) {
    iris = {
      agent: "evaluator",
      state: "attentive",
      line: `${momentHere.title} is at ${fmtMin(momentHere.localMin)} — ${fmtMin(momentHere.bodyMin)} body time.`,
    };
  }

  // Three reads, three roles: the headline says where and what comes
  // next, the lead says what the minute itself holds — inside a window it
  // names the window's end, beside the moment it names the marker, and in
  // open air it invites the drag — Otto says why, the panel states the
  // facts. The lead never restates the headline's "next".
  const lead = active.length
    ? `Inside ${active.map((w) => `${w.label.toLowerCase()} until ${endLabel(w)}`).join(" and ")}.`
    : momentHere
      ? `The crew's moment is marked on the axis — ${momentHere.title} at ${fmtMin(momentHere.localMin)}.`
      : nextWindow
        ? "The day is open right now — drag the timeline to look around."
        : `Nothing timed on ${scene.dayLabel}.`;

  const solarLabel = read.solar?.label ?? "Solar position unavailable at this local time";
  const solarSentence = solarLabel.charAt(0).toUpperCase() + solarLabel.slice(1);
  const explanation =
    `${fmtMin(read.localMin)} local · ${fmtMin(read.bodyMin)} estimated body time — ` +
    `${active.length ? `inside ${active.map((w) => w.label.toLowerCase()).join(" and ")}` : "no light or sleep window here"}. ` +
    `${solarSentence}.`;

  return {
    minute: read.localMin,
    bodyMin: read.bodyMin,
    selectedWindow,
    activeWindows: active,
    nextWindow,
    headline,
    lead,
    explanation,
    selectedNote,
    planSummary,
    caffeineMin,
    crew: [otto, iris],
  };
}

/** Minimum width a lane button keeps, in minutes — the component converts
 *  its px hit-target to minutes against the measured track width. */
export function laneRows(
  windows: SceneWindow[],
  minSpanMin: number,
): { rows: number[]; rowCount: number } {
  // Expand each window to its minimum footprint and clamp it inside the
  // day, then greedily colour the interval overlaps — the same rule the
  // CSS applies in percentages.
  const spans = windows.map((w) => {
    const span = Math.max(w.endMin - w.startMin, minSpanMin);
    const start = Math.min(w.startMin, 1440 - span);
    return { start, end: start + span };
  });
  const order = spans.map((_, i) => i).sort((a, b) => spans[a].start - spans[b].start);
  const rows: number[] = new Array(windows.length).fill(0);
  const rowEnds: number[] = [];
  for (const i of order) {
    let row = rowEnds.findIndex((end) => spans[i].start >= end);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(0);
    }
    rows[i] = row;
    rowEnds[row] = spans[i].end;
  }
  return { rows, rowCount: Math.max(1, rowEnds.length) };
}
