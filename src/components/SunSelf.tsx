"use client";

import { useEffect, useRef, useState } from "react";
import { SUN_CUE } from "@/domain/motion-cues";
import { sunSelfMoodWord, type SunSelfRead } from "@/domain/sun-self";

/* The sun-self glyph (round 23): the dial's sun stepped off the ring, with
 * eyelids. One procedural SVG — no assets, no likeness, every feature of the
 * face an attribute computed from a SunSelfRead. Colours live in CSS (the
 * design contract keeps this file hex-free); motion stays in the language:
 * the pulse is transform-only, plays on mount, and replays whenever the
 * caller changes the key — no state machinery, just a remount.
 *
 * Rapport layers (round 48): `vt` gives the glyph a shared view-transition
 * name so the same sun morphs between pages instead of reprinting; `follow`
 * lets the face lean toward the pointer through a transform channel;
 * `speak` makes a tap lift the line it is allowed to say; `wake` plays a
 * small arrival so the creature notices you came back. */

export interface SunSelfProps {
  read: SunSelfRead;
  size?: number;
  /** paper = cream surfaces; ink = the stage's night sky. */
  tone?: "paper" | "ink";
  /** Change the key to replay the one-shot glow pulse — the immediate
   *  visible response (Finch's lesson) whenever the trip genuinely moves. */
  pulseKey?: string | number | null;
  className?: string;
  /** One per page — the shared element that carries the sun between routes. */
  vt?: boolean;
  /** The face leans toward the pointer. Stands down under reduced-motion. */
  follow?: boolean;
  /** A tap plays the pulse and lifts the read's one-liner for a beat. */
  speak?: boolean;
  /** Play the small arrival — used where the sun should notice you came back. */
  wake?: boolean;
}

/* Direct DOM writes, not state — a pointer-follow that re-rendered per
 *  mousemove would cost more than it gives back, and the glyph keeps its
 *  zero-inline-style contract. */
function useFaceFollow(
  wrapRef: React.RefObject<HTMLSpanElement | null>,
  faceRef: React.RefObject<SVGGElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const onMove = (e: MouseEvent) => {
      const r = wrapRef.current?.getBoundingClientRect();
      const face = faceRef.current;
      if (!r || !face) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const m = Math.min(1, d / 160);
      face.style.transform = `translate(${(dx / d) * m * 3}px, ${(dy / d) * m * 2}px)`;
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [wrapRef, faceRef, enabled]);
}

export function SunSelf({
  read,
  size = 96,
  tone = "paper",
  pulseKey = null,
  className = "",
  vt = false,
  follow = false,
  speak = false,
  wake = false,
}: SunSelfProps) {
  const wrapRef = useRef<HTMLSpanElement>(null);
  const faceRef = useRef<SVGGElement>(null);
  useFaceFollow(wrapRef, faceRef, follow);
  const [pet, setPet] = useState(0);
  const [showLine, setShowLine] = useState(false);

  const rays = Array.from({ length: read.rayCount }, (_, i) => i);
  // Lids: the ellipse thins as debt grows; below a threshold we draw the
  // closed lid — a gentle arc, never a grimace.
  const ry = Math.max(0.5, 4.2 * (1 - read.lid));
  const closed = ry < 1.15;
  const smile =
    read.mood === "adjusted" ? 3.2 : read.mood === "half-lit" ? 2.4 : read.mood === "lifting" ? 1.4 : 0.4;
  const label = `Your meridian — ${sunSelfMoodWord(read.mood)} — ${read.line}`;

  return (
    <span
      ref={wrapRef}
      data-cue={SUN_CUE[read.mood]}
      className={`sunself-wrap${speak ? " speaks" : ""}${vt ? " sunself-vt" : ""}${className ? ` ${className}` : ""}`}
      onClick={
        speak
          ? () => {
              setPet((n) => n + 1);
              setShowLine(true);
              window.setTimeout(() => setShowLine(false), 2600);
            }
          : undefined
      }
      role={speak ? "button" : undefined}
      tabIndex={speak ? 0 : undefined}
    >
      <svg
        key={`${pulseKey ?? "x"}-${pet}`}
        viewBox="0 0 120 120"
        width={size}
        height={size}
        role="img"
        aria-label={label}
        className={`sunself sunself-${tone}${pulseKey !== null || pet > 0 ? " enter" : ""}${wake ? " wake" : ""}`}
      >
        <g transform={`rotate(${read.tiltDeg} 60 60)`}>
          {/* Twelve rays — the dial's tick family. Locked days light them. */}
          {rays.map((i) => (
            <line
              key={i}
              x1="60"
              y1="10"
              x2="60"
              y2="18"
              className={i < read.raysLit ? "sunself-ray lit" : "sunself-ray dim"}
              transform={`rotate(${i * 30} 60 60)`}
            />
          ))}
          <circle cx="60" cy="60" r="40" className="sunself-halo" opacity={0.12 + read.glow * 0.5} />
          <circle cx="60" cy="60" r="30" className="sunself-disc" />
          <g className="sunself-face" ref={faceRef}>
            {closed ? (
              <>
                <path d="M 44 56 Q 48 59.5 52 56" className="sunself-lid" />
                <path d="M 68 56 Q 72 59.5 76 56" className="sunself-lid" />
              </>
            ) : (
              <>
                <ellipse cx="48" cy="56" rx="3.4" ry={ry} className="sunself-eye" />
                <ellipse cx="72" cy="56" rx="3.4" ry={ry} className="sunself-eye" />
              </>
            )}
            <path d={`M 53 71 Q 60 ${71 + smile} 67 71`} className="sunself-mouth" />
          </g>
        </g>
      </svg>
      {speak && showLine && <span className="sunself-line">{read.line}</span>}
    </span>
  );
}
