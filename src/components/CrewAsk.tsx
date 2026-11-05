"use client";

import { useState } from "react";
import { CornerDownLeft, MapPin } from "lucide-react";
import { CrewAvatar } from "@/components/CrewAvatar";
import type { CrewAnswer } from "@/domain/crew-answer";

/* The ask row (docs/plan/agent-native.md §4a): one bounded input that hands
 * a typed question to `crewAnswer` — the deterministic lane — and prints
 * the specialist's answer underneath. The same field serves the nudge
 * card's expanded "Why?", each jobs row's detail fold, and the now-room's
 * "Ask the crew" field.
 *
 * Answers are ephemeral per-mount state: nothing is written to a feed, a
 * log or storage. Each lands with a ~300ms fade-up (the crew's own
 * crew-fade-up keyframes); under reduced motion it prints instantly. The
 * provenance suffix reuses .prov-chip styling — every answer names which
 * signal it computed from, the same disclosure law as the chips. */

export interface CrewAskProps {
  /** The field's label — "Ask the crew", "Ask Otto". */
  label: string;
  placeholder?: string;
  /** The deterministic lane — crewAnswer bound to this surface's facts
   *  (and to the attached context, where the ask sits on a card). */
  onAsk: (question: string) => CrewAnswer;
}

export function CrewAsk({ label, placeholder, onAsk }: CrewAskProps) {
  const [value, setValue] = useState("");
  const [answers, setAnswers] = useState<CrewAnswer[]>([]);

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    setAnswers((prev) => [...prev, onAsk(q)]);
    setValue("");
  };

  return (
    <div className="crew-ask">
      <form
        className="crew-ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          className="crew-ask-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder ?? "type a question"}
          aria-label={label}
        />
        <button
          type="submit"
          className="crew-ask-go"
          aria-label={`${label} — send`}
          disabled={!value.trim()}
        >
          <CornerDownLeft size={13} aria-hidden="true" />
        </button>
      </form>
      {answers.length > 0 && (
        <ol className="crew-answers">
          {answers.map((a, i) => (
            <li key={i} className="crew-answer">
              <span className="crew-answer-owner">
                {a.agent ? (
                  <CrewAvatar id={a.agent} size={16} decorative />
                ) : (
                  <MapPin size={13} aria-hidden="true" />
                )}
                {a.owner}
              </span>
              <p className="crew-answer-line">
                {a.answer}{" "}
                <span className="prov-chip crew-answer-prov">{a.provenance}</span>
              </p>
              {a.detail?.map((d, j) => (
                <p key={j} className="crew-answer-detail">
                  {d}
                </p>
              ))}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
