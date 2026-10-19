"use client";

import { useState } from "react";
import { WorldLens } from "@/components/lenses/WorldLens";
import { ShiftBoard } from "@/components/lenses/ShiftBoard";
import { CalendarLens } from "@/components/lenses/CalendarLens";
import type {
  AgentId,
  CalendarEvent,
  Citation,
  DayPlan,
  EvalResult,
  Trip,
} from "@/domain/types";
import type { MeetingReadiness } from "@/domain/readiness";
import type { ShiftDraft } from "@/state/run";

type Explorer = "none" | "globe" | "swimlane" | "calendar";

interface DeepDiveVisualsProps {
  trip: Trip | null;
  phase: "idle" | "running" | "done";
  sunProgress: number;
  ghostGap: number;
  locked: Map<string, DayPlan>;
  drafts: Map<string, ShiftDraft>;
  verdicts: Map<string, EvalResult[]>;
  calendar: CalendarEvent[];
  readiness: MeetingReadiness[];
  citations: Citation[];
  activeLabel?: string;
  activeAgent?: AgentId;
  ics?: string;
}

/**
 * The three deep-dive lenses (globe, 24h swimlane, week calendar), split out
 * of TripSetupScreen so `page.tsx` can render them outside the setup surface.
 *
 * On the Calm rung this stays hidden: the timeline is the whole story, and a
 * globe animation above it competes with the one thing to do now. It appears
 * only at `?depth=guided`, which is the rung that asks for the mechanism.
 */
export function DeepDiveVisuals({
  trip,
  phase,
  sunProgress,
  ghostGap,
  locked,
  drafts,
  verdicts,
  calendar,
  readiness,
  citations,
  activeLabel,
  activeAgent,
  ics,
}: DeepDiveVisualsProps) {
  const [visualExplorer, setVisualExplorer] = useState<Explorer>("none");

  return (
    <div
      className="card rise"
      style={{ marginTop: "16px", animationDelay: ".6s" }}
    >
      <h3>Deep-Dive Visuals</h3>
      <div className="ex">
        {(
          [
            { id: "none", label: "Hidden" },
            { id: "globe", label: "Globe & Daylight" },
            { id: "swimlane", label: "24h Swimlane" },
            { id: "calendar", label: "Week Calendar" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setVisualExplorer(tab.id)}
            className={`chip ${visualExplorer === tab.id ? "on" : ""}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {visualExplorer === "globe" && (
        <div className="mt-4 h-[340px] overflow-hidden rounded-2xl border border-[#e3d5c3] bg-[#07090f]">
          <WorldLens
            trip={trip}
            progress={sunProgress}
            lockedLabels={new Set(locked.keys())}
            activeLabel={activeLabel}
            citationCount={citations.length}
            running={phase === "running"}
            ghostGap={ghostGap}
          />
        </div>
      )}

      {visualExplorer === "swimlane" && trip && (
        <div className="mt-4 min-h-[360px] overflow-hidden rounded-2xl border border-[#e3d5c3] bg-[#07090f] p-2 text-[#e8eaf2]">
          <ShiftBoard
            days={trip.days}
            drafts={drafts}
            verdicts={verdicts}
            locked={locked}
            activeLabel={activeLabel}
            activeAgent={activeAgent}
          />
        </div>
      )}

      {visualExplorer === "calendar" && trip && (
        <div className="mt-4 h-[420px] overflow-hidden rounded-2xl border border-[#e3d5c3] bg-[#07090f] p-2 text-[#e8eaf2]">
          <CalendarLens
            days={trip.days}
            events={calendar}
            readiness={readiness}
            ics={ics}
          />
        </div>
      )}
    </div>
  );
}