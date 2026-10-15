import {
  Activity,
  BookOpen,
  CalendarClock,
  LayoutGrid,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { AgentId } from "@/domain/types";

// One glyph per crew member — dual-coding so the feed and onboarding read at
// a glance without parsing "Name · ROLE" strings.
export const AGENT_ICONS: Record<AgentId, LucideIcon> = {
  analyst: Activity,
  researcher: BookOpen,
  planner: LayoutGrid,
  evaluator: ShieldCheck,
  negotiator: CalendarClock,
};
