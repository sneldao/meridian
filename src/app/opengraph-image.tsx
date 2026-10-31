import { ImageResponse } from "next/og";
import { DawnDisc } from "@/components/og/DawnDisc";

// The brand card: any pasted meridian.trustfall.xyz link unfurls to the
// terminator motif, not a bare URL. The disc is drawn with a fixed small
// ghost gap — a brand mark, not a measurement (share cards carry real
// owed minutes; this one carries no traveller's numbers at all).

export const alt = "Meridian — arrive better adjusted";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          padding: 64,
          background:
            "linear-gradient(160deg, #0b0e16 0%, #10141f 46%, #241a1c 72%, #3a2118 100%)",
          color: "#fff8ef",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1 }}>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 800,
              letterSpacing: 8,
              color: "#e99a6f",
            }}
          >
            MERIDIAN
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 800, color: "#f5efe6", lineHeight: 1.05 }}>
              Arrive better adjusted.
            </div>
            <div style={{ display: "flex", fontSize: 28, color: "#c9b8a4", marginTop: 18 }}>
              Agents that fly ahead of you — a day-by-day sleep, light and
              caffeine plan timed to your trip.
            </div>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#e99a6f" }}>
            meridian.trustfall.xyz
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", marginLeft: 48 }}>
          <DawnDisc owedMin={180} px={260} />
        </div>
      </div>
    ),
    { ...size },
  );
}
