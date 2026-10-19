/** Consumer-facing day names — domain labels ("D-3", "D+1") stay internal
 *  keys; users see dates when we have them, or plain words otherwise. The
 *  flight day keeps its ✈ but shows its date, so nothing on screen is a
 *  relative offset the traveller has to decode. */
export function friendlyDayLabel(
  d: { label: string; dayIndex: number; date: string },
  departureDayIndex?: number,
): string {
  const dep = departureDayIndex ?? 3;
  let dateLabel = "";
  if (d.date) {
    const dt = new Date(`${d.date}T12:00:00`);
    if (!Number.isNaN(dt.getTime()))
      dateLabel = dt.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
  }
  if (d.dayIndex === dep) return dateLabel ? `✈ ${dateLabel}` : "✈ Flight day";
  if (dateLabel) return dateLabel;
  return d.dayIndex < dep ? `Prep day ${d.dayIndex + 1}` : `Recovery day ${d.dayIndex - dep}`;
}
