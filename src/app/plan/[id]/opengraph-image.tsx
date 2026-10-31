import { ImageResponse } from "next/og";
import { loadSharedPlan, type ArrivalReceipt } from "@/lib/share";
import { fmtMin } from "@/domain/circadian";
import { DawnDisc } from "@/components/og/DawnDisc";

// Bet 3 — the passport as an image. When a shared link lands in Slack or
// iMessage, this card is what people see: the body-clock line first ("My body
// thinks it's 06:00 at the board meeting"), the route and the numbers second.
// It renders from the same share payload the page renders, so the image can
// never claim a figure the card doesn't show.
//
// Satori rules the JSX: flexbox only, every element declares `display`, no
// shorthand beyond what the renderer accepts.

export const alt = "Meridian — body-clock passport";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Share payloads are write-once — a re-rendered card can never disagree
// with the page it previews, so a day of edge caching is safe.
export const revalidate = 86400;

interface SharedTrip {
  origin: { name: string };
  destination: { name: string };
  requiredShiftMin?: number;
  heroMeeting?: {
    title: string;
    localMin: number;
    bodyMin: number;
    bodyWithoutPlanMin: number;
  } | null;
}

interface SharedBriefing {
  summary?: string;
  score?: number;
  coverage?: { residualMin?: number };
  days?: { shiftMin: number; interventions: { kind: string }[] }[];
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = (await loadSharedPlan(id)) as
    | { briefing?: SharedBriefing; trip?: SharedTrip | null; arrival?: ArrivalReceipt | null }
    | null;
  const briefing = data?.briefing;
  const trip = data?.trip ?? null;
  const arrival = data?.arrival ?? null;
  const hero = trip?.heroMeeting ?? null;
  const hasPassport = hero !== null && hero.bodyWithoutPlanMin !== hero.bodyMin;
  const totalShift = briefing?.days?.reduce((a, d) => a + d.shiftMin, 0) ?? null;
  const steps = briefing?.days?.reduce((a, d) => a + d.interventions.length, 0) ?? null;
  // The ghost gap on the card: minutes still owed. A receipt measures it
  // post-landing (hoursOff); a plan measures it at the gate (residualMin).
  // Neither present → the lines draw fused, which is the honest "no debt
  // on file" render, not a claim of full adjustment.
  const owedMin = arrival
    ? Math.round(arrival.hoursOff * 60)
    : (briefing?.coverage?.residualMin ?? 0);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 56,
          background:
            "linear-gradient(160deg, #0b0e16 0%, #10141f 46%, #241a1c 72%, #3a2118 100%)",
          color: "#fff8ef",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                display: "flex",
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: 6,
                color: "#e99a6f",
              }}
            >
              {arrival ? "MERIDIAN · ARRIVAL RECEIPT" : "MERIDIAN · BODY-CLOCK PASSPORT"}
            </div>
            <div
              style={{
                display: "flex",
                marginTop: 18,
                fontSize: 40,
                fontWeight: 700,
                color: "#f5efe6",
              }}
            >
              {trip
                ? `${trip.origin.name} → ${trip.destination.name}`
                : "A jet-lag plan, shared"}
            </div>
          </div>

          {arrival ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                borderLeft: "6px solid #e99a6f",
                paddingLeft: 28,
              }}
            >
              <div style={{ display: "flex", fontSize: 54, fontWeight: 800 }}>
                Landed {arrival.hoursOff.toFixed(1)}h off — carried {arrival.deliveredHours.toFixed(1)}h
              </div>
              <div style={{ display: "flex", fontSize: 26, color: "#c9b8a4", marginTop: 10 }}>
                claimed {arrival.claimedHours.toFixed(1)}h of {arrival.requiredHours.toFixed(1)}h
                {arrival.baselineHours > arrival.hoursOff &&
                  ` · doing nothing: ${arrival.baselineHours.toFixed(1)}h off`}
              </div>
            </div>
          ) : hasPassport && hero ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                borderLeft: "6px solid #e99a6f",
                paddingLeft: 28,
              }}
            >
              <div style={{ display: "flex", fontSize: 30, color: "#9db8ff" }}>
                {hero.title} · {fmtMin(hero.localMin)} local
              </div>
              <div style={{ display: "flex", fontSize: 54, fontWeight: 800, marginTop: 10 }}>
                My body thinks it&apos;s {fmtMin(hero.bodyMin)}
              </div>
              <div style={{ display: "flex", fontSize: 26, color: "#c9b8a4", marginTop: 8 }}>
                — would have been {fmtMin(hero.bodyWithoutPlanMin)} without the crew
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 30, color: "#c9b8a4" }}>
              {briefing?.summary ?? "The crew flies ahead, then plans the landing."}
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 32,
              borderTop: "1px solid rgba(245,239,230,0.25)",
              paddingTop: 24,
              fontSize: 24,
              color: "#c9b8a4",
            }}
          >
            {totalShift !== null && <div style={{ display: "flex" }}>{Math.round(Math.abs(totalShift))} min of clock to shift</div>}
            {steps !== null && <div style={{ display: "flex" }}>{steps} steps planned</div>}
            {typeof briefing?.score === "number" && (
              <div style={{ display: "flex" }}>plan score {briefing.score.toFixed(2)}</div>
            )}
            <div style={{ display: "flex", marginLeft: "auto", color: "#e99a6f" }}>
              meridian.trustfall.xyz
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", marginLeft: 32 }}>
          <DawnDisc owedMin={owedMin} />
        </div>
      </div>
    ),
    { ...size },
  );
}
