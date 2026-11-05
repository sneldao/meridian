import { ArrowRight, Volume2, VolumeX } from "lucide-react";
import { DEMO_SCENARIOS, type DemoScenarioDef, type DemoScenarioId } from "@/domain/demo-scenarios";
import { Stamp } from "@/components/ui/Stamp";
import { useVoiceLine } from "@/lib/use-voice-line";

/* The advert portraits — the cast's own film, so the cards name them:
   diego the vinyl curator, marcus the system man, earl the red-cap
   storyteller (the persona ids stay miles/danny — opaque keys, not names).
   Sofia's row stays text-only — her advert was never shot, and she gets
   no line. */
const SAMPLE_AD: Partial<Record<DemoScenarioId, string>> = {
  diego: "diego",
  miles: "marcus",
  danny: "earl",
};

export function SampleJourneys({ onChoose }: { onChoose: (id: DemoScenarioId) => void }) {
  const voice = useVoiceLine();
  return (
    <section className="sample-journeys" aria-labelledby="sample-journeys-heading">
      <p className="entry-eyebrow">Try a high-stakes day</p>
      <h2 id="sample-journeys-heading">Four arrivals. Four very different days.</h2>
      {DEMO_SCENARIOS.map((s, i) => {
        const ad = SAMPLE_AD[s.id as DemoScenarioId];
        const img = ad ? (
          /* Pre-optimized 800px webp — no loader needed. */
          // eslint-disable-next-line @next/next/no-img-element
          <img className="sample-ad" src={`/ads/${ad}.webp`} alt="" loading="lazy" />
        ) : null;
        return (
          <div
            key={s.id}
            className={`sample-row${ad ? (i % 2 === 0 ? " sample-row--img-r" : " sample-row--img-l") : " sample-row--text"}`}
          >
            <span className="sample-num" aria-hidden="true">{`0${i + 1}`}</span>
            {i % 2 === 1 && img}
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
            {i % 2 === 0 && img}
            <div className="sample-actions">
              <button type="button" className="taste-button taste-button--ghost" onClick={() => onChoose(s.id)}>
                Try {s.shortName}’s day <ArrowRight size={14} aria-hidden="true" />
              </button>
              {ad && (
                /* The same speaker the screening-room tiles carry — one
                   line in the traveller's own voice, toggled by press. */
                <button
                  type="button"
                  className="sample-voice"
                  aria-pressed={voice.speaking === s.id}
                  aria-label={`Hear ${s.shortName}'s line`}
                  onClick={() => voice.toggle(s.id, `/ads/${ad}-voice.mp3`)}
                >
                  {voice.speaking === s.id ? (
                    <VolumeX size={15} aria-hidden="true" />
                  ) : (
                    <Volume2 size={15} aria-hidden="true" />
                  )}
                </button>
              )}
            </div>
          </div>
        );
      })}
      <p className="sample-foot">
        <Stamp kind="fictional" /> Imagined scenarios — not real schedules or endorsements.
      </p>
    </section>
  );
}
