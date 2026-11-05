import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadSharedPlan, type ArrivalReceipt } from "@/lib/share";
import { fmtMin } from "@/domain/circadian";
import { TasteItineraryCard } from "@/components/TasteItineraryCard";
import { isTasteItinerary, itineraryMatchesTrip, type TasteItinerary } from "@/domain/taste";
import { parsePlaceChoices } from "@/lib/place-choices";
import type { Trip } from "@/domain/types";

export const dynamic = "force-dynamic";

interface SharedTripShape {
  origin: { name: string; code?: string };
  destination: { name: string; code?: string };
  requiredShiftMin: number;
  direction: "east" | "west";
  heroMeeting?: { title: string; localMin: number; bodyMin: number; bodyWithoutPlanMin: number } | null;
}

interface SharedBriefingShape {
  summary: string;
  score: number;
  days: { label: string; shiftMin: number; interventions: { kind: string; startMin: number; endMin: number }[] }[];
  citations: { title: string }[];
}

const routeLabel = (trip: SharedTripShape | null | undefined) =>
  trip ? `${trip.origin.name} → ${trip.destination.name}` : "Shift plan";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = await loadSharedPlan(id);
  const trip = data?.trip as SharedTripShape | null | undefined;
  const arrival = data?.arrival ?? null;
  const briefing = data?.briefing as SharedBriefingShape | undefined;
  const title = arrival
    ? `${routeLabel(trip)} — landed ${arrival.hoursOff.toFixed(1)}h off`
    : `${routeLabel(trip)} — a Meridian plan`;
  const description = arrival
    ? `The receipt: the plan claimed ${arrival.claimedHours.toFixed(1)}h, its timing carried ${arrival.deliveredHours.toFixed(1)}h of the ${arrival.requiredHours.toFixed(1)}h shift.`
    : (briefing?.summary ?? "A body-clock plan built by the Meridian crew.");
  return {
    title,
    description,
    // og:title/description don't inherit from `title` when the root layout
    // sets openGraph — they must be named or every shared card unfurls with
    // the generic tagline instead of this receipt.
    openGraph: { title, description },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function SharedPlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadSharedPlan(id, { countView: true });
  if (!data) notFound();
  const briefing = (data.briefing ?? null) as SharedBriefingShape | null;
  const trip = (data.trip ?? null) as SharedTripShape | null;
  const arrival: ArrivalReceipt | null = data.arrival ?? null;
  const totalShift = briefing?.days?.reduce((a, d) => a + d.shiftMin, 0) ?? 0;
  // Bet 3 — the passport line. The hero meeting's body-time delta is the
  // sentence people actually say ("my body thinks it's 06:00 at the board
  // meeting"); when the share payload carries it, the card leads with it.
  // Absent on old shares — the card falls back to the plan summary, never
  // an invented meeting.
  const hero = trip?.heroMeeting ?? null;
  const rawItinerary = briefing && (briefing as { tasteItinerary?: unknown }).tasteItinerary;
  const tripForMatch = trip && Array.isArray((trip as Partial<Trip>).days) ? (trip as Trip) : null;
  const itinerary: TasteItinerary | null =
    isTasteItinerary(rawItinerary) && tripForMatch && itineraryMatchesTrip(rawItinerary, tripForMatch)
      ? rawItinerary
      : null;

  return (
    <main className="share">
      <div className="share-inner">
        <div className="share-kicker">
          Meridian · {arrival ? "arrival receipt" : "shared plan"}
        </div>
        <h1 className="share-title">{routeLabel(trip)}</h1>
        {briefing?.summary && (
          <p className="share-summary">{briefing.summary}</p>
        )}

        {arrival && (
          /* The receipt: claimed vs delivered, the same projection the
             landing page reports. The band says "about", never a point. */
          <div className="share-dark">
            <div className="share-dark-kicker">Body-clock receipt</div>
            <div className="share-dark-head">
              Landed about {arrival.hoursOff.toFixed(1)}h from {trip?.destination.name ?? "destination"} time
              {arrival.lowHours !== arrival.highHours &&
                ` (${arrival.lowHours.toFixed(1)}–${arrival.highHours.toFixed(1)}h)`}
            </div>
            <div className="share-dark-sub">
              The plan claimed {arrival.claimedHours.toFixed(1)}h — its timing carried{" "}
              {arrival.deliveredHours.toFixed(1)}h of the {arrival.requiredHours.toFixed(1)}h shift.
            </div>
            {arrival.baselineHours > arrival.hoursOff && (
              <div className="share-dark-note">
                Doing nothing would have left {arrival.baselineHours.toFixed(1)}h off.
              </div>
            )}
          </div>
        )}

        {hero && hero.bodyWithoutPlanMin !== hero.bodyMin && (
          <div className="share-dark">
            <div className="share-dark-kicker">Body-clock passport</div>
            <div className="share-dark-head">
              {hero.title} · {fmtMin(hero.localMin)}
            </div>
            <div className="share-dark-sub">
              My body thinks it&apos;s {fmtMin(hero.bodyMin)} — would have been{" "}
              {fmtMin(hero.bodyWithoutPlanMin)} without the crew.
            </div>
          </div>
        )}

        {briefing && (
          <div className="share-card">
            {briefing.days.map((d) => (
              <div key={d.label} className="share-day">
                <b>{d.label}</b>
                <span>{d.shiftMin} min shift · {d.interventions.length} steps</span>
              </div>
            ))}
            <div className="share-meta">
              {Math.round(Math.abs(totalShift))} min shifted · score {briefing.score.toFixed(2)} · {briefing.citations.length} papers cited
            </div>
          </div>
        )}

        {itinerary && (
          <TasteItineraryCard
            itinerary={itinerary}
            choices={(() => {
              const raw = (data.briefing as { tasteChoices?: unknown } | undefined)?.tasteChoices;
              try {
                return raw ? parsePlaceChoices(JSON.stringify(raw)) : undefined;
              } catch {
                return undefined;
              }
            })()}
          />
        )}

        {/* Recipient→sender loop: the id rides the link so Home can
            acknowledge where they came from, prefill this route, and count
            the trip they commit back against this share. */}
        <Link href={`/?via=${id}`} className="share-cta">
          Make your own plan →
        </Link>
        <p className="share-foot">Built by the Meridian crew — agents that fly ahead of you.</p>
      </div>
    </main>
  );
}
