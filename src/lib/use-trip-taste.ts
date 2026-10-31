"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { parseTasteFavorites, type TasteEntity } from "@/domain/taste";

export interface TripTaste {
  favorites: TasteEntity[];
  ready: boolean;
  setFavorites: (next: TasteEntity[]) => void;
  storageAvailable: boolean;
}

const tasteKey = (scope: string) => `meridian:taste:${scope}`;

export function readTripTaste(storage: Pick<Storage, "getItem">, scope: string): TasteEntity[] {
  return parseTasteFavorites(storage.getItem(tasteKey(scope))) ?? [];
}

export function writeTripTaste(
  storage: Pick<Storage, "setItem">,
  scope: string,
  favorites: TasteEntity[],
): void {
  const clean = parseTasteFavorites(JSON.stringify(favorites));
  if (clean === null) throw new Error("invalid taste favorites");
  storage.setItem(tasteKey(scope), JSON.stringify(clean));
}

export function useTripTaste(scope: string | null, persist: boolean): TripTaste {
  const [hydrated, setHydrated] = useState<{
    scope: string;
    favorites: TasteEntity[];
    storageAvailable: boolean;
  } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      if (scope === null) {
        setHydrated(null);
        return;
      }
      if (!persist) {
        setHydrated({ scope, favorites: [], storageAvailable: false });
        return;
      }
      try {
        setHydrated({ scope, favorites: readTripTaste(localStorage, scope), storageAvailable: true });
      } catch {
        setHydrated({ scope, favorites: [], storageAvailable: false });
      }
    }, 0);
    return () => clearTimeout(t);
  }, [scope, persist]);

  const current = hydrated?.scope === scope ? hydrated : null;
  const ready = scope !== null && current !== null;
  const storageAvailable = persist && (current?.storageAvailable ?? false);

  const setFavorites = useCallback(
    (next: TasteEntity[]) => {
      if (scope === null || hydrated?.scope !== scope) return;
      const clean = parseTasteFavorites(JSON.stringify(next));
      if (clean === null) return;
      const prev = hydrated.favorites;
      const same = prev.length === clean.length && prev.every((f, i) => f.id === clean[i].id);
      if (same) return;
      let available = hydrated?.scope === scope ? hydrated.storageAvailable : false;
      if (persist) {
        try {
          writeTripTaste(localStorage, scope, clean);
          available = true;
        } catch {
          available = false;
        }
      }
      setHydrated({ scope, favorites: clean, storageAvailable: available });
    },
    [scope, persist, hydrated],
  );

  return useMemo(
    () => ({ favorites: current?.favorites ?? [], ready, setFavorites, storageAvailable }),
    [current, ready, setFavorites, storageAvailable],
  );
}
