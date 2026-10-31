"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  isPlaceChoice,
  readPlaceChoices,
  writePlaceChoices,
  type PlaceChoice,
  type PlaceChoiceState,
} from "@/lib/place-choices";

export interface PlaceChoices {
  state: PlaceChoiceState;
  ready: boolean;
  storageAvailable: boolean;
  setChoice: (date: string, choice: PlaceChoice) => void;
  clearChoice: (date: string) => void;
}

export function usePlaceChoices(scope: string | null, persist: boolean): PlaceChoices {
  const [hydrated, setHydrated] = useState<{
    scope: string;
    state: PlaceChoiceState;
    storageAvailable: boolean;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (scope === null) {
        setHydrated(null);
        return;
      }
      if (!persist) {
        setHydrated({ scope, state: {}, storageAvailable: false });
        return;
      }
      try {
        setHydrated({ scope, state: readPlaceChoices(localStorage, scope), storageAvailable: true });
      } catch {
        setHydrated({ scope, state: {}, storageAvailable: false });
      }
    }, 0);
    return () => clearTimeout(t);
  }, [scope, persist]);

  const current = hydrated?.scope === scope ? hydrated : null;
  const ready = scope !== null && current !== null;
  const storageAvailable = persist && (current?.storageAvailable ?? false);

  const write = useCallback(
    (next: PlaceChoiceState) => {
      if (scope === null || hydrated?.scope !== scope) return;
      let available = hydrated.storageAvailable;
      if (persist) {
        try {
          writePlaceChoices(localStorage, scope, next);
          available = true;
        } catch {
          available = false;
        }
      }
      setHydrated({ scope, state: next, storageAvailable: available });
    },
    [scope, persist, hydrated],
  );

  const setChoice = useCallback(
    (date: string, choice: PlaceChoice) => {
      if (scope === null || hydrated?.scope !== scope) return;
      const next = { ...hydrated.state, [date]: choice };
      try {
        writePlaceChoices({ setItem: () => {} }, scope, next);
      } catch {
        return;
      }
      if (!isPlaceChoice(choice)) return;
      write(next);
    },
    [scope, hydrated, write],
  );

  const clearChoice = useCallback(
    (date: string) => {
      if (scope === null || hydrated?.scope !== scope) return;
      if (!(date in hydrated.state)) return;
      const next = { ...hydrated.state };
      delete next[date];
      write(next);
    },
    [scope, hydrated, write],
  );

  return useMemo(
    () => ({ state: current?.state ?? {}, ready, storageAvailable, setChoice, clearChoice }),
    [current, ready, storageAvailable, setChoice, clearChoice],
  );
}
