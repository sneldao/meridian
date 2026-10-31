"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { buildDemoScenario, DEMO_SCENARIOS, type DemoScenarioId } from "@/domain/demo-scenarios";
import { buildTasteItinerary } from "@/domain/taste-itinerary";
import { resolvePlaceChoice } from "@/lib/place-choices";
import { usePlaceChoices } from "@/lib/use-place-choices";
import { sampleTasteProfile, SAMPLE_TASTE_LABEL } from "@/lib/sample-taste";
import { DayScene, initialSceneMinute } from "@/components/DayScene";
import { buildDayScene, inspectDayScene } from "@/domain/day-scene";
import { fmtMin } from "@/domain/circadian";
import { DayCardShare } from "@/components/DayCardShare";
import { ArrivalDayView } from "@/components/ArrivalDayView";
import { buildDailyNudgesForDay } from "@/domain/nudges";
import { ADHERENCE_PROFILE } from "@/domain/fixtures";
import { dayPlace } from "@/domain/today";

import { tasteSelectionKey, type DestinationPlace } from "@/domain/taste";
import type { PlaceChoice } from "@/lib/place-choices";
import { ArrowRight } from "lucide-react";
import type { HomeRoute } from "@/lib/home-entry";

export interface ScenarioExperienceProps {
  id: DemoScenarioId;
  departureDate: string;
  onChooseScenario: (id: DemoScenarioId) => void;
  onMakeTrip: (route: HomeRoute) => void;
  onBack: () => void;
}

const STEP_LABELS = ["Pick a day", "Scrub the day", "See the plan"] as const;

export function readUrlStep(): 0 | 1 | 2 | null {
  if (typeof window === "undefined") return null;
  const s = Number(new URLSearchParams(window.location.search).get("step"));
  return s === 0 || s === 1 || s === 2 ? s : null;
}

export function readUrlDay(id: DemoScenarioId, departureDate: string): number | null {
  if (typeof window === "undefined") return null;
  const d = Number(new URLSearchParams(window.location.search).get("day"));
  const demo = buildDemoScenario(id, departureDate, "afternoon");
  return demo.trip.days.some((x) => x.dayIndex === d) ? d : null;
}

