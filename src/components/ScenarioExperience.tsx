"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { buildDemoScenario, DEMO_SCENARIOS, type DemoScenarioId } from "@/domain/demo-scenarios";
import { buildTasteItinerary } from "@/domain/taste-itinerary";
import { resolvePlaceChoice } from "@/lib/place-choices";
import { usePlaceChoices } from "@/lib/use-place-choices";
import { sampleTasteProfile, sampleTasteLabel, sampleTasteProfilesForCity, splitSamplePlaces } from "@/lib/sample-taste";
import { InteractiveDay } from "@/components/InteractiveDay";
import { Stamp } from "@/components/ui/Stamp";
import { buildDayScene } from "@/domain/day-scene";
import { fmtMin } from "@/domain/circadian";
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

/* Round 27: the example is one stage, not three steps.
 *
 * The old flow (pick a day → scrub the day → see the plan) extended the page
 * at every click and churned visitors before the product ever moved. Now the
 * day chips, the modeled sky with the hero sun, the scrubber and the plan
 * live on a single screen: picking a day or dragging the hour *transforms the
 * stage in place* — the sun crosses the sky, the band follows, the clocks and
 * windows re-read, the plan below re-answers. Nothing grows; everything is
 * the same motion law the app runs on (the thing you touched becomes the
 * surface). "Scrub this day" is retired with the steps — the scrubber is a
 * slider with a sun on it; it needs no button.
 *
 * The URL keeps only what still means something: `?day=` reopens the day the
 * visitor left. `?step=` is gone with the steps; a stale step param reads as
 * no preference. */

export function readUrlDay(id: DemoScenarioId, departureDate: string): number | null {
  if (typeof window === "undefined") return null;
  const d = Number(new URLSearchParams(window.location.search).get("day"));
  const demo = buildDemoScenario(id, departureDate, "afternoon");
  return demo.trip.days.some((x) => x.dayIndex === d) ? d : null;
}

