"use client";

import { sunSelfMoodWord, type SunSelfRead } from "@/domain/sun-self";

/* The sun-self glyph (round 23): the dial's sun stepped off the ring, with
 * eyelids. One procedural SVG — no assets, no likeness, every feature of the
 * face an attribute computed from a SunSelfRead. Colours live in CSS (the
 * design contract keeps this file hex-free); motion stays in the language:
 * the pulse is transform-only, plays on mount, and replays whenever the
 * caller changes the key — no state machinery, just a remount. */

export interface SunSelfProps {
  read: SunSelfRead;
  size?: number;
  /** paper = cream surfaces; ink = the stage's night sky. */
  tone?: "paper" | "ink";
  /** Change the key to replay the one-shot glow pulse — the immediate
   *  visible response (Finch's lesson) whenever the trip genuinely moves. */
  pulseKey?: string | number | null;
  className?: string;
}

export function SunSelf({
  read,
  size = 96,
  tone = "paper",
  pulseKey = null,
  className = "",
}: SunSelfProps) {
  const rays = Array.from({ length: read.rayCount }, (_, i) => i);
  // Lids: the ellipse thins as debt grows; below a threshold we draw the
  // closed lid — a gentle arc, never a grimace.
  const ry = Math.max(0.5, 4.2 * (1 - read.lid));
  const closed = ry < 1.15;
  const smile =
    read.mood === "adjusted" ? 3.2 : read.mood === "half-lit" ? 2.4 : read.mood === "lifting" ? 1.4 : 0.4;
  const label = `Your meridian — ${sunSelfMoodWord(read.mood)} — ${read.line}`;

  return (
    <svg
      key={pulseKey ?? undefined}
      viewBox="0 0 120 120"
      width={size}
      height={size}
      role="img"
      aria-label={label}
      className={`sunself sunself-${tone}${pulseKey !== null ? " enter" : ""}${className ? ` ${className}` : ""}`}
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
    </svg>
  );
}
