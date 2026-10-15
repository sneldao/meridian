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
