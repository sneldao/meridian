import { useCallback, useEffect, useState } from "react";

export type ThemeChoice = "auto" | "light" | "dark";

const THEME_KEY = "meridian:theme";

function applyTheme(t: ThemeChoice) {
  const h = new Date().getHours();
  const dark =
    t === "dark" ||
    (t === "auto" &&
      (window.matchMedia("(prefers-color-scheme: dark)").matches || h >= 21 || h < 6));
  document.documentElement.dataset.theme = dark ? "night" : "";
}

/** Auto follows the OS and the hour — a jet-lag app is mostly opened in the
 *  dark. Re-applies live when the OS flips, so "auto" doesn't go stale while
 *  the tab sits open. */
export function useTheme(): { theme: ThemeChoice; cycleTheme: () => void } {
  const [theme, setTheme] = useState<ThemeChoice>("auto");

  useEffect(() => {
    // Post-mount on purpose: the server renders "auto" and the stored choice
    // would be a hydration mismatch if applied during the first render.
    const t = setTimeout(() => {
      try {
        const stored = (localStorage.getItem(THEME_KEY) as ThemeChoice) ?? "auto";
        setTheme(stored);
        applyTheme(stored);
      } catch {
        /* storage unavailable — "auto" stands */
      }
    }, 0);
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onChange = () => {
      try {
        applyTheme((localStorage.getItem(THEME_KEY) ?? "auto") as ThemeChoice);
      } catch {
        /* ignore */
      }
    };
    mq?.addEventListener?.("change", onChange);
    return () => {
      clearTimeout(t);
      mq?.removeEventListener?.("change", onChange);
    };
  }, []);

  const cycleTheme = useCallback(() => {
    setTheme((prev) => {
      const next: ThemeChoice =
        prev === "auto" ? "light" : prev === "light" ? "dark" : "auto";
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        /* ignore */
      }
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, cycleTheme };
}
