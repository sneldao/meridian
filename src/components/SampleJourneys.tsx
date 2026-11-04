import { ArrowRight } from "lucide-react";
import { DEMO_SCENARIOS, type DemoScenarioDef, type DemoScenarioId } from "@/domain/demo-scenarios";
import { Stamp } from "@/components/ui/Stamp";

export function SampleJourneys({ onChoose }: { onChoose: (id: DemoScenarioId) => void }) {
  return (
    <section className="sample-journeys" aria-labelledby="sample-journeys-heading">
      <p className="entry-eyebrow">Try a high-stakes day</p>
      <h2 id="sample-journeys-heading">Four arrivals. Four very different days.</h2>
      {DEMO_SCENARIOS.map((s, i) => (
        <div key={s.id} className="sample-row">
          <span className="sample-num" aria-hidden="true">{`0${i + 1}`}</span>
          <div className="sample-body">
            <h3 className="sample-name">
              {s.name}
              {/* The route each story actually flies — Diego's dispatch is
                  JFK → MEX while the founding three share LHR → HND, so the
                  badge keeps the rows honest at a glance. The def widens
                  the const tuple so optional route fields are readable. */}
              <span className="sample-route">
                {(s as DemoScenarioDef).origin ?? "LHR"} → {(s as DemoScenarioDef).dest ?? "HND"}
              </span>
            </h3>
            <p className="sample-role">{s.role}</p>
            <p className="sample-joke">{s.joke}</p>
          </div>
          <button type="button" className="taste-button taste-button--ghost" onClick={() => onChoose(s.id)}>
            Try {s.shortName}’s day <ArrowRight size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
      <p className="sample-foot">
        <Stamp kind="fictional" /> Imagined scenarios — not real schedules or endorsements.
      </p>
    </section>
  );
}
