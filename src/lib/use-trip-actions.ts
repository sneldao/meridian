"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  EMPTY_TRIP_ACTIONS,
  acknowledgeTripActions,
  readTripActions,
  toggleTripAction,
  type ActionMark,
  type TripActionState,
} from "@/lib/trip-actions";

export interface TripActions {
  completedIds: Set<string>;
  skippedIds: Set<string>;
  pendingMarks: Map<string, ActionMark>;
  marks: ActionMark[];

  ready: boolean;
  mark: (action: Omit<ActionMark, "status">, status: "done" | "skipped") => void;
  acknowledge: (ids: string[]) => void;
}

const actionsKey = (tripKey: string) => `meridian:actions:${tripKey}`;
const legacyCompletedKey = (tripKey: string) => `meridian:completedNudges:${tripKey}`;
const legacyPendingKey = (tripKey: string) => `meridian:pendingCheckins:${tripKey}`;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function hydrateTripActionsFromStorage(
  tripKey: string,
  preview: boolean,
  storage: StorageLike,
): TripActionState {
  if (preview) return EMPTY_TRIP_ACTIONS;
  return readTripActions(
    storage.getItem(actionsKey(tripKey)),
    storage.getItem(legacyCompletedKey(tripKey)),
    storage.getItem(legacyPendingKey(tripKey)),
  );
}

export function derivePendingMarks(
  state: TripActionState,
  preview: boolean,
): Map<string, ActionMark> {
  const pendingMarks = new Map<string, ActionMark>();
  if (preview) return pendingMarks;
  for (const id of state.pendingIds) {
    const m = state.marks[id];
    if (m) pendingMarks.set(id, m);
  }
  return pendingMarks;
}

export function persistTripActionsToStorage(
  tripKey: string,
  preview: boolean,
  state: TripActionState,
  storage: StorageLike,
): void {
  if (preview) return;
  storage.setItem(actionsKey(tripKey), JSON.stringify(state));
}

export function useTripActions(tripKey: string | null, preview: boolean): TripActions {
  const scope = tripKey === null ? null : `${preview ? "preview" : "live"}:${tripKey}`;
  const [hydrated, setHydrated] = useState<{ scope: string; state: TripActionState } | null>(null);

  useEffect(() => {
    if (scope === null || tripKey === null) {
      const t = setTimeout(() => setHydrated(null), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (preview) {
        setHydrated({ scope, state: EMPTY_TRIP_ACTIONS });
        return;
      }
      let state = EMPTY_TRIP_ACTIONS;
      try {
        state = hydrateTripActionsFromStorage(tripKey, preview, localStorage);
      } catch {

      }
      setHydrated({ scope, state });
    }, 0);
    return () => clearTimeout(t);
  }, [scope, preview, tripKey]);

  const state = hydrated?.scope === scope ? hydrated.state : EMPTY_TRIP_ACTIONS;
  const ready = scope !== null && hydrated?.scope === scope;

  const persist = useCallback(
    (next: TripActionState) => {
      if (preview || tripKey === null) return;
      try {
        persistTripActionsToStorage(tripKey, preview, next, localStorage);
      } catch {

      }
    },
    [preview, tripKey],
  );

  const mark = useCallback(
    (action: Omit<ActionMark, "status">, status: "done" | "skipped") => {
      if (scope === null) return;
      setHydrated((prev) => {
        if (prev?.scope !== scope) return prev;
        const next = toggleTripAction(prev.state, action, status);
        persist(next);
        return { scope, state: next };
      });
    },
    [scope, persist],
  );

  const acknowledge = useCallback(
    (ids: string[]) => {
      if (scope === null) return;
      setHydrated((prev) => {
        if (prev?.scope !== scope) return prev;
        const next = acknowledgeTripActions(prev.state, ids);
        persist(next);
        return { scope, state: next };
      });
    },
    [scope, persist],
  );

  return useMemo(() => {
    const skippedIds = new Set<string>();
    for (const m of Object.values(state.marks)) {
      if (m.status === "skipped") skippedIds.add(m.id);
    }
    return {
      completedIds: new Set(state.completedIds),
      skippedIds,
      pendingMarks: derivePendingMarks(state, preview),
      marks: Object.values(state.marks),
      ready,
      mark,
      acknowledge,
    };
  }, [state, ready, preview, mark, acknowledge]);
}
