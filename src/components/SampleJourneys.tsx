import { ArrowRight } from "lucide-react";
import { DEMO_SCENARIOS, type DemoScenarioId } from "@/domain/demo-scenarios";

export function SampleJourneys({ onChoose }: { onChoose: (id: DemoScenarioId) => void }) {
  return (
    <section className="sample-journeys" aria-labelledby="sample-journeys-heading">
      <p className="entry-eyebrow">Try a high-stakes day</p>
      <h2 id="sample-journeys-heading">Same flight. Three very different days.</h2>
      {DEMO_SCENARIOS.map((s, i) => (
        <div key={s.id} className="sample-row">
          <span className="sample-num" aria-hidden="true">{`0${i + 1}`}</span>
          <div className="sample-body">
            <h3 className="sample-name">{s.name}</h3>
            <p className="sample-role">{s.role}</p>
            <p className="sample-joke">{s.joke}</p>
          </div>
          <button type="button" className="taste-button taste-button--ghost" onClick={() => onChoose(s.id)}>
            Try {s.shortName}’s day <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
      <p className="sample-foot">
        Imagined demo scenarios — fictional sample data, not real schedules or endorsements.
      </p>
    </section>
  );
}
