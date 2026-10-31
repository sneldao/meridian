"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import {
  defaultDayCardOptions,
  publicDayCard,
  snapshotDayCard,
  type DayCardOptions,
  type DayCardSnapshot,
} from "@/lib/day-card";
import { dayCardSvg } from "@/lib/day-card-svg";
import { downloadDayCard } from "@/lib/download-day-card";
import type { DaySceneModel } from "@/domain/day-scene";
import styles from "@/components/DayCardShare.module.css";

export type DayCardShareProps = { scene: DaySceneModel } & NonNullable<Parameters<typeof snapshotDayCard>[1]>;

const STORY_CHAPTERS = ["Moment", "Light", "Taste"] as const;

export function DayCardShare(props: DayCardShareProps) {
  const { scene, ...source } = props;
  const [snapshot, setSnapshot] = useState<DayCardSnapshot | null>(null);
  const [options, setOptions] = useState<DayCardOptions | null>(null);
  const [section, setSection] = useState<0 | 1 | 2 | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const generationRef = useRef(0);
  const uid = useId();
  const reduced = useReducedMotion();

  const open = () => {
    const snap = snapshotDayCard(scene, source);
    setSnapshot(snap);
    setOptions(defaultDayCardOptions(snap));
    setSection(undefined);
    setError(null);
    setPending(false);
    setPlaying(false);
    generationRef.current += 1;
  };

  const closeDialog = () => {
    setSnapshot(null);
    setOptions(null);
    setPlaying(false);
    setError(null);
    setPending(false);
    generationRef.current += 1;
    const dialog = dialogRef.current;
    if (dialog?.open && typeof dialog.close === "function") dialog.close();
    else dialog?.removeAttribute("open");
    triggerRef.current?.focus();
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (snapshot && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute("open", "");
      }
    }
    if (!snapshot && dialog.open && typeof dialog.close === "function") dialog.close();
  }, [snapshot]);

  const card = useMemo(
    () => (snapshot && options ? publicDayCard(snapshot, options) : null),
    [snapshot, options],
  );
  const svg = card ? dayCardSvg(card, section) : null;

  useEffect(() => {
    if (!playing || reduced || section === undefined) return;
    const t = setTimeout(() => {
      if (section >= 2) {
        setPlaying(false);
        return;
      }
      setSection((section + 1) as 0 | 1 | 2);
    }, 2300);
    return () => clearTimeout(t);
  }, [playing, reduced, section]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const toggle = (key: keyof DayCardOptions) => {
    setOptions((o) => (o ? { ...o, [key]: !o[key] } : o));
    setPlaying(false);
  };

  const exportCard = async (format: "png" | "svg") => {
    if (!card) return;
    setPending(true);
    setError(null);
    const generation = generationRef.current;
    try {
      await downloadDayCard(card, section, format);
    } catch {
      if (generation === generationRef.current) setError("Could not create the image. Try the SVG download.");
    } finally {
      if (generation === generationRef.current) setPending(false);
    }
  };

  return (
    <div className="day-card">
      <button type="button" ref={triggerRef} className="day-card-trigger" onClick={open}>
        Make a day card
      </button>
      <dialog
        ref={dialogRef}
        className={`day-card-dialog ${styles.dialog}`}
        onClose={() => { if (snapshot) closeDialog(); }}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); closeDialog(); } }}
        aria-labelledby={`${uid}-heading`}
      >
        {snapshot && card && (
          <>
            <h2 id={`${uid}-heading`}>Your planned day, on one card.</h2>
            <div className="day-card-layout">
              <div>
                <fieldset className="day-card-options">
                  <label>
                    <input type="checkbox" checked={options!.includeSchedule} onChange={() => toggle("includeSchedule")} />
                    Include date and light-window times
                  </label>
                  <label>
                    <input type="checkbox" checked={options!.includeEvent} onChange={() => toggle("includeEvent")} />
                    Include event title and time
                  </label>
                  <label>
                    <input type="checkbox" checked={options!.includeBodyTime} onChange={() => toggle("includeBodyTime")} />
                    Include modeled event body time
                  </label>
                  <label>
                    <input type="checkbox" checked={options!.includeTaste} onChange={() => toggle("includeTaste")} />
                    Include favorites and place names
                  </label>
                </fieldset>
                <p>Details stay hidden until you include them. Nothing is posted automatically.</p>
                <div className="day-card-actions" role="group" aria-label="Card views">
                  <button type="button" aria-pressed={section === undefined} onClick={() => { setSection(undefined); setPlaying(false); }}>
                    Day card
                  </button>
                  <button type="button" aria-pressed={section !== undefined} onClick={() => { setSection(0); setPlaying(false); }}>
                    Vertical story
                  </button>
                </div>
                {section !== undefined && (
                  <div className="day-card-actions" role="group" aria-label="Story chapters">
                    {STORY_CHAPTERS.map((name, i) => (
                      <button key={name} type="button" aria-pressed={section === i} onClick={() => { setSection(i as 0 | 1 | 2); setPlaying(false); }}>
                        {name}
                      </button>
                    ))}
                    <button type="button" disabled={section === 0} onClick={() => { setPlaying(false); setSection((section - 1) as 0 | 1 | 2); }}>
                      Previous
                    </button>
                    <button type="button" disabled={section === 2} onClick={() => { setPlaying(false); setSection((section + 1) as 0 | 1 | 2); }}>
                      Next
                    </button>
                    <button type="button" aria-pressed={playing} disabled={!!reduced} onClick={() => { if (!playing) setSection(0); setPlaying(!playing); }}>
                      {playing ? "Pause story" : "Play story"}
                    </button>
                  </div>
                )}
                {section !== undefined && (
                  <p>Story view for screen recording. Downloads are still images.</p>
                )}
                <div className="day-card-actions">
                  <button type="button" disabled={pending} onClick={() => exportCard("png")}>Download PNG</button>
                  <button type="button" disabled={pending} onClick={() => exportCard("svg")}>Download SVG</button>
                  <button type="button" onClick={closeDialog}>Close</button>
                </div>
                {pending && <p role="status">Preparing image…</p>}
                {error && <p role="alert">{error}</p>}
              </div>
              <div className="day-card-preview">
                <AnimatePresence initial={false} mode="wait">
                  {svg && (
                    <motion.div
                      key={section === undefined ? "card" : `story-${section}`}
                      initial={reduced ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={reduced ? { opacity: 1 } : { opacity: 0 }}
                      transition={{ duration: reduced ? 0 : 0.18 }}
                      style={{ display: "flex", justifyContent: "center", minWidth: 0, maxWidth: "100%" }}
                    >
                  <Image
                    unoptimized
                    width={1080}
                    height={1920}
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
                    alt={`Meridian planned day card for ${card.city}`}
                  />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <details>
              <summary>Read shared text</summary>
              {(section === undefined ? card.sections : [card.sections[section]]).map((s) => (
                <div key={s.eyebrow}>
                  <p><strong>{s.eyebrow}</strong> {s.title}</p>
                  <p>{s.lines.join(" · ")}</p>
                </div>
              ))}
              {card.notices.map((n, i) => <p key={i}>{n}</p>)}
            </details>
          </>
        )}
      </dialog>
    </div>
  );
}
