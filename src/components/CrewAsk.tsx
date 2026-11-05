"use client";

import { useEffect, useState } from "react";
import { CornerDownLeft, MapPin } from "lucide-react";
import { CrewAvatar } from "@/components/CrewAvatar";
import type { CrewAnswer } from "@/domain/crew-answer";
import { crewAnswerLLMAvailable, llmFallback } from "@/lib/crew-ask-live";
import type { AgentId } from "@/domain/types";

/* The ask row (docs/plan/agent-native.md §4a): one bounded input that hands
 * a typed question to `crewAnswer` — the deterministic lane — and prints
 * the specialist's answer underneath. The same field serves the nudge
 * card's expanded "Why?", each jobs row's detail fold, the now-room's
 * "Ask the crew" field, the insight cards' agent names, and the feed-pin's
 * "Ask Scout".
 *
 * Answers are ephemeral per-mount state: nothing is written to a feed, a
 * log or storage. Each lands with a ~300ms fade-up (the crew's own
 * crew-fade-up keyframes); under reduced motion it prints instantly. The
 * provenance suffix reuses .prov-chip styling — every answer names which
 * signal it computed from, the same disclosure law as the chips.
 *
 * Step 3 — the LLM lane: when `live` is on, the route's own health check
 * decides whether a real provider exists; a question goes over the wire
 * only when the deterministic answer IS the fallback — resolved intents
 * never hit the network. The pending "…" stands in for the ask, one
 * in-flight per field (submit disabled), and any failure or the 8s timeout
 * keeps the deterministic message. */

export interface CrewAskProps {
  /** The field's label — "Ask the crew", "Ask Otto". */
  label: string;
  placeholder?: string;
  /** The deterministic lane — crewAnswer bound to this surface's facts
   *  (and to the attached context, where the ask sits on a card). */
  onAsk: (question: string) => CrewAnswer;
  /** Enable the open-question lane. The probe is the route's own GET — the
   *  server reports whether a real provider is configured. */
  live?: boolean;
  /** The CrewFacts JSON this surface already builds — the route's
   *  grounding context, sent only for fallback questions. */
  facts?: unknown;
  /** The specialist the field belongs to — the pin's Scout, a card's Iris —
   *  so an open question lands in the right voice. */
  owner?: string;
  /** The avatar behind `owner`, for the pending row; Scout is null. */
  agent?: AgentId | null;
}

export function CrewAsk({
  label,
  placeholder,
  onAsk,
  live,
  facts,
  owner,
  agent,
}: CrewAskProps) {
  const [value, setValue] = useState("");
  const [answers, setAnswers] = useState<CrewAnswer[]>([]);
  const [pending, setPending] = useState(false);
  const [liveOn, setLiveOn] = useState(false);

  useEffect(() => {
    if (!live) return;
    let on = true;
    void crewAnswerLLMAvailable().then((v) => {
      if (on) setLiveOn(v);
    });
    return () => {
      on = false;
    };
  }, [live]);

  const submit = () => {
    const q = value.trim();
    if (!q || pending) return;
    const a = onAsk(q);
    setValue("");
    /* Deterministic-first: a resolved intent prints immediately. Only the
     * one honest fallback earns the wire. */
    if (!(live && liveOn && a.isFallback)) {
      setAnswers((prev) => [...prev, a]);
      return;
    }
    setPending(true);
    void llmFallback({ question: q, owner, facts }).then((llm) => {
      setPending(false);
      setAnswers((prev) => [...prev, llm ?? a]);
    });
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
          disabled={!value.trim() || pending}
        >
          <CornerDownLeft size={13} aria-hidden="true" />
        </button>
      </form>
      {(answers.length > 0 || pending) && (
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
          {pending && (
            <li className="crew-answer crew-answer-pending" aria-live="polite">
              <span className="crew-answer-owner">
                {agent ? (
                  <CrewAvatar id={agent} size={16} decorative />
                ) : (
                  <MapPin size={13} aria-hidden="true" />
                )}
                {owner ?? "Crew"}
              </span>
              <p className="crew-answer-line">…</p>
            </li>
          )}
        </ol>
      )}
    </div>
  );
}
