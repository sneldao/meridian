"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import type { InsightCardModel, InsightViz } from "@/domain/insights";
import type { CrewAnswer } from "@/domain/crew-answer";
import type { AgentId } from "@/domain/types";
import { CrewAsk } from "@/components/CrewAsk";

/* InsightCards (docs/plan/agent-native.md step 6) — a small carousel of
 * crew findings in the `next` room's slab: "Insights {N} ‹ ›" paging one
 * card at a time, each card one prose line, one mini visual, one action
 * pill. All facts arrive pre-computed from src/domain/insights.ts — this
 * component only draws them.
 *
 * No autoplay: the reference's autoplay-yields rule means ours is static
 * and user-driven, so there is no motion to stand down — reduced motion
 * shows the same settled card. All geometry is SVG attributes and CSS
 * classes; nothing inline, nothing animated. */

const CURVE_W = 140;
const CURVE_H = 48;
const STRIP_W = 140;
const STRIP_H = 24;

/** The required-shift curve: cumulative banked shift over the trip's days
 *  as a polyline against a dashed "owed" line. The numbers are already in
 *  the card's prose, so the figure is decorative (aria-hidden). */
function ShiftCurve({ viz }: { viz: Extract<InsightViz, { type: "shift-curve" }> }) {
  const padX = 4;
  const padY = 7;
  const req = Math.max(1, viz.requiredMin);
  const span = Math.max(1, viz.days - 1);
  const x = (dayIndex: number) => padX + (dayIndex / span) * (CURVE_W - padX * 2);
  const y = (bankedMin: number) =>
    CURVE_H - padY - (Math.max(0, bankedMin) / req) * (CURVE_H - padY * 2);
  const pts = viz.points.map((p) => `${x(p.dayIndex)},${y(p.bankedMin)}`);
  return (
    <svg
      className="insight-curve"
      viewBox={`0 0 ${CURVE_W} ${CURVE_H}`}
      width={CURVE_W}
      height={CURVE_H}
      aria-hidden="true"
    >
      {/* the owed line — what the trip still has to cover */}
      <line
        className="insight-curve-req"
        x1={padX}
        y1={y(req)}
        x2={CURVE_W - padX}
        y2={y(req)}
      />
      {pts.length > 0 && (
        <polyline
          className="insight-curve-line"
          points={pts.join(" ")}
        />
      )}
      {viz.points.map((p) => (
        <circle
          key={p.dayIndex}
          className="insight-curve-dot"
          cx={x(p.dayIndex)}
          cy={y(p.bankedMin)}
          r={2.2}
        />
      ))}
    </svg>
  );
}

/** The flagged day's 00–24 strip — the .tl-sky idiom reduced to mono: tick
 *  marks, the day's windows as bands, the conflicting window hatched. */
function DayStrip({ viz }: { viz: Extract<InsightViz, { type: "day-strip" }> }) {
  const bandY = 7;
  const bandH = 11;
  const px = (m: number) => (m / 1440) * STRIP_W;
  /* Split windows at midnight — the same wrap convention the sky strip uses. */
  const segs = (w: { startMin: number; endMin: number }) => {
    const s = ((w.startMin % 1440) + 1440) % 1440;
    let e = w.endMin;
    if (e <= s) e += 1440;
    const out = [{ s, e: Math.min(e, 1440) }];
    if (e > 1440) out.push({ s: 0, e: e - 1440 });
    return out;
  };
  const flagSegs = viz.flag ? segs(viz.flag) : [];
  return (
    <svg
      className="insight-strip"
      viewBox={`0 0 ${STRIP_W} ${STRIP_H}`}
      width={STRIP_W}
      height={STRIP_H}
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="insight-hatch"
          width="4"
          height="4"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line className="insight-strip-hatchline" x1="0" y1="0" x2="0" y2="4" />
        </pattern>
      </defs>
      <line className="insight-strip-base" x1="0" y1={bandY + bandH + 3} x2={STRIP_W} y2={bandY + bandH + 3} />
      {[6, 12, 18].map((h) => (
        <line
          key={h}
          className="insight-strip-tick"
          x1={px(h * 60)}
          y1={bandY + bandH + 1}
          x2={px(h * 60)}
          y2={bandY + bandH + 5}
        />
      ))}
      {viz.windows.flatMap((w, i) =>
        segs(w).map((seg, j) => (
          <rect
            key={`${i}-${j}`}
            className="insight-strip-win"
            x={px(seg.s)}
            y={bandY}
            width={Math.max(1.5, px(seg.e - seg.s))}
            height={bandH}
            rx={2.5}
          />
        )),
      )}
      {flagSegs.map((seg, i) => (
        <g key={i}>
          <rect
            className="insight-strip-flag"
            x={px(seg.s)}
            y={bandY}
            width={Math.max(1.5, px(seg.e - seg.s))}
            height={bandH}
            rx={2.5}
            fill="url(#insight-hatch)"
          />
          <rect
            className="insight-strip-flag-edge"
            x={px(seg.s)}
            y={bandY}
            width={Math.max(1.5, px(seg.e - seg.s))}
            height={bandH}
            rx={2.5}
          />
        </g>
      ))}
    </svg>
  );
}

