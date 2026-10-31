import { useCallback, useEffect, useRef, useState } from "react";
import { resolveTheme, sunUp, type SunPlace, type ThemeChoice } from "@/domain/theme";

export type { ThemeChoice } from "@/domain/theme";

const THEME_KEY = "meridian:theme";
/** The sun crosses the horizon while the tab sits open on a night flight. */
const RECHECK_MS = 5 * 60 * 1000;

const readChoice = (): ThemeChoice => {
  try {
    return ((localStorage.getItem(THEME_KEY) as ThemeChoice) ?? "auto") as ThemeChoice;
  } catch {
    return "auto";
  }
};

/** Paint the palette, and mirror what `auto` is currently following. */
function applyTheme(choice: ThemeChoice, place: SunPlace | null) {
  try {
    const paint = resolveTheme({
      choice,
      osDark: window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
      deviceHour: new Date().getHours(),
      place,
    });
    document.documentElement.dataset.theme = paint;
    // The pre-hydration script cannot do solar maths, so it re-paints what we
    // resolved last time instead of guessing from the device hour again.
    localStorage.setItem(`${THEME_KEY}:paint`, paint);
  } catch {
    /* storage or media query unavailable — the server palette stands */
  }
}

/**
 * `auto` follows the destination's sun once a trip is known, and the device
 * (OS scheme + hour) until then — see `src/domain/theme.ts`.
 *
 * The first paint is always "auto" on the server's rules: applying a stored
 * choice or a destination during render would mismatch hydration, so it lands
 * one tick later.
 */
export function useTheme(place?: SunPlace | null): {
  theme: ThemeChoice;
  cycleTheme: () => void;
  /** What `auto` is reading right now: the destination's sun, or null on device rules. */
  sunUpNow: boolean | null;
} {
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  const [sunUpNow, setSunUpNow] = useState<boolean | null>(null);
  const placeRef = useRef<SunPlace | null>(null);
  const placeKey = place ? `${place.lat},${place.lon}` : "";

  // Declared before the paint effect so it always reads the current
  // destination; a ref must not be written during render.
  useEffect(() => {
    placeRef.current = place ?? null;
  }, [place]);

  useEffect(() => {
    const reapply = () => {
      const choice = readChoice();
      const current = placeRef.current;
      setTheme(choice);
      applyTheme(choice, current);
      setSunUpNow(current ? sunUp(current) : null);
    };
    const tick = setTimeout(reapply, 0);
    const iv = setInterval(reapply, RECHECK_MS);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", reapply);
    document.addEventListener("visibilitychange", reapply);
    return () => {
      clearTimeout(tick);
      clearInterval(iv);
      mq?.removeEventListener?.("change", reapply);
      document.removeEventListener("visibilitychange", reapply);
    };
  }, [placeKey]);

  const cycleTheme = useCallback(() => {
    const next: ThemeChoice =
      theme === "auto" ? "light" : theme === "light" ? "dark" : "auto";
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* ignore */
    }
    setTheme(next);
    applyTheme(next, placeRef.current);
    setSunUpNow(placeRef.current ? sunUp(placeRef.current) : null);
  }, [theme]);

  return { theme, cycleTheme, sunUpNow };
}
