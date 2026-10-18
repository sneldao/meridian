import type { ShiftCoverage } from "@/domain/types";

function fmtH(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** The one sentence a saved plan opens with — how much of the time gap the
 *  plan covers before the flight, and the evidence behind it. */
export function planSummaryLine(
  coverage: ShiftCoverage | undefined,
  destName: string | undefined,
  citationsCount: number,
): string {
  const dest = destName ?? "your destination";
  const line = coverage
    ? coverage.residualMin <= 0
      ? `You should land fully adjusted to ${dest} time.`
      : `Before you fly, this plan moves your body clock ${fmtH(coverage.achievedMin)} closer to ${dest} time. The other ${fmtH(coverage.residualMin)} adjusts in your first days there.`
    : "Here's your plan.";
  return citationsCount > 0 ? `${line} Based on ${citationsCount} studies.` : line;
}
