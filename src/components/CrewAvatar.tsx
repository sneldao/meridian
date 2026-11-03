import { CREW } from "@/agents/crew";
import { CREW_STATE_CUE } from "@/domain/motion-cues";
import type { AgentId } from "@/domain/types";

/* The crew as celestial bodies (round 31). Each agent is one bounded glyph —
 * crescent, star, crowned sun, eclipse eye, comet — distinguishable in
 * monochrome at 24px, drawn without lids or a mouth (those belong to the
 * traveller, SunSelf). Personality lives in the pose, not in invented data:
 * six states, each a distinct static figure that CSS animates between
 * (transform/opacity only, per-agent timing tokens). Colours come from the
 * --agent-* tokens in globals.css so this file carries zero hex and zero
 * inline styles; the gaze is an SVG transform attribute. */

export type CrewAvatarState =
  | "resting"
  | "attentive"
  | "working"
  | "explaining"
  | "concerned"
  | "complete";

export interface CrewAvatarProps {
  id: AgentId;
  state?: CrewAvatarState;
  size?: number;
  /** -1..1: where the avatar is looking (pupil/lens offset); default 0 */
  gaze?: number;
  /** aria-hidden instead of role=img */
  decorative?: boolean;
  className?: string;
  /** Read secondary motion from CSS custom properties (--av-v, --av-gaze)
   *  the parent writes — the avatar moves without re-rendering. */
  motionVar?: boolean;
}

const STATE_WORD: Record<CrewAvatarState, string> = {
  resting: "resting",
  attentive: "attentive",
  working: "working",
  explaining: "explaining",
  concerned: "checking a conflict",
  complete: "done",
};

function AgentGlyph({ id, gazeX }: { id: AgentId; gazeX: number }) {
  const eyes = (cy: number, xs: number[], r = 1.6) => (
    <g className="ca-gaze" transform={`translate(${gazeX} 0)`}>
      {xs.map((x) => (
        <g key={x} className="ca-eye-wrap" transform={`translate(${x} ${cy})`}>
          <circle className="ca-eye" r={r} />
          <path className="ca-eye-arc" d={`M ${-r - 0.6} 0 A ${r + 0.6} ${r + 0.6} 0 0 1 ${r + 0.6} 0`} />
        </g>
      ))}
    </g>
  );

  switch (id) {
    case "analyst":
      /* Mara — the crescent, one calm eye on the inner curve. The `.ca-fill`
       * disc sits in the bite, invisible until the complete state tips her
       * into a near-full moon; the glint lights her upper horn when she
       * explains. */
      return (
        <g className="ca-body">
          <circle className="ca-fill" cx={29} cy={24} r={12.8} />
          <path
            className="ca-shape"
            fillRule="evenodd"
            d="M 20 7 A 17 17 0 1 0 20 41 A 17 17 0 1 0 20 7 Z M 29 11 A 13.5 13.5 0 1 1 29 37 A 13.5 13.5 0 1 1 29 11 Z"
          />
          {eyes(18, [19], 1.7)}
          <circle className="ca-glint" cx={30} cy={9.5} r={1.4} />
        </g>
      );
    case "researcher":
      /* Jun — the lensed star, a four-point spark with an offset lens. */
      return (
        <g className="ca-body">
          <path
            className="ca-shape"
            d="M 24 6 L 30 18 L 42 24 L 30 30 L 24 42 L 18 30 L 6 24 L 18 18 Z"
          />
          <g className="ca-gaze" transform={`translate(${gazeX} 0)`}>
            <circle className="ca-lens" cx={30} cy={20} r={6.5} />
            <g className="ca-eye-wrap" transform="translate(30 20)">
              <circle className="ca-eye" r={2.2} />
              <path className="ca-eye-arc" d="M -2.8 0 A 2.8 2.8 0 0 1 2.8 0" />
            </g>
          </g>
          <path
            className="ca-spark"
            d="M 24 19.5 L 25.3 22.7 L 28.5 24 L 25.3 25.3 L 24 28.5 L 22.7 25.3 L 19.5 24 L 22.7 22.7 Z"
          />
          <circle className="ca-glint" cx={33.5} cy={16.5} r={1.4} />
        </g>
      );
    case "planner":
      /* Otto — the compact crowned sun, eight square-cap rays, two dot eyes. */
      return (
        <g className="ca-body">
          <g className="ca-rays">
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <line
                key={deg}
                className="ca-ray"
                x1={24}
                y1={8}
                x2={24}
                y2={13.5}
                transform={`rotate(${deg} 24 24)`}
              />
            ))}
          </g>
          <circle className="ca-shape" cx={24} cy={24} r={11.5} />
          {eyes(23, [19.5, 28.5], 1.7)}
          <circle className="ca-glint" cx={28} cy={19} r={1.6} />
        </g>
      );
    case "evaluator":
      /* Iris — the eclipse eye: a dark disc, a bright corona ring, an iris. */
      return (
        <g className="ca-body">
          <circle className="ca-corona" cx={24} cy={24} r={15.5} />
          <circle className="ca-shape" cx={24} cy={24} r={12.5} />
          <g className="ca-gaze" transform={`translate(${gazeX} 0)`}>
            <circle className="ca-iris-ring" cx={24} cy={24} r={7} />
            <g className="ca-eye-wrap" transform="translate(24 24)">
              <circle className="ca-eye ca-pupil" r={3} />
              <path className="ca-eye-arc" d="M -3.7 0 A 3.7 3.7 0 0 1 3.7 0" />
            </g>
          </g>
          <line className="ca-scan" x1={10} y1={24} x2={38} y2={24} />
        </g>
      );
    case "negotiator":
      /* Rex — the comet: a head and two tapered tail strokes, always moving. */
      return (
        <g className="ca-body">
          <path
            className="ca-tail ca-tail-1"
            d="M 20 20 Q 10 16 4 10 Q 11 18 20 24 Z"
          />
          <path
            className="ca-tail ca-tail-2"
            d="M 20 27 Q 9 27 3 24 Q 10 30 20 30 Z"
          />
          <path
            className="ca-tail ca-tail-3"
            d="M 21 31 Q 12 36 6 40 Q 13 33 22 29 Z"
          />
          <circle className="ca-shape" cx={27} cy={24} r={9.5} />
          {eyes(23, [30], 1.7)}
        </g>
      );
  }
}

export function CrewAvatar({
  id,
  state = "resting",
  size = 40,
  gaze = 0,
  decorative = false,
  className,
  motionVar = false,
}: CrewAvatarProps) {
  const member = CREW[id];
  const gazeX = Math.max(-1, Math.min(1, gaze)) * 2;
  // The pose says what the agent is doing; the shared table says how that
  // reads as one of the four cues. CSS animates the cue, never a private one.
  const cue = CREW_STATE_CUE[state];
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={`crew-avatar crew-avatar-${id}${motionVar ? " ca-var" : ""}${className ? ` ${className}` : ""}`}
      data-agent={id}
      data-state={state}
      data-cue={cue}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": `${member.name}, ${member.title} — ${STATE_WORD[state]}` })}
    >
      <AgentGlyph id={id} gazeX={gazeX} />
    </svg>
  );
}
