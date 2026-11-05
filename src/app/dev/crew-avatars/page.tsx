import { notFound } from "next/navigation";
import { CrewAvatar, type CrewAvatarState } from "@/components/CrewAvatar";
import { CREW } from "@/agents/crew";
import type { AgentId } from "@/domain/types";

/* Dev character sheet for the round-31 crew avatars — every agent in every
 * state at three sizes, a monochrome row (grayscale filter; the silhouettes
 * must carry the identity) and a gaze sweep. Not linked from the app. */

const STATES: CrewAvatarState[] = [
  "resting",
  "attentive",
  "working",
  "explaining",
  "concerned",
  "complete",
];
const AGENTS: AgentId[] = ["analyst", "researcher", "planner", "evaluator", "negotiator"];
const SIZES = [24, 48, 96];

export default function DevCrewAvatars() {
  if (process.env.NODE_ENV === "production") notFound(); // internal workbench — never public
  return (
    <main className="flex min-h-screen flex-col gap-8 p-6">
      <p className="font-mono2 text-xs text-clay-2">
        crew avatars — 5 agents × 6 states × 3 sizes, monochrome + gaze rows
      </p>
      {SIZES.map((size) => (
        <section key={size} aria-label={`${size}px`}>
          <p className="font-mono2 text-xs text-clay-2">{size}px</p>
          <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: `repeat(${STATES.length + 1}, auto)` }}>
            <span />
            {STATES.map((s) => (
              <span key={s} className="font-mono2 text-xs text-clay-2">{s}</span>
            ))}
            {AGENTS.map((id) => (
              <Row key={id} id={id} size={size} />
            ))}
          </div>
        </section>
      ))}
      <section aria-label="monochrome">
        <p className="font-mono2 text-xs text-clay-2">monochrome (silhouette check, 48px)</p>
        <div className="mt-2 flex gap-6" style={{ filter: "grayscale(1)" }}>
          {AGENTS.map((id) => (
            <CrewAvatar key={id} id={id} state="attentive" size={48} />
          ))}
        </div>
      </section>
      <section aria-label="gaze">
        <p className="font-mono2 text-xs text-clay-2">gaze −1 · 0 · +1 (48px)</p>
        <div className="mt-2 flex gap-6">
          {AGENTS.map((id) => (
            <span key={id} className="flex items-center gap-2">
              <CrewAvatar id={id} state="attentive" size={48} gaze={-1} />
              <CrewAvatar id={id} state="attentive" size={48} gaze={0} />
              <CrewAvatar id={id} state="attentive" size={48} gaze={1} />
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}

function Row({ id, size }: { id: AgentId; size: number }) {
  return (
    <>
      <span className="font-mono2 text-xs text-clay">{CREW[id].name}</span>
      {STATES.map((s) => (
        <CrewAvatar key={s} id={id} state={s} size={size} />
      ))}
    </>
  );
}
