import {
  Activity,
  BedDouble,
  Coffee,
  EyeOff,
  Moon,
  Pill,
  Sun,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { InterventionKind } from "@/domain/types";

// Canonical icon vocabulary for intervention kinds — one glyph per ask,
// consistent everywhere the plan surfaces.

/** Plain-language names — intervention kinds stay snake_case internally;
 *  travellers read words. */
export const INTERVENTION_LABELS: Record<InterventionKind, string> = {
  light_exposure: "Get daylight",
  avoid_light: "Avoid bright light",
  sleep_window: "Sleep",
  caffeine_cutoff: "Last coffee",
  melatonin: "Melatonin",
  exercise: "Exercise",
  meal_timing: "Meal time",
  nap: "Nap",
};

export const INTERVENTION_ICONS: Record<InterventionKind, { icon: LucideIcon; tint: string }> = {
  light_exposure: { icon: Sun, tint: "var(--color-ghost)" },
  avoid_light: { icon: EyeOff, tint: "var(--color-sun-home)" },
  sleep_window: { icon: Moon, tint: "var(--color-sleep)" },
  caffeine_cutoff: { icon: Coffee, tint: "#d2a26b" },
  melatonin: { icon: Pill, tint: "var(--color-progress)" },
  exercise: { icon: Activity, tint: "#4ade80" },
  meal_timing: { icon: Utensils, tint: "var(--color-sun-dest)" },
  nap: { icon: BedDouble, tint: "var(--color-mist)" },
};
