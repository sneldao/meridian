"use client";

import { ArrowUpRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { springCalendar } from "@/lib/motion";
import { fmtMin } from "@/domain/circadian";
import type { TravelerNudge } from "@/domain/nudges";
import { placeKey, placeSearchUrl, type TasteEntity, type TasteItinerary } from "@/domain/taste";
import type { resolvePlaceChoice } from "@/lib/place-choices";

export interface ArrivalDayViewProps {
  destination: string;
  date: string;
  steps: TravelerNudge[];
  idea?: ReturnType<typeof resolvePlaceChoice>;
  completedIds: Set<string>;
  skippedIds: Set<string>;
  actionsReady: boolean;
  interactive: boolean;
  onDone: (step: TravelerNudge) => void;
  onSkip: (step: TravelerNudge) => void;
  onKeep: () => void;
  onSwap: () => void;
  onDismiss: () => void;
  onRestore: () => void;
  choicesReady: boolean;
  storageAvailable: boolean;
  planning: boolean;
  example?: boolean;
  tasteFavorites?: TasteEntity[];
  favoritesChanged?: boolean;
  tasteStatus?: TasteItinerary["status"];
  onUpdatePlan?: () => void;
  updateDisabled?: boolean;
  eyebrow?: string;
}

const dayFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

export function ArrivalDayView(props: ArrivalDayViewProps) {
  const {
    destination, date, steps, idea, completedIds, skippedIds, actionsReady, interactive,
    onDone, onSkip, onKeep, onSwap, onDismiss, onRestore, choicesReady, storageAvailable, planning, example,
    tasteFavorites, favoritesChanged, tasteStatus, onUpdatePlan, updateDisabled,
  } = props;
  const snapshot = tasteFavorites ?? [];
  const reduced = useReducedMotion();
  const scope = useId();
  const stale = favoritesChanged === true;

  const active = idea && (idea.status === "suggested" || idea.status === "kept") ? idea : null;
  type Row = { kind: "step"; step: TravelerNudge } | { kind: "idea" };
  const rows: Row[] = [
    ...steps.map((step): Row => ({ kind: "step", step })),
    ...(active ? [{ kind: "idea" as const }] : []),
  ].sort((a, b) => {
    const am = a.kind === "step" ? a.step.startMin : active!.suggestion.startMin;
    const bm = b.kind === "step" ? b.step.startMin : active!.suggestion.startMin;
    return am !== bm ? am - bm : a.kind === b.kind ? 0 : a.kind === "step" ? -1 : 1;
  });

  return (
    <section className="arrival-day" aria-labelledby="arrival-day-heading">
      <p className="entry-eyebrow">{props.eyebrow ?? "After you land"}{example ? " · Example schedule" : ""}</p>
      <h2 id="arrival-day-heading">A day that feels like you.</h2>
      <p className="arrival-day-meta">
        {dayFmt.format(new Date(`${date}T00:00:00Z`))} · {destination} local time
      </p>
      {snapshot.length > 0 && (
        <p className="taste-provenance">
          {tasteStatus === "unavailable" ? "Requested favorites: " : "Qloo taste signals: "}
          {snapshot.map((f) => f.name).join(", ")}
        </p>
      )}
      {snapshot.length > 0 && (
        <ul className="taste-tokens" aria-label="Favorites used for these ideas">
          {snapshot.map((f) => (
            <li key={f.id}>
              <span className="taste-token-mark" aria-hidden="true">{f.name.slice(0, 1)}</span>
              <span>{f.name}<small>{f.type}</small></span>
            </li>
          ))}
        </ul>
      )}
      {stale && (
        <p role="status" className="taste-note">Your favorites have changed. Update your plan to use them.</p>
      )}
      {onUpdatePlan && (stale || tasteStatus === "unavailable") && (
        <p className="taste-note">
          <button type="button" className="taste-button taste-button--ghost" disabled={updateDisabled || planning} onClick={onUpdatePlan}>
            {stale ? "Update my plan" : "Retry place ideas"}
          </button>
        </p>
      )}

      <ol className="arrival-day-rows">
        {rows.map((row) => {
          if (row.kind === "idea" && active) {
            const kept = active.status === "kept";
            return (
              <motion.li
                key="place-idea"
                className="arrival-day-row arrival-day-idea"
                data-kept={kept}
                layout={reduced ? false : "position"}
                initial={false}
                transition={reduced ? { duration: 0 } : springCalendar}
              >
                <span className="arrival-day-time" aria-label={`${fmtMin(active.suggestion.startMin)} to ${fmtMin(active.suggestion.endMin)}`}>
                  <span>{fmtMin(active.suggestion.startMin)}</span>
                  <span>to</span>
                  <span>{fmtMin(active.suggestion.endMin)}</span>
                </span>
                <div className="arrival-day-idea-body">
                  <p className="arrival-day-idea-label">{kept ? "Your pick · optional" : "Qloo place idea · optional"}</p>
                  <AnimatePresence initial={false} mode="wait">
                    <motion.div
                      key={`${scope}-${placeKey(active.place)}`}
                      initial={reduced ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduced ? { opacity: 1 } : { opacity: 0, y: -6 }}
                      transition={{ duration: reduced ? 0 : 0.18 }}
                    >
                      <h3 className="arrival-day-idea-name">{active.place.name}</h3>
                      {active.place.categories.length > 0 && (
                        <p className="arrival-day-idea-cats">{active.place.categories.filter(Boolean).slice(0, 2).join(" · ")}</p>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  <p className="sr-only" role="status" aria-live="polite">{kept ? "Kept for this day" : "Optional place idea"}</p>
                  <div className="arrival-day-actions">
                    <a className="taste-map-link" href={placeSearchUrl(active.place.name, destination)} target="_blank" rel="noopener noreferrer">
                      Find on map <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                    <button type="button" className="taste-button taste-button--primary" aria-pressed={kept} disabled={!choicesReady || planning} onClick={onKeep}>
                      {kept ? "Kept for this trip" : "Keep this idea"}
                    </button>
                    {!kept && (
                      <button type="button" className="taste-button taste-button--ghost" disabled={!choicesReady || planning || !active.alternatives.length} onClick={onSwap}>
                        {active.alternatives.length ? "Show me another" : "No more alternatives"}
                      </button>
                    )}
                    {!kept && (
                      <button type="button" className="taste-button taste-button--ghost" disabled={!choicesReady || planning} onClick={onDismiss}>
                        Not this trip
                      </button>
                    )}
                  </div>
                  <p role="status" className="taste-note">
                    {kept
                      ? storageAvailable
                        ? "Kept with this trip on this device."
                        : "Kept for this visit only."
                      : ""}
                  </p>
                </div>
              </motion.li>
            );
          }
          const step = (row as { kind: "step"; step: TravelerNudge }).step;
          const isDone = completedIds.has(step.id);
          const isSkip = skippedIds.has(step.id);
          return (
            <li key={step.id} className="arrival-day-row">
              <span className="arrival-day-time" aria-label={`${fmtMin(step.startMin)} to ${fmtMin(step.endMin)}`}>
                <span>{fmtMin(step.startMin)}</span>
                <span>to</span>
                <span>{fmtMin(step.endMin)}</span>
              </span>
              <div className="arrival-day-step">
                <h3 className="arrival-day-step-title">{step.title}</h3>
                <p className="arrival-day-step-summary">{step.actionSummary}</p>
                {(step.whyItHelps || step.citation) && (
                  <details className="arrival-day-why">
                    <summary>Why this helps</summary>
                    <p>{step.whyItHelps}</p>
                    {step.citation && <p className="arrival-day-idea-cats">{step.citation.title}</p>}
                  </details>
                )}
                {interactive && (
                  <div className="arrival-day-actions">
                    <button type="button" className="taste-button taste-button--ghost" aria-pressed={isDone} disabled={!actionsReady} onClick={() => onDone(step)}>
                      {isDone ? "Done ✓" : "Done"}
                    </button>
                    <button type="button" className="taste-button taste-button--ghost" aria-pressed={isSkip} disabled={!actionsReady} onClick={() => onSkip(step)}>
                      {isSkip ? "Skipped" : "Skip"}
                    </button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {idea?.status === "dismissed" && (
        <div className="arrival-day-aside">
          <p className="taste-note">Idea set aside.</p>
          <button type="button" className="taste-button taste-button--ghost" disabled={!choicesReady || planning} onClick={onRestore}>
            Restore idea
          </button>
        </div>
      )}
      {idea?.status === "unavailable" && (
        <div className="arrival-day-aside">
          <p className="taste-note">
            {idea.unavailableReason === "reserved"
              ? "This place is already chosen for another day. Use a different idea."
              : idea.savedPlace
                ? `Your saved idea “${idea.savedPlace.name}” is not in these results. Choose another.`
                : "Your saved idea is not in these results. Choose another."}
          </p>
          {idea.canRestore !== false && (
            <button type="button" className="taste-button taste-button--ghost" disabled={!choicesReady || planning} onClick={onRestore}>
              Use current suggestion
            </button>
          )}
        </div>
      )}
      {!idea && (
        <p className="taste-note">
          {tasteStatus === "unavailable"
            ? "Place ideas are unavailable. Your scheduled steps are still here."
            : tasteStatus === "no-matches"
              ? "No daytime places found for these favorites. Try another favorite."
              : tasteStatus === "no-window"
                ? "No clear hour for a place idea. Your rest and commitments come first."
                : tasteStatus === "ready"
                  ? "No place idea added for this day."
                  : "Choose a favorite below to add an optional place idea."}
        </p>
      )}

      <p className="arrival-day-foot">
        Optional — check hours before you go; your scheduled steps come first.
      </p>
    </section>
  );
}
