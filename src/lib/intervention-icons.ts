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
  light_exposure: { icon: Sun, tint: "#ffd98a" },
  avoid_light: { icon: EyeOff, tint: "#9db8ff" },
  sleep_window: { icon: Moon, tint: "#b8a8ff" },
  caffeine_cutoff: { icon: Coffee, tint: "#d2a26b" },
  melatonin: { icon: Pill, tint: "#7adfff" },
  exercise: { icon: Activity, tint: "#b8e356" },
  meal_timing: { icon: Utensils, tint: "#ffc46b" },
  nap: { icon: BedDouble, tint: "#8b93a7" },
};
