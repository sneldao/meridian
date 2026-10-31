"use client";

import { useRef } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from "framer-motion";

// Spike: one pinned section whose layout morphs continuously with scroll.
// Each card's x/y is interpolated from its stacked-column slot to its row slot
// as scroll progresses, so there is no snap. framer-motion only, no new
// dependency. Reduced motion shows the final row layout with no scroll link.

const DAYS = [
  { label: "Sun 18 Oct", note: "Fly · 8h ahead" },
  { label: "Mon 19 Oct", note: "Light 05:00–07:00" },
  { label: "Tue 20 Oct", note: "Last coffee 13:00" },
  { label: "Wed 21 Oct", note: "Lights down 21:00" },
];

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

const CARD_W = 180;
const CARD_H = 72;
const GAP = 16;
// Stage size fits the row layout; the column is centred inside it.
const ROW_W = DAYS.length * CARD_W + (DAYS.length - 1) * GAP;
const COL_H = DAYS.length * CARD_H + (DAYS.length - 1) * GAP;
const ROW_H = COL_H;
const COL_X = (ROW_W - CARD_W) / 2;
const ROW_Y = (ROW_H - CARD_H) / 2;

function DayCard({ label, note, progress, index }: {
  label: string;
  note: string;
  progress: MotionValue<number>;
  index: number;
}) {
  // Stacked column slot -> row slot.
  const x = useTransform(progress, [0, 1], [COL_X, index * (CARD_W + GAP)]);
  const y = useTransform(progress, [0, 1], [index * (CARD_H + GAP), ROW_Y]);
  // Cards arrive in sequence rather than all at once.
  const start = index * 0.12;
  const opacity = useTransform(progress, [start, Math.min(start + 0.3, 1)], [0.35, 1]);
  return (
    <motion.div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        x,
        y,
        opacity,
        width: CARD_W,
        height: CARD_H,
        boxSizing: "border-box",
        padding: "12px 16px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div style={{ opacity: 0.7, fontSize: 14 }}>{note}</div>
    </motion.div>
  );
}

export default function LayoutSwitchSpike() {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  // Morph across the middle of the scroll range, held at each end, with an
  // ease-in-out cubic so the cards accelerate in and settle softly.
  const linear = useTransform(scrollYProgress, [0.1, 0.8], [0, 1]);
  const scrolled = useTransform(linear, easeInOutCubic);
  const settled = useMotionValue(1);
  const progress = reduced ? settled : scrolled;

  return (
    <main style={{ background: "#0b0d12", color: "#e8e6e1", minHeight: "100vh" }}>
      <div ref={ref} style={{ height: "300vh" }}>
        <div
          style={{
            position: "sticky",
            top: 0,
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <div style={{ position: "relative", width: ROW_W, height: ROW_H }}>
            {DAYS.map((d, i) => (
              <DayCard key={d.label} label={d.label} note={d.note} progress={progress} index={i} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
