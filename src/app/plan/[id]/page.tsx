import Link from "next/link";
import { notFound } from "next/navigation";
import { loadSharedPlan } from "@/lib/share";
import { fmtMin } from "@/domain/circadian";
import { TasteItineraryCard } from "@/components/TasteItineraryCard";
import { isTasteItinerary, itineraryMatchesTrip, type TasteItinerary } from "@/domain/taste";
import { parsePlaceChoices } from "@/lib/place-choices";
import type { Trip } from "@/domain/types";

export const dynamic = "force-dynamic";

export default async function SharedPlan({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = loadSharedPlan(id);
  if (!data) notFound();
  const { briefing, trip } = data as {
    briefing: { summary: string; score: number; days: { label: string; shiftMin: number; interventions: { kind: string; startMin: number; endMin: number }[] }[]; citations: { title: string }[] };
    trip: {
      origin: { name: string };
      destination: { name: string };
      requiredShiftMin: number;
      direction: "east" | "west";
      heroMeeting?: { title: string; localMin: number; bodyMin: number; bodyWithoutPlanMin: number } | null;
    } | null;
  };
  const totalShift = briefing.days.reduce((a, d) => a + d.shiftMin, 0);
  // Bet 3 — the passport line. The hero meeting's body-time delta is the
  // sentence people actually say ("my body thinks it's 06:00 at the board
  // meeting"); when the share payload carries it, the card leads with it.
  // Absent on old shares — the card falls back to the plan summary, never
  // an invented meeting.
  const hero = trip?.heroMeeting ?? null;
  const rawItinerary = (data as { briefing?: { tasteItinerary?: unknown } }).briefing?.tasteItinerary;
  const tripForMatch = trip && Array.isArray((trip as Partial<Trip>).days) ? (trip as Trip) : null;
  const itinerary: TasteItinerary | null =
    isTasteItinerary(rawItinerary) && tripForMatch && itineraryMatchesTrip(rawItinerary, tripForMatch)
      ? rawItinerary
      : null;

  return (
    <main style={{ minHeight: "100vh", background: "#F5EFE6", color: "#5b4d41", fontFamily: "var(--font-body)", padding: "40px 20px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", color: "#D96B43", textTransform: "uppercase" }}>
          Meridian · shared plan
        </div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, letterSpacing: "-0.02em", margin: "10px 0 4px" }}>
          {trip ? `${trip.origin.name} → ${trip.destination.name}` : "Shift plan"}
        </h1>
        <p style={{ fontSize: 13, color: "#7a6a5c", margin: "0 0 20px" }}>{briefing.summary}</p>

        {hero && hero.bodyWithoutPlanMin !== hero.bodyMin && (
          <div
            style={{
              background: "#1E1B18",
              color: "#fff8ef",
              borderRadius: 16,
              padding: "16px 18px",
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "#e99a6f" }}>
              Body-clock passport
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, marginTop: 6 }}>
              {hero.title} · {fmtMin(hero.localMin)}
            </div>
            <div style={{ fontSize: 14, marginTop: 4 }}>
              My body thinks it&apos;s {fmtMin(hero.bodyMin)} — would have been{" "}
              {fmtMin(hero.bodyWithoutPlanMin)} without the crew.
            </div>
          </div>
        )}

        <div style={{ background: "#fff8ef", border: "1px solid #e3d5c3", borderRadius: 16, padding: 16 }}>
          {briefing.days.map((d) => (
            <div key={d.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "8px 0", borderTop: "1px solid #eee3d6" }}>
              <b>{d.label}</b>
              <span>{d.shiftMin} min shift · {d.interventions.length} steps</span>
            </div>
          ))}
          <div style={{ fontSize: 12, color: "#7a6a5c", marginTop: 10 }}>
            {Math.round(Math.abs(totalShift))} min shifted · score {briefing.score.toFixed(2)} · {briefing.citations.length} papers cited
          </div>
        </div>

        {itinerary && (
          <TasteItineraryCard
            itinerary={itinerary}
            choices={(() => {
              const raw = (data as { briefing?: { tasteChoices?: unknown } }).briefing?.tasteChoices;
              try {
                return raw ? parsePlaceChoices(JSON.stringify(raw)) : undefined;
              } catch {
                return undefined;
              }
            })()}
          />
        )}

        <Link href="/" style={{ display: "inline-block", marginTop: 20, background: "linear-gradient(90deg,#D96B43,#e99a6f)", color: "#fff8ef", borderRadius: 999, padding: "10px 22px", fontSize: 13, fontWeight: 800, textDecoration: "none" }}>
          Make your own plan →
        </Link>
        <p style={{ fontSize: 10, color: "#b7ab9d", marginTop: 16 }}>Built by the Meridian crew — agents that fly ahead of you.</p>
      </div>
    </main>
  );
}
