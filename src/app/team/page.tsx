import Link from "next/link";
import { buildTrip, CITY_TABLE } from "@/domain/fixtures";
import { meetingReadiness, remainingLagMin } from "@/domain/readiness";
import type { CalendarEvent, CityCode, DayPlan, Trip } from "@/domain/types";

// The team view: a travel manager's screen. Twelve travellers, twelve crews,
// each with its own shift. Progress is simulated from a fixed schedule so the
// page is deterministic and runs offline; readiness uses the same maths as a
// single run. Simulated progress is labelled on screen.

const TRAVELLERS: { name: string; origin: CityCode; dest: CityCode }[] = [
  { name: "Alex Rivera", origin: "LHR", dest: "HND" },
  { name: "Priya Shah", origin: "LHR", dest: "SIN" },
  { name: "Tom Okafor", origin: "JFK", dest: "HND" },
  { name: "Mei Lin", origin: "SFO", dest: "SIN" },
  { name: "Ben Hartley", origin: "LHR", dest: "JFK" },
  { name: "Sofia Mendes", origin: "CDG", dest: "HND" },
  { name: "Daniel Kim", origin: "SFO", dest: "HND" },
  { name: "Hannah Weiss", origin: "JFK", dest: "CDG" },
  { name: "Omar Haddad", origin: "CDG", dest: "SIN" },
  { name: "Grace Liu", origin: "LHR", dest: "SFO" },
  { name: "Lucas Moreau", origin: "JFK", dest: "SIN" },
  { name: "Isla Ross", origin: "SFO", dest: "CDG" },
];

const DEPARTURE = "2026-10-18";
const BOARD_MIN = 9 * 60;

interface Row {
  name: string;
  trip: Trip;
  lockedDays: number;
  lag: number;
  readiness: ReturnType<typeof meetingReadiness>;
}

/** Simulated progress: traveller i has locked (i % 5) of the 5 plan days. */
function simulate(t: (typeof TRAVELLERS)[number], i: number): Row {
  const trip = buildTrip(t.origin, t.dest, DEPARTURE);
  const lockedDays = i % 5;
  const perDay = Math.round(trip.requiredShiftMin / 5);
  const locked: DayPlan[] = Array.from({ length: lockedDays }, (_, k) => ({
    dayIndex: k,
    label: trip.days[k].label,
    shiftMin: perDay,
    targetBedtimeMin: 22 * 60,
    targetWakeMin: 6 * 60,
    interventions: [],
  }));
  // A destination board meeting on D+1 at 09:00 local, per traveller.
  const board: CalendarEvent = {
    id: `board-${i}`,
    title: "Board meeting",
    dayIndex: 4,
    startMin: BOARD_MIN,
    endMin: BOARD_MIN + 90,
    movable: false,
  };
  return {
    name: t.name,
    trip,
    lockedDays,
    lag: remainingLagMin(trip, locked),
    readiness: meetingReadiness(trip, [board], locked),
  };
}

export default function TeamPage() {
  const rows = TRAVELLERS.map(simulate);
  const atRisk = rows.filter((r) => r.readiness.some((x) => x.status === "risk")).length;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 font-mono2 text-[#e8eaf2]">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-[10px] tracking-widest text-[#8b93a7] uppercase hover:text-[#e8eaf2]">
            ← run a shift
          </Link>
          <h1 className="mt-2 text-lg font-bold tracking-[0.3em]">TEAM · 12 CREWS</h1>
          <p className="mt-1 text-[11px] text-[#8b93a7]">
            Each traveller has their own crew, running in parallel. Progress is simulated for this view.
          </p>
        </div>
        <div className="text-right text-[11px] text-[#8b93a7]">
          <div>
            <span className="text-[#ff7a7a] font-bold">{atRisk}</span> of {rows.length} board meetings at risk
          </div>
          <div className="mt-1 text-[10px] text-[#4a5470]">
            Pricing hypothesis: about £20–30 per traveller per month.
          </div>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const risk = r.readiness.find((x) => x.status === "risk");
          const pct = Math.round((r.lockedDays / 5) * 100);
          return (
            <article key={r.name} className="rounded-xl border border-[#1e2637] bg-[#0c1018] p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[12px] font-bold">{r.name}</div>
                  <div className="mt-0.5 text-[10px] text-[#8b93a7]">
                    {r.trip.origin.code} <span className="text-[#ffc46b]">→</span> {r.trip.destination.code} ·{" "}
                    {CITY_TABLE[r.trip.destination.code].name}
                  </div>
                </div>
                <span
                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                    risk ? "bg-[#ff7a7a22] text-[#ff7a7a]" : "bg-[#b8e35622] text-[#b8e356]"
                  }`}
                >
                  {risk ? "AT RISK" : "READY"}
                </span>
              </div>

              <div className="mt-3 h-1.5 w-full overflow-hidden rounded bg-[#1e2637]">
                <div className="h-full bg-[#b8e356]" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-[10px] text-[#8b93a7]">
                <span>{r.lockedDays}/5 days locked</span>
                <span>{(r.lag / 60).toFixed(1)}h lag</span>
              </div>

              {r.readiness.map((x) => (
                <p key={x.eventId} className={`mt-2 text-[10px] leading-relaxed ${x.status === "risk" ? "text-[#ff7a7a]" : "text-[#8b93a7]"}`}>
                  {x.text}
                </p>
              ))}
            </article>
          );
        })}
      </div>
    </main>
  );
}
