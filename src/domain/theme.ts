import { isDaylight } from "./sun";

/**
 * The stage's ink is a state of the sun, not a user preference.
 *
 * `auto` used to ask the device what hour it thought it was — which is the
 * wrong clock in a jet-lag app: a traveller standing in Tokyo at 07:00, whose
 * phone still says Berlin 00:00, got the night palette. When a destination is
 * known the destination's own sunlight decides, straight from the solar model
 * that already paints the sky.
 */

export type ThemeChoice = "auto" | "light" | "dark";

export interface SunPlace {
  lat: number;
  lon: number;
  name?: string;
}

/** Geometric daylight — the polar caps make this more than a clock. */
export function sunUp(place: SunPlace, at: Date = new Date()): boolean {
  return isDaylight(place.lat, place.lon, at);
}

export interface ThemeEnv {
  choice: ThemeChoice;
  /** `window.matchMedia("(prefers-color-scheme: dark)")`. */
  osDark: boolean;
  /** Local hour on the device — the fallback when no destination is known. */
  deviceHour: number;
  place?: SunPlace | null;
  at?: Date;
}

/**
 * What to paint. An explicit choice always wins; `auto` follows the
 * destination's sun when there is one, and the device when there is not, so
 * `/` mid-setup and `/history` behave exactly as they did before.
 */
export function resolveTheme(env: ThemeEnv): "night" | "" {
  if (env.choice === "light") return "";
  if (env.choice === "dark") return "night";
  if (env.place) return sunUp(env.place, env.at ?? new Date()) ? "" : "night";
  return env.osDark || env.deviceHour >= 21 || env.deviceHour < 6 ? "night" : "";
}
