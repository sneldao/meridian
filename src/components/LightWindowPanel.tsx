import { Moon, Sun } from "lucide-react";
import { fmtMin } from "@/domain/circadian";
import type { DayPlan } from "@/domain/types";

const dayFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

export interface LightWindowPanelProps {
  plan: DayPlan | null;
  date: string;
  city: string;
  preview?: boolean;
  example?: boolean;
}

export function LightWindowPanel({ plan, date, city, preview, example }: LightWindowPanelProps) {
  const light = plan?.interventions.filter((i) => i.kind === "light_exposure") ?? [];
  const avoid = plan?.interventions.filter((i) => i.kind === "avoid_light") ?? [];
  const sleep = plan?.interventions.find((i) => i.kind === "sleep_window");
  const caffeine = plan?.interventions.find((i) => i.kind === "caffeine_cutoff");
  const rows = [...light.map((i) => ({ ...i, band: "seek" as const })), ...avoid.map((i) => ({ ...i, band: "avoid" as const }))].sort((a, b) => a.startMin - b.startMin);
  return (
    <section className="light-panel" aria-labelledby="light-panel-heading">
      <h3 id="light-panel-heading">Lightmaxxing, with timing.</h3>
      <p className="light-sub">
        Right light. Right time. Not more sun.
        {example ? " Example plan." : preview ? " Plan preview." : ""}
      </p>
      <p className="light-meta">{dayFmt.format(new Date(`${date}T00:00:00Z`))} · {city}</p>
      {plan === null && <p className="light-empty">No verified light window for this day yet.</p>}
      {plan !== null && rows.length === 0 && <p className="light-empty">No light window placed for this day.</p>}
      {rows.map((i, idx) => (
        <div key={idx} className={`light-row light-row--${i.band}`}>
          {i.band === "seek" ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}
          <div>
            <p className="light-row-label">{i.band === "seek" ? "Seek light" : "Reduce light"}</p>
            <p className="light-row-time">
              {fmtMin(i.startMin)}{i.endMin != null && `–${fmtMin(i.endMin)}`}
              {i.endMin != null && i.endMin <= i.startMin && " · ends next day"}
            </p>
            {i.note && <p className="light-row-note">{i.note}</p>}
          </div>
        </div>
      ))}
      {(sleep || caffeine) && (
        <p className="light-support">
          {[
            sleep ? `Sleep ${fmtMin(sleep.startMin)}${sleep.endMin !== undefined ? `–${fmtMin(sleep.endMin)}` : ""}` : null,
            caffeine ? `Caffeine cutoff ${fmtMin(caffeine.startMin)}` : null,
          ].filter(Boolean).join(" · ")}
        </p>
      )}
      <p className="light-foot">Follow the timing, not the sun: more light is not always better.</p>
    </section>
  );
}
