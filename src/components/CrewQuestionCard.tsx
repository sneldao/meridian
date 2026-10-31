"use client";

import { useState } from "react";
import type { CrewQuestion, CrewQuestionAnswer } from "@/domain/types";

interface Props {
  question: CrewQuestion;
  answer?: CrewQuestionAnswer;
}

// The crew's one question, suspended on the traveller's pick. Same seam as
// the calendar approval: the run pauses server-side, this card posts the
// answer, and `crew_answer` lands back on the stream so every listener sees
// what was decided. Unanswered or expired resolves as skipped — the card
// admits that rather than pretending a decision was made.
export function CrewQuestionCard({ question, answer }: Props) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const decided = answer?.questionId === question.id ? answer : undefined;

  const choose = async (optionId: string) => {
    setBusy(true);
    setLocalError(null);
    try {
      const res = await fetch("/api/crew/answers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, optionId }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        setLocalError(data?.error ?? "Could not send the answer — the crew will decide on its own.");
      }
    } catch {
      setLocalError("Could not reach the crew — it will decide on its own.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="card"
      aria-label="The crew is asking"
      style={{ padding: 16, border: "1px solid rgba(122,223,255,.28)" }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--m-text)" }}>
        The crew asks
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--m-text)" }}>
        {question.text}
      </p>
      <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--m-muted)" }}>
        {question.context}
      </p>
      {decided ? (
        <p role="status" style={{ margin: "12px 0 0", fontSize: 12, color: "var(--m-text)" }}>
          {decided.skipped
            ? "No answer — the crew decided."
            : `You answered: ${decided.label}${decided.effect ? ` — ${decided.effect}` : ""}`}
        </p>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {question.options.map((o) => (
            <button
              key={o.id}
              type="button"
              className="chip"
              style={{ minHeight: 44 }}
              disabled={busy}
              onClick={() => void choose(o.id)}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {localError && (
        <p role="alert" style={{ margin: "8px 0 0", fontSize: 12, color: "var(--color-fail)" }}>
          {localError}
        </p>
      )}
    </section>
  );
}