export function ScenarioExperience({ id, departureDate, onChooseScenario, onMakeTrip, onBack, initialStep = 0 }: ScenarioExperienceProps & { initialStep?: 0 | 1 | 2 }) {
  const [step, setStep] = useState<0 | 1 | 2>(() => readUrlStep() ?? initialStep);
  const [meetingTime, setMeetingTime] = useState<"morning" | "afternoon">("afternoon");
  const [refitting, setRefitting] = useState(false);
  const reduced = useReducedMotion();
  const [profileKey, setProfileKey] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(() => readUrlDay(id, departureDate));
  const [minute, setMinute] = useState<number | null>(null);
  const demo = useMemo(() => buildDemoScenario(id, departureDate, meetingTime), [id, departureDate, meetingTime]);

  const refitTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(refitTimer.current), []);
  const chooseMeetingTime = (next: "morning" | "afternoon") => {
    setMeetingTime(next);
    if (reduced) return;
    window.clearTimeout(refitTimer.current);
    setRefitting(true);
    refitTimer.current = window.setTimeout(() => setRefitting(false), 600);
  };

  const syncUrl = (nextStep: number, nextDay: number | null) => {
    const url = new URL(window.location.href);
    if (nextStep === 0) url.searchParams.delete("step"); else url.searchParams.set("step", String(nextStep));
    if (nextDay === null) url.searchParams.delete("day"); else url.searchParams.set("day", String(nextDay));
    // pushState, not replace: Back should walk the steps it just walked.
    window.history.pushState(null, "", url.toString());
  };

  // ...and a pop lands here: re-read the step/day the URL now names.
  useEffect(() => {
    const onPop = () => {
      setStep(readUrlStep() ?? initialStep);
      setSelectedDay(readUrlDay(id, departureDate));
      setMinute(null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [id, departureDate, initialStep]);
  const goToStep = (next: 0 | 1 | 2) => {
    setStep(next);
    syncUrl(next, selectedDay);
  };
  const chooseDay = (dayIndex: number) => {
    setSelectedDay(dayIndex);
    setMinute(null);
    syncUrl(step, dayIndex);
  };
  const profile = useMemo(
    () => sampleTasteProfile(profileKey ?? demo.scenario.profile),
    [profileKey, demo.scenario.profile],
  );
  const choices = usePlaceChoices(`sample:${id}:${departureDate}`, false);
  const day = selectedDay ?? demo.trip.departureDayIndex + 1;
  const spec = demo.trip.days.find((d) => d.dayIndex === day) ?? null;
  const plan = spec ? demo.plans.find((p) => p.dayIndex === spec.dayIndex) ?? null : null;
  const itinerary = useMemo(
    () => profile ? buildTasteItinerary(demo.trip, demo.plans, demo.calendar, { favorites: profile.favorites, status: profile.places.length ? "ready" : "no-matches", places: profile.places }, "replay") : null,
    [demo, profile],
  );
  const suggestion = spec && itinerary ? itinerary.suggestions.find((s) => s.dayIndex === spec.dayIndex) : undefined;
  const resolved = spec && itinerary && suggestion ? resolvePlaceChoice(itinerary, suggestion, choices.state) : undefined;
  const scene = useMemo(
    () => buildDayScene({ trip: demo.trip, dayIndex: day, plans: demo.plans, calendar: demo.calendar, baseline: demo.baseline }),
    [demo, day],
  );
  const steps = useMemo(
    () =>
      spec && plan
        ? buildDailyNudgesForDay({
            trip: demo.trip,
            dayIndex: spec.dayIndex,
            plan,
            calendarEvents: demo.calendar,
            moves: [],
            citations: [],
            baseline: demo.baseline,
            adherence: ADHERENCE_PROFILE,
          })
        : [],
    [spec, plan, demo],
  );
  const writeChoice = (status: PlaceChoice["status"], place: DestinationPlace) => {
    if (!spec || !itinerary || !choices.ready) return;
    choices.setChoice(spec.date, { status, place, tasteKey: tasteSelectionKey(itinerary.favorites) });
  };
  return (
    <div className="scenario reading">
      <button type="button" className="taste-button taste-button--ghost" onClick={onBack}>← Back to my trip setup</button>
      <header className="scenario-heading">
        <p className="entry-eyebrow">Try a high-stakes day</p>
        <p className="scenario-person">{demo.scenario.name} <span>{demo.scenario.role}</span></p>
        <h1 className="scenario-title">{demo.scenario.title}</h1>
        <p className="scenario-joke">{demo.scenario.joke}</p>
      </header>
      <p className="scenario-disclosure" role="note">
        Imagined demo scenarios — fictional sample data, not their actual data or endorsements. Nothing is saved.
      </p>
      <nav className="scenario-nav" aria-label="Demo scenarios">
        {DEMO_SCENARIOS.map((s) => (
          <button key={s.id} type="button" aria-pressed={s.id === id} onClick={() => onChooseScenario(s.id)} className="taste-button taste-button--ghost">{s.shortName}</button>
        ))}
      </nav>
      <div className="scenario-route" aria-label="Example route">
        <span className="scenario-airport">{demo.trip.origin.code}<small>{demo.trip.origin.name}</small></span>
        <ArrowRight size={24} aria-hidden="true" />
        <span className="scenario-airport">{demo.trip.destination.code}<small>{demo.trip.destination.name}</small></span>
        <span className="scenario-departure">Departing<time dateTime={departureDate}>{departureDate}</time></span>
      </div>
      {id === "jason" && (
        <fieldset className="scenario-toggle">
          <legend>What if the meeting time changes?</legend>
          <button type="button" aria-pressed={meetingTime === "morning"} onClick={() => chooseMeetingTime("morning")} className="taste-button taste-button--ghost">10:00 morning</button>
          <button type="button" aria-pressed={meetingTime === "afternoon"} onClick={() => chooseMeetingTime("afternoon")} className="taste-button taste-button--ghost">16:00 afternoon</button>
        </fieldset>
      )}
      {id === "jason" && refitting && (
        <p role="status" className="scenario-source">Refitting the day around the {meetingTime === "morning" ? "10:00" : "16:00"} meeting…</p>
      )}
      {id === "jason" && meetingTime === "morning" && !demo.plans.some((p) => p.dayIndex === demo.trip.departureDayIndex + 1) && (
        <p role="status" className="taste-note">
          Doesn&apos;t fit a 10:00 start: the current model could not fit this day around the morning meeting.{" "}
                    <button type="button" className="taste-button taste-button--ghost" onClick={() => chooseMeetingTime("afternoon")}>Try 16:00</button>
        </p>
      )}
      <p className="scenario-steps" aria-live="polite">Step {step + 1} of 3 · {STEP_LABELS[step]}</p>
      {step === 0 && (
      <div className="scenario-days" role="group" aria-label="Days">
        {demo.trip.days.map((d) => (
          <button key={d.dayIndex} type="button" aria-pressed={d.dayIndex === day} onClick={() => chooseDay(d.dayIndex)} className="taste-button taste-button--ghost">{d.label} · {d.date.slice(5)}</button>
        ))}
      </div>
      )}
      {step === 1 && scene && (
        <DayScene
          key={`${scene.city.code}:${scene.date}:${scene.moment?.eventId ?? ""}:${scene.moment?.localMin ?? ""}`}
          scene={scene}
          example
          eventSource="fixture"
          idea={resolved}
          minute={minute ?? undefined}
          onMinuteChange={setMinute}
          onSelectDay={(label) => {
            const m = demo.trip.days.find((d) => d.label === label);
            if (m) chooseDay(m.dayIndex);
          }}
        >
          <DayCardShare
            scene={scene}
            fictionalTrip
            eventSource="fixture"
            exampleBaseline
            idea={resolved}
            favorites={itinerary?.favorites}
            recordedTaste
          />
        </DayScene>
      )}

      {step === 2 && scene && (
        <p role="status" className="scenario-source">
          Plan for {fmtMin(inspectDayScene(scene, minute ?? initialSceneMinute(scene)).localMin)} local time. Scrub the day to see the plan at another moment.
        </p>
      )}
      {step === 2 && spec && (
        <ArrivalDayView
          destination={dayPlace(demo.trip, spec.dayIndex).city}
          date={spec.date}
          steps={steps}
          idea={resolved}
          completedIds={new Set()}
          skippedIds={new Set()}
          actionsReady={false}
          interactive={false}
          onDone={() => {}}
          onSkip={() => {}}
          onKeep={() => {
            if (!resolved) return;
            writeChoice(resolved.status === "kept" ? "swapped" : "kept", resolved.place);
          }}
          onSwap={() => { if (resolved?.alternatives.length) writeChoice("swapped", resolved.alternatives[0]); }}
          onDismiss={() => { if (resolved) writeChoice("dismissed", resolved.place); }}
          onRestore={() => choices.clearChoice(spec.date)}
          choicesReady={choices.ready}
          storageAvailable={choices.storageAvailable}
          planning={false}
          example
          eyebrow={spec.dayIndex <= demo.trip.departureDayIndex ? "Before you land" : "After you land"}
          tasteFavorites={itinerary?.favorites}
          tasteStatus={itinerary?.status}
        />
      )}
      <nav className="scenario-nav" aria-label="Step controls">
        {step > 0 && <button type="button" className="taste-button taste-button--ghost" onClick={() => goToStep((step - 1) as 0 | 1 | 2)}>← Back</button>}
        {step < 2 && <button type="button" className="entry-cta" onClick={() => goToStep((step + 1) as 0 | 1 | 2)}>{step === 0 ? "Scrub this day" : "See the plan"}</button>}
      </nav>
      {step === 2 && (
      <>
      <div className="scenario-taste">
        <fieldset className="scenario-toggle">
          <legend>Taste preference</legend>
          {(["bjork", "luke"] as const).map((k) => {
            const p = sampleTasteProfile(k);
            return p && <button key={k} type="button" aria-pressed={profile?.key === k} onClick={() => setProfileKey(k)} className="taste-button taste-button--ghost">{p.favorites[0].name}</button>;
          })}
        </fieldset>
        <p role="status" className="scenario-source">Showing recorded suggestions for {profile?.favorites.map((f) => f.name).join(", ")}. {SAMPLE_TASTE_LABEL} · not a live lookup.</p>
      </div>
      <div className="scenario-cta">
        <button type="button" className="entry-cta" onClick={() => onMakeTrip({ origin: "LHR", dest: "HND", date: departureDate })}>Make this my trip</button>
        <p className="scenario-sub">Start with this route. Add your own details before saving.</p>
      </div>
      </>
      )}
    </div>
  );
}
