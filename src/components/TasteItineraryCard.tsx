import { ArrowUpRight } from "lucide-react";
import { fmtMin } from "@/domain/circadian";
import {
  placeSearchUrl,
  tasteSelectionKey,
  type TasteEntity,
  type TasteItinerary,
} from "@/domain/taste";
import { resolvePlaceChoice, type PlaceChoiceState } from "@/lib/place-choices";

export interface TasteItineraryCardProps {
  itinerary: TasteItinerary;
  favorites?: TasteEntity[];
  onSelectDay?: (label: string) => void;
  onUpdate?: () => void;
  planning?: boolean;
  choices?: PlaceChoiceState;
}

const dayFmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDate = (iso: string) => dayFmt.format(new Date(`${iso}T00:00:00Z`));

export function TasteItineraryCard({
  itinerary,
  favorites,
  onSelectDay,
  onUpdate,
  planning,
  choices,
}: TasteItineraryCardProps) {
  const stale = favorites
    ? tasteSelectionKey(favorites) !== tasteSelectionKey(itinerary.favorites)
    : false;

  return (
    <section className="taste-itinerary" aria-labelledby="taste-itinerary-heading">
      <p className="entry-eyebrow">A little room for what you love</p>
      <h2 id="taste-itinerary-heading">Your kind of {itinerary.destination}.</h2>
      <p className="taste-provenance">
        {itinerary.status === "unavailable" ? "Requested favorites: " : "Qloo taste signals: "}
        {itinerary.favorites.map((f) => f.name).join(", ")}
      </p>
      <p className="taste-note">
        {itinerary.status === "unavailable"
          ? "Place discovery unavailable"
          : itinerary.planningMode === "replay"
            ? "Example schedule · Qloo place ideas"
            : "Qloo-ranked ideas, fitted around your plan"}
      </p>

      {stale && (
        <p role="status" className="taste-note">
          Your favorites have changed. Update your plan to use them.
        </p>
      )}
      {onUpdate && (stale || itinerary.status === "unavailable") && (
        <p className="taste-note">
          <button type="button" className="taste-button taste-button--ghost" disabled={planning} onClick={onUpdate}>
            {stale ? "Update my plan" : "Retry place ideas"}
          </button>
        </p>
      )}

      {itinerary.status === "ready" && (
        <ol className="taste-places">
          {itinerary.suggestions.map((s) => {
            const r = resolvePlaceChoice(itinerary, s, choices ?? {});
            const shown = r.place;
            return r.status === "dismissed" || r.status === "unavailable" ? (
              <li key={`${s.dayIndex}-aside`} className="taste-place">
                <div className="taste-place-main">
                  <h4 className="taste-place-name">
                    {r.status === "dismissed"
                      ? "Idea set aside"
                      : r.unavailableReason === "reserved"
                        ? "This place is already chosen for another day."
                        : "Your saved idea is not in these results. Choose another."}
                  </h4>
                  <p className="taste-place-cats">{fmtDate(s.date)} · {itinerary.destination} local time</p>
                </div>
                {onSelectDay && (
                  <button type="button" className="taste-button taste-button--ghost" onClick={() => onSelectDay(s.label)}>
                    See this day
                  </button>
                )}
              </li>
            ) : (
            <li key={`${s.dayIndex}-${shown.name}`} className="taste-place">
              <span className="taste-ordinal" aria-hidden="true">
                {String(itinerary.suggestions.indexOf(s) + 1).padStart(2, "0")}
              </span>
              <div className="taste-place-main">
                <h4 className="taste-place-name">{shown.name}{r?.status === "kept" ? " · kept" : ""}</h4>
                <p className="taste-place-cats">
                  {fmtDate(s.date)} · {fmtMin(s.startMin)}–{fmtMin(s.endMin)} {itinerary.destination} local time
                </p>
                <p className="taste-place-cats">
                  Optional idea · free time in your plan
                  {shown.categories.length > 0 && ` · ${shown.categories.filter(Boolean).slice(0, 2).join(" · ")}`}
                </p>
              </div>
              <div className="taste-place-links">
                <a
                  className="taste-map-link"
                  href={placeSearchUrl(shown.name, itinerary.destination)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Find on map <ArrowUpRight size={14} aria-hidden="true" />
                </a>
                {onSelectDay && (
                  <button
                    type="button"
                    className="taste-button taste-button--ghost"
                    onClick={() => onSelectDay(s.label)}
                  >
                    See this day
                  </button>
                )}
              </div>
            </li>
            );
          })}
        </ol>
      )}
      {itinerary.status === "unavailable" && (
        <p className="taste-note">
          Your plan can still work without place ideas. Try updating your plan later.
        </p>
      )}
      {itinerary.status === "no-matches" && (
        <p className="taste-note">
          Qloo did not return places for these favorites. Your sleep plan is unchanged.
        </p>
      )}
      {itinerary.status === "no-window" && (
        <p className="taste-note">
          No clear hour after arrival. We kept your rest and commitments instead of squeezing
          something in.
        </p>
      )}

      <p className="taste-footnote">
        Suggested free time, not a reservation. Opening hours, travel time and accessibility have not
        been checked. These ideas do not replace your scheduled light or sleep steps.
      </p>
    </section>
  );
}
