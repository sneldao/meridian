import type { InterventionKind } from "@/domain/types";

export interface ActionMark {
  id: string;
  dayIndex: number;
  kind?: InterventionKind;
  startMin?: number;
  status: "done" | "skipped";

  text: string;
  at: number;
}

export interface TripActionState {

  completedIds: string[];

  marks: Record<string, ActionMark>;

  pendingIds: string[];
}

const EMPTY: TripActionState = { completedIds: [], marks: {}, pendingIds: [] };

function marksRecord(): Record<string, ActionMark> {
  return Object.create(null) as Record<string, ActionMark>;
}

function isStatus(v: unknown): v is "done" | "skipped" {
  return v === "done" || v === "skipped";
}

const INTERVENTION_KINDS = new Set<InterventionKind>([
  "light_exposure",
  "avoid_light",
  "sleep_window",
  "caffeine_cutoff",
  "melatonin",
  "exercise",
  "meal_timing",
  "nap",
]);

function toMark(id: string, v: unknown): ActionMark | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  if (typeof m.dayIndex !== "number" || !Number.isInteger(m.dayIndex) || m.dayIndex < 0) return null;
  if (m.startMin !== undefined && (typeof m.startMin !== "number" || !Number.isFinite(m.startMin))) return null;
  if (m.at !== undefined && (typeof m.at !== "number" || !Number.isFinite(m.at))) return null;
  if (m.kind !== undefined && (typeof m.kind !== "string" || !INTERVENTION_KINDS.has(m.kind as InterventionKind))) return null;
  if (!isStatus(m.status)) return null;
  return {
    id,
    dayIndex: m.dayIndex,
    kind: m.kind as InterventionKind | undefined,
    startMin: m.startMin as number | undefined,
    status: m.status,
    text: typeof m.text === "string" ? m.text : `${m.status}: step`,
    at: typeof m.at === "number" ? (m.at as number) : 0,
  };
}

export function readTripActions(
  raw: string | null,
  legacyCompletedRaw?: string | null,
  legacyPendingRaw?: string | null,
): TripActionState {
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY;
      if (parsed.completedIds !== undefined && !Array.isArray(parsed.completedIds)) return EMPTY;
      if (parsed.pendingIds !== undefined && !Array.isArray(parsed.pendingIds)) return EMPTY;
      if (parsed.marks !== undefined && (typeof parsed.marks !== "object" || parsed.marks === null || Array.isArray(parsed.marks))) {
        return EMPTY;
      }
      const marks = marksRecord();
      for (const [id, v] of Object.entries(parsed.marks ?? {})) {
        const m = toMark(id, v);
        if (m) marks[id] = m;
      }
      const markIds = new Set(Object.keys(marks));
      const completed = new Set(
        ((parsed.completedIds ?? []) as unknown[]).filter(
          (x): x is string => typeof x === "string",
        ),
      );
      for (const m of Object.values(marks)) {
        if (m.status === "done") completed.add(m.id);
        else completed.delete(m.id);
      }
      return {
        completedIds: [...completed],
        marks,
        pendingIds: [
          ...new Set(
            ((parsed.pendingIds ?? []) as unknown[]).filter(
              (x): x is string => typeof x === "string" && markIds.has(x),
            ),
          ),
        ],
      };
    } catch {
      return EMPTY;
    }
  }

  const completed = new Set<string>();
  const marks = marksRecord();
  const pending: string[] = [];
  try {
    const parsed = legacyCompletedRaw ? JSON.parse(legacyCompletedRaw) : null;
    if (Array.isArray(parsed)) {
      for (const x of parsed) if (typeof x === "string") completed.add(x);
    }
  } catch {

  }
  try {
    const parsed = legacyPendingRaw ? JSON.parse(legacyPendingRaw) : null;
    if (Array.isArray(parsed)) {
      for (const entry of parsed) {
        if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
        const m = toMark(entry[0], entry[1]);
        if (!m) continue;
        marks[m.id] = m;
        pending.push(m.id);
        if (m.status === "done") completed.add(m.id);
        else completed.delete(m.id);
      }
    }
  } catch {

  }
  return { completedIds: [...completed], marks, pendingIds: pending };
}

export function toggleTripAction(
  state: TripActionState,
  action: Omit<ActionMark, "status">,
  status: "done" | "skipped",
): TripActionState {
  const current: "done" | "skipped" | null =
    state.marks[action.id]?.status ??
    (state.completedIds.includes(action.id) ? "done" : null);
  const marks = marksRecord();
  Object.assign(marks, state.marks);
  const completed = new Set(state.completedIds);
  const pending = new Set(state.pendingIds);

  if (current === status) {
    delete marks[action.id];
    completed.delete(action.id);
    pending.delete(action.id);
  } else {
    marks[action.id] = { ...action, status };
    pending.add(action.id);
    if (status === "done") completed.add(action.id);
    else completed.delete(action.id);
  }
  return { completedIds: [...completed], marks, pendingIds: [...pending] };
}

export function acknowledgeTripActions(state: TripActionState, ids: string[]): TripActionState {
  const drop = new Set(ids);
  return {
    completedIds: state.completedIds,
    marks: state.marks,
    pendingIds: state.pendingIds.filter((id) => !drop.has(id)),
  };
}

export const EMPTY_TRIP_ACTIONS: TripActionState = EMPTY;