function CardViz({ viz }: { viz: InsightViz }) {
  if (viz.type === "shift-curve") return <ShiftCurve viz={viz} />;
  if (viz.type === "day-strip") return <DayStrip viz={viz} />;
  return (
    <p className="insight-pin">
      <MapPin size={13} className="insight-pin-ic" aria-hidden="true" />
      <span>{viz.label}</span>
    </p>
  );
}

/** The ask field's wiring for one card (§4a step 2): the surface binds the
 *  card's own finding as router context — a bare "why" quotes the prose the
 *  card already shows — and hands over the CrewFacts JSON the LLM lane
 *  grounds on. */
export interface InsightAskFor {
  label: string;
  owner?: string;
  agent?: AgentId | null;
  facts?: unknown;
  onAsk: (question: string) => CrewAnswer;
}

/** One card of the carousel — keyed by card id at the call site, so its
 *  ask fold resets when the page turns. The named agent in the prose is
 *  the button ("Iris flagged…" → Iris); a card whose owner isn't named
 *  (the gap read) gets a small "Ask {owner}" chip under the action. */
function InsightCard({
  card,
  onSelectDay,
  ask,
  live,
}: {
  card: InsightCardModel;
  onSelectDay?: (label: string) => void;
  ask?: InsightAskFor | null;
  live?: boolean;
}) {
  const [askOpen, setAskOpen] = useState(false);
  const name = card.agent?.owner;
  const nameAt = ask && name ? card.prose.indexOf(name) : -1;
  const toggle = () => setAskOpen((v) => !v);
  return (
    <>
      <p className="insight-prose">
        {nameAt >= 0 ? (
          <>
            {card.prose.slice(0, nameAt)}
            <button
              type="button"
              className="insight-agent"
              aria-expanded={askOpen}
              onClick={toggle}
            >
              {name}
            </button>
            {card.prose.slice(nameAt + name!.length)}
          </>
        ) : (
          card.prose
        )}
        {card.tag ? <span className="insight-tag">{card.tag}</span> : null}
      </p>
      <CardViz viz={card.viz} />
      {card.action && onSelectDay && (
        <button
          type="button"
          className="insight-action"
          onClick={() => onSelectDay(card.action!.dayLabel)}
        >
          {card.action.label}
        </button>
      )}
      {ask && nameAt < 0 && (
        <button
          type="button"
          className="insight-ask"
          aria-expanded={askOpen}
          onClick={toggle}
        >
          Ask {ask.owner ?? "the crew"}
        </button>
      )}
      {ask && askOpen && (
        <CrewAsk
          label={ask.label}
          placeholder="why?"
          owner={ask.owner}
          agent={ask.agent}
          live={live}
          facts={ask.facts}
          onAsk={ask.onAsk}
        />
      )}
    </>
  );
}

export function InsightCards({
  cards,
  onSelectDay,
  askFor,
  live,
}: {
  cards: InsightCardModel[];
  onSelectDay?: (label: string) => void;
  /** §4a — per-card ask wiring. Absent → the names stay plain text and no
   *  card opens a field (presentational default). */
  askFor?: (card: InsightCardModel) => InsightAskFor | null;
  /** The open-question lane — forwarded to each card's CrewAsk. */
  live?: boolean;
}) {
  const [i, setI] = useState(0);
  if (!cards.length) return null;
  /* Wrap-around paging — the index lives past both ends and lands mod N. */
  const idx = ((i % cards.length) + cards.length) % cards.length;
  const card = cards[idx];
  return (
    <section className="insight rise" aria-label="Crew insights">
      <div className="insight-head">
        <span className="insight-count">Insights {cards.length}</span>
        {cards.length > 1 && (
          <span className="insight-pager">
            <button
              type="button"
              className="insight-step"
              aria-label="Previous insight"
              onClick={() => setI((v) => v - 1)}
            >
              ‹
            </button>
            <button
              type="button"
              className="insight-step"
              aria-label="Next insight"
              onClick={() => setI((v) => v + 1)}
            >
              ›
            </button>
          </span>
        )}
      </div>
      <div className="insight-card" key={card.id} aria-live="polite">
        <InsightCard
          card={card}
          onSelectDay={onSelectDay}
          ask={card.agent ? askFor?.(card) : null}
          live={live}
        />
      </div>
    </section>
  );
}
