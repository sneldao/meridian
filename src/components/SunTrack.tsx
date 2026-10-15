"use client";

import { motion } from "framer-motion";
import type { DaySpec } from "@/domain/types";

// The hero scene: two suns on an arc — London's (behind, cool) and Tokyo's
// (ahead, warm). Your body-clock sun is dragged east as days lock.

const P0 = { x: 70, y: 340 };
const C = { x: 500, y: 70 };
const P1 = { x: 930, y: 340 };

const arcPoint = (t: number) => ({
  x: (1 - t) ** 2 * P0.x + 2 * (1 - t) * t * C.x + t ** 2 * P1.x,
  y: (1 - t) ** 2 * P0.y + 2 * (1 - t) * t * C.y + t ** 2 * P1.y,
});

interface Props {
  progress: number; // 0..1 — fraction of required shift locked
  days: DaySpec[];
  lockedLabels: Set<string>;
  activeLabel?: string;
  citationCount: number;
  running: boolean;
}

export function SunTrack({ progress, days, lockedLabels, activeLabel, citationCount, running }: Props) {
  const body = arcPoint(progress);
  const origin = arcPoint(0);
  const dest = arcPoint(1);
  const trail = [0.07, 0.15, 0.24]
    .map((d) => (progress - d > 0 ? arcPoint(progress - d) : null))
    .filter(Boolean) as { x: number; y: number }[];

  const citationSlots = [0.16, 0.34, 0.52, 0.7, 0.86];

  return (
    <div className="relative h-full w-full">
      <svg viewBox="0 0 1000 430" className="h-full w-full">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0c1018" />
            <stop offset="60%" stopColor="#0e1322" />
            <stop offset="100%" stopColor="#1a1626" />
          </linearGradient>
          <radialGradient id="bodyGlow">
            <stop offset="0%" stopColor="#ffd98a" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffd98a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="destGlow">
            <stop offset="0%" stopColor="#ffc46b" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffc46b" stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="1000" height="430" fill="url(#sky)" rx="18" />

        {/* stars */}
        {[
          [140, 70], [230, 120], [320, 55], [430, 95], [560, 45], [660, 110],
          [760, 60], [850, 105], [910, 50], [180, 160], [490, 140], [700, 160],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.6 : 1} fill="#e8eaf2" opacity={0.18 + (i % 4) * 0.06} />
        ))}

        {/* the arc */}
        <path
          d={`M ${P0.x} ${P0.y} Q ${C.x} ${C.y} ${P1.x} ${P1.y}`}
          fill="none"
          stroke="#1e2637"
          strokeWidth="1.5"
          strokeDasharray="3 7"
        />

        {/* horizon */}
        <line x1="40" y1="360" x2="960" y2="360" stroke="#1e2637" strokeWidth="1" />

        {/* destination halo */}
        <circle cx={dest.x} cy={dest.y} r="90" fill="url(#destGlow)" />

        {/* origin sun — where you are */}
        <circle cx={origin.x} cy={origin.y} r="13" fill="#9db8ff" opacity="0.85" />
        <text x={origin.x} y={origin.y + 42} textAnchor="middle" fill="#9db8ff" fontSize="13" fontWeight="600" letterSpacing="2">
          LHR
        </text>
        <text x={origin.x} y={origin.y + 58} textAnchor="middle" fill="#8b93a7" fontSize="10">
          London · UTC+0
        </text>

        {/* destination sun — where you're going */}
        <circle cx={dest.x} cy={dest.y} r="20" fill="#ffc46b" opacity="0.95" />
        <text x={dest.x} y={dest.y + 46} textAnchor="middle" fill="#ffc46b" fontSize="13" fontWeight="600" letterSpacing="2">
          HND
        </text>
        <text x={dest.x} y={dest.y + 62} textAnchor="middle" fill="#8b93a7" fontSize="10">
          Tokyo · UTC+9
        </text>

        {/* citation pins along the arc */}
        {Array.from({ length: Math.min(citationCount, citationSlots.length) }).map((_, i) => {
          const p = arcPoint(citationSlots[i]);
          return (
            <motion.rect
              key={i}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 0.9, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
              x={p.x - 4}
              y={p.y - 4}
              width="8"
              height="8"
              rx="1.5"
              fill="#b8e356"
              transform={`rotate(45 ${p.x} ${p.y})`}
            />
          );
        })}

        {/* trail */}
        {trail.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={10 - i * 2.5} fill="#ffd98a" opacity={0.1 + i * 0.04} />
        ))}

        {/* body-clock sun */}
        <motion.circle
          r="30"
          fill="url(#bodyGlow)"
          initial={false}
          animate={{ cx: body.x, cy: body.y }}
          transition={{ type: "spring", stiffness: 50, damping: 14 }}
        />
        <motion.circle
          r="15"
          fill="#ffd98a"
          stroke="#fff3d6"
          strokeWidth="1.5"
          initial={false}
          animate={{ cx: body.x, cy: body.y }}
          transition={{ type: "spring", stiffness: 50, damping: 14 }}
        />

        {/* day ticks */}
        {days.map((d, i) => {
          const x = 70 + (i * 860) / Math.max(1, days.length - 1);
          const locked = lockedLabels.has(d.label);
          const active = d.label === activeLabel;
          return (
            <g key={d.dayIndex}>
              <motion.circle
                cx={x}
                cy="396"
                r={active ? 7 : 5}
                initial={false}
                animate={{
                  fill: locked ? "#b8e356" : active ? "#ffc46b" : "#1e2637",
                  scale: active ? [1, 1.25, 1] : 1,
                }}
                transition={active ? { repeat: Infinity, duration: 1.2 } : { type: "spring" }}
              />
              <text
                x={x}
                y={420}
                textAnchor="middle"
                fontSize="10"
                fill={locked ? "#b8e356" : active ? "#ffc46b" : "#8b93a7"}
                fontWeight={locked || active ? 700 : 400}
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* progress readout */}
      <div className="absolute top-4 right-5 text-right">
        <div className="font-mono2 text-2xl font-semibold text-[#ffd98a]">
          {Math.round(progress * 100)}%
        </div>
        <div className="text-[10px] tracking-widest text-[#8b93a7] uppercase">
          across the dateline
        </div>
      </div>

      {running && (
        <div className="absolute top-4 left-5 flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#b8e356] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[#b8e356]" />
          </span>
          <span className="text-[10px] tracking-widest text-[#8b93a7] uppercase">night shift · live</span>
        </div>
      )}
    </div>
  );
}