export function ScenarioExperience({ id, departureDate, onChooseScenario, onMakeTrip, onBack }: ScenarioExperienceProps) {
  const [meetingTime, setMeetingTime] = useState<"morning" | "afternoon">("afternoon");
  const [refitting, setRefitting] = useState(false);
  const reduced = useReducedMotion();
  const [profileKey, setProfileKey] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(() => readUrlDay(id, departureDate));
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

  const syncDay = (nextDay: number | null) => {
    const url = new URL(window.location.href);
    if (nextDay === null) url.searchParams.delete("day"); else url.searchParams.set("day", String(nextDay));
    // pushState, not replace: Back should walk the days it just walked.
    window.history.pushState(null, "", url.toString());
  };

  // A pop lands here: re-read the day the URL now names.
  useEffect(() => {
    const onPop = () => {
      setSelectedDay(readUrlDay(id, departureDate));

    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [id, departureDate]);
  const chooseDay = (dayIndex: number) => {
    setSelectedDay(dayIndex);
    syncDay(dayIndex);
  };

  const profile = useMemo(
    () => sampleTasteProfile(profileKey ?? demo.scenario.profile),
    [profileKey, demo.scenario.profile],
  );
  const choices = usePlaceChoices(`sample:${id}:${departureDate}`, false);
  const day = selectedDay ?? demo.trip.departureDayIndex + 1;
  const spec = demo.trip.days.find((d) => d.dayIndex === day) ?? null;
  const plan = spec ? demo.plans.find((p) => p.dayIndex === spec.dayIndex) ?? null : null;
  const itinerary = useMemo(() => {
    if (!profile) return null;
    // Same split as the live path: daytime candidates are fitted into free
    // hours, evening candidates are offered as the first night.
    const { daytime, evening } = splitSamplePlaces(profile.places);
    return buildTasteItinerary(demo.trip, demo.plans, demo.calendar, {
      favorites: profile.favorites,
      status: daytime.length ? "ready" : "no-matches",
      tier: profile.source,
      places: daytime,
      ...(evening.length ? { eveningPlaces: evening } : {}),
      sampleSource: profile.source,
    }, "replay");
  }, [demo, profile]);
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
    <div className="scenario scenario-one-stage reading">
      <button type="button" className="taste-button taste-button--ghost" onClick={onBack}>← Back to my trip setup</button>
      <header className="scenario-heading">
        <p className="entry-eyebrow">Try a high-stakes day</p>
        <p className="scenario-person">{demo.scenario.name} <span>{demo.scenario.role}</span></p>
        <h1 className="scenario-title">{demo.scenario.title}</h1>
        <p className="scenario-joke">{demo.scenario.joke}</p>
      </header>

      <p className="scenario-disclosure" role="note">
        <Stamp kind="fictional" /> Fictional sample data — imagined scenarios,
        not their actual data or endorsements. Nothing is saved.
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
      {id === "miles" && (
        <fieldset className="scenario-toggle">
          <legend>What if the meeting time changes?</legend>
          <button type="button" aria-pressed={meetingTime === "morning"} onClick={() => chooseMeetingTime("morning")} className="taste-button taste-button--ghost">10:00 morning</button>
          <button type="button" aria-pressed={meetingTime === "afternoon"} onClick={() => chooseMeetingTime("afternoon")} className="taste-button taste-button--ghost">16:00 afternoon</button>
        </fieldset>
      )}
      {id === "miles" && refitting && (
        <p role="status" className="scenario-source">Refitting the day around the {meetingTime === "morning" ? "10:00" : "16:00"} meeting…</p>
      )}
      {id === "miles" && meetingTime === "morning" && !demo.plans.some((p) => p.dayIndex === demo.trip.departureDayIndex + 1) && (
        <p role="status" className="taste-note">
          Doesn&apos;t fit a 10:00 start: the current model could not fit this day around the morning meeting.{" "}
                    <button type="button" className="taste-button taste-button--ghost" onClick={() => chooseMeetingTime("afternoon")}>Try 16:00</button>
        </p>
      )}

      {/* The day chips select the stage's subject; the stage transforms in
          place around the choice — no page extension, no second step. */}
      <div className="scenario-days" role="group" aria-label="Days">
        {demo.trip.days.map((d) => (
          <button key={d.dayIndex} type="button" aria-pressed={d.dayIndex === day} onClick={() => chooseDay(d.dayIndex)} className="taste-button taste-button--ghost">{d.label} · {d.date.slice(5)}</button>
        ))}
      </div>

      {scene && (
        <InteractiveDay
          key={day}
          scene={scene}
          requiredMin={Math.abs(demo.trip.requiredShiftMin)}
          direction={demo.trip.direction}
          example
          onJumpToMomentDay={
            scene.moment && scene.momentDayIndex !== null && scene.momentDayIndex !== scene.dayIndex
              ? () => chooseDay(scene.momentDayIndex!)
              : undefined
          }
        />
      )}
      {scene?.moment && scene.momentDayIndex === day && (
        <p className="scenario-moment" role="note">
          The moment that matters: <b>{scene.moment.title}</b> · {fmtMin(scene.moment.localMin)} {scene.city.name}
          {scene.moment.bodyMin !== undefined ? ` — ${fmtMin(scene.moment.bodyMin)} body time here` : ""}
        </p>
      )}

      {spec && (
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
          ideaSource={itinerary?.sampleSource}
          /* The evening half of the crate belongs to the night of the
           * arrival — without it, "Try Diego's day" shows the gallery but
           * never the mezcaleria his punchline is about. */
          firstNight={spec.dayIndex === demo.trip.departureDayIndex + 1 ? itinerary?.firstNight : undefined}
        />
      )}

      <div className="scenario-taste">
        <fieldset className="scenario-toggle">
          <legend>Taste preference</legend>
          {sampleTasteProfilesForCity(demo.trip.destination.name).map((p) => (
            <button key={p.key} type="button" aria-pressed={profile?.key === p.key} onClick={() => setProfileKey(p.key)} className="taste-button taste-button--ghost">{p.favorites[0].name}</button>
          ))}
        </fieldset>
        <p role="status" className="scenario-source">Showing suggestions for {profile?.favorites.map((f) => f.name).join(", ")}. {sampleTasteLabel(profile)}.</p>
      </div>
      <div className="scenario-cta">
        <button type="button" className="entry-cta" onClick={() => onMakeTrip({ origin: demo.scenario.origin ?? "LHR", dest: demo.scenario.dest ?? "HND", date: departureDate })}>Make this my trip</button>
        <p className="scenario-sub">Start with this route. Add your own details before saving.</p>
      </div>
    </div>
  );
}
