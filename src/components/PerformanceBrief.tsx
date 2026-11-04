import type { HeroMeeting } from "@/domain/hero";
import { fmtMin } from "@/domain/circadian";
import { Stamp } from "@/components/ui/Stamp";

const dayFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

export interface PerformanceBriefProps {
  moment: HeroMeeting | null;
  destination: string;
  date?: string;
  example?: boolean;
  preview?: boolean;
  eventSource?: "google" | "fixture";
  exampleBaseline?: boolean;
  hasPlan?: boolean;
  compact?: boolean;
}

export function PerformanceBrief({ moment, destination, date, example, preview, eventSource, exampleBaseline, hasPlan = true, compact }: PerformanceBriefProps) {
  const risk = moment?.status === "risk";
  const fictionalSleep = exampleBaseline || example;
  const parsedDate = date ? new Date(`${date}T00:00:00Z`) : null;
  // Provenance stays specific even under a PREVIEW stamp: which inputs are
  // sample data is a fact about the source, not about the plan's state.
  // No moment, no fictional event — a fixture source with nothing to show
  // never claims a sample event exists.
  const fictionalEvent = Boolean(moment) && eventSource !== "google";
  const sources = [
    fictionalEvent ? "Example event" : null,
    fictionalSleep ? "Example sleep profile" : null,
  ].filter(Boolean);
  const stamp = preview ? "preview" : sources.length > 0 ? "example" : null;
  const validDate = parsedDate && Number.isFinite(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date ? parsedDate : null;
  return (
    <section className={`perf-brief${compact ? " perf-brief--compact" : ""}`} aria-labelledby="perf-brief-heading">
      <p className="entry-eyebrow">{example ? "A fictional moment that matters" : "The moment that matters"}</p>
      {stamp && <Stamp kind={stamp} className="perf-stamp" />}
      <h2 id="perf-brief-heading">{moment ? moment.title : "Show up for what matters."}</h2>
      {sources.length > 0 && (
        <p className="perf-source">Sample data: {sources.join(" · ")} — not your measurements.</p>
      )}
      {moment ? (
        <>
          {compact ? (
            <p className="perf-event-summary">
              {validDate && `${dayFmt.format(validDate)} · `}{destination} · {fmtMin(moment.localMin)} local /{" "}
              {fmtMin(moment.bodyMin)} estimated body time · without planned shifts{" "}
              {fmtMin(moment.bodyWithoutPlanMin)}
            </p>
          ) : (
          <div className="perf-grid">
            <div className="perf-col">
              <p className="perf-label">Event time</p>
              <p className="perf-time">{fmtMin(moment.localMin)}</p>
              <p className="perf-sub">{validDate && `${dayFmt.format(validDate)} · `}{destination} local time</p>
            </div>
            <div className="perf-col">
              <p className="perf-label">Estimated body time</p>
              <p className="perf-time">{fmtMin(moment.bodyMin)}</p>
              <p className="perf-sub">
                {hasPlan
                  ? `with pre-event plan · without plan ${fmtMin(moment.bodyWithoutPlanMin)}`
                  : "before any planned adjustment"}
              </p>
            </div>
          </div>
          )}
          <p className="perf-note">
            {risk
              ? fictionalSleep
                ? "This estimate overlaps the example sleep window."
                : "This estimate overlaps your usual sleep window."
              : "Outside the modeled sleep window."}
          </p>
        </>
      ) : (
        <p className="perf-note">Your light and rest plan can work around the moments you need to show up for.</p>
      )}
      <p className="perf-foot">Body-clock estimates, not a measurement of alertness or performance.</p>
    </section>
  );
}
