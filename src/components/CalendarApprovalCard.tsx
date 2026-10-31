"use client";

import { useState } from "react";
import { fmtMin } from "@/domain/circadian";
import type { CalendarApprovalRequest } from "@/domain/types";

interface Props {
  approval: CalendarApprovalRequest;
  result?: { approvalId: string; status: "applied" | "rejected" | "failed"; message: string };
}

export function CalendarApprovalCard({ approval, result }: Props) {
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const decided = result?.approvalId === approval.id ? result : undefined;

  const decide = async (approve: boolean) => {
    setBusy(true);
    setLocalError(null);
    try {
      const res = await fetch("/api/crew/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: approval.id, approve }),
      });
      const data = await res.json();
      if (!res.ok || data?.ok === false) {
        setLocalError(data?.result?.message ?? data?.error ?? "Could not resolve the calendar approval.");
      }
    } catch {
      setLocalError("Could not reach the approval service. Your calendar has not been changed.");
    } finally {
      setBusy(false);
    }
  };

  if (decided?.status === "applied") {
    return <p role="status" className="card" style={{ padding: 14, color: "var(--color-pass)" }}>{decided.message}</p>;
  }

  return (
    <section className="card" aria-label="Calendar changes need approval" style={{ padding: 16, border: "1px solid rgba(255,196,107,.28)" }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: "var(--m-text)" }}>Review calendar changes</p>
      <p style={{ margin: "6px 0 0", fontSize: 12, lineHeight: 1.5, color: "var(--m-muted)" }}>{approval.summary}</p>
      {approval.moves.length > 0 && (
        <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--m-text)" }}>
          {approval.moves.map((m) => (
            <li key={`${m.eventId}-${m.to.dayIndex}-${m.to.startMin}`}>
              {m.title}: {fmtMin(m.from.startMin)} → {fmtMin(m.to.startMin)}
            </li>
          ))}
        </ul>
      )}
      {(approval.planBlocks?.length ?? 0) > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 12, color: "var(--m-muted)" }}>
          {(approval.planBlocks ?? []).slice(0, 6).map((b) => (
            <li key={`${b.dayLabel}-${b.kind}-${b.startMin}`}>
              {b.dayLabel} · Meridian {b.kind.replace(/_/g, " ")} {fmtMin(b.startMin)}–{fmtMin(b.endMin)}
            </li>
          ))}
          {(approval.planBlocks?.length ?? 0) > 6 && <li>…and {approval.planBlocks.length - 6} more plan blocks</li>}
        </ul>
      )}
      {decided ? (
        <p role="status" style={{ margin: "12px 0 0", fontSize: 12, color: decided.status === "failed" ? "var(--color-fail)" : "var(--m-text)" }}>
          {decided.message}
        </p>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="chip" style={{ minHeight: 44 }} disabled={busy} onClick={() => void decide(true)}>
            {busy ? "Working…" : "Apply to Google Calendar"}
          </button>
          <button type="button" className="chip" style={{ minHeight: 44 }} disabled={busy} onClick={() => void decide(false)}>
            Keep my calendar unchanged
          </button>
        </div>
      )}
      {localError && <p role="alert" style={{ margin: "8px 0 0", fontSize: 12, color: "#b04523" }}>{localError}</p>}
    </section>
  );
}
