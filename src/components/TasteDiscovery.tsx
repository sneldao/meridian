"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  TASTE_TYPES,
  addTasteEntity,
  isTasteEntitiesResponse,
  isTasteResponse,
  placeSearchUrl,
  tasteSelectionKey,
  type TasteEntity,
  type TasteResponse,
  type TasteType,
} from "@/domain/taste";
import { createTasteRequestScope } from "@/lib/taste-request";

interface TasteDiscoveryProps {
  destination: { name: string; lon: number; lat: number };
  initialTaste: TasteResponse | null;
  favorites?: TasteEntity[];
  onFavoritesChange?: (next: TasteEntity[]) => void;
  favoritesReady?: boolean;
  storageAvailable?: boolean;
  onFitPlan?: () => void;
  planning?: boolean;
}

type SearchStatus = "idle" | "loading" | "ready" | "error" | "disabled";
type DiscoverStatus = "idle" | "loading" | "error";

export function tasteResultLabel(seeds: TasteEntity[]): string {
  return seeds.length
    ? `Taste signals: ${seeds.map((e) => e.name).join(", ")}`
    : "Destination picks · not personalized yet";
}

export function TasteDiscovery({
  destination,
  initialTaste,
  favorites,
  onFavoritesChange,
  favoritesReady = true,
  storageAvailable,
  onFitPlan,
  planning = false,
}: TasteDiscoveryProps) {
  const [type, setType] = useState<TasteType>("artist");
  const [query, setQuery] = useState("");
  const [localSelected, setLocalSelected] = useState<TasteEntity[]>([]);
  const [results, setResults] = useState<TasteEntity[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>(
    initialTaste && initialTaste.enabled === false ? "disabled" : "idle",
  );
  const [searchError, setSearchError] = useState("");
  const [personal, setPersonal] = useState<{ data: TasteResponse; seeds: TasteEntity[] } | null>(null);
  const [discoverStatus, setDiscoverStatus] = useState<DiscoverStatus>("idle");
  const [discoverError, setDiscoverError] = useState("");

  const [searchScope] = useState(createTasteRequestScope);
  const [discoverScope] = useState(createTasteRequestScope);

  const selected = favorites ?? localSelected;
  const result = personal ?? (initialTaste ? { data: initialTaste, seeds: [] as TasteEntity[] } : null);
  const disabled = searchStatus === "disabled" || result?.data.enabled === false;

  function markDisabled() {
    searchScope.cancel();
    discoverScope.cancel();
    setResults([]);
    setSearchStatus("disabled");
    setSearchError("");
    setDiscoverStatus("idle");
    setDiscoverError("");
    setPersonal(null);
  }

  function resetSearch() {
    searchScope.cancel();
    setResults([]);
    setSearchError("");
    setSearchStatus(disabled ? "disabled" : "idle");
  }

  useEffect(
    () => () => {
      searchScope.cancel();
      discoverScope.cancel();
    },
    [searchScope, discoverScope],
  );

  function onTypeChange(next: TasteType) {
    setType(next);
    resetSearch();
  }

  function onQueryChange(next: string) {
    setQuery(next);
    resetSearch();
  }

  function onSelectChange(next: TasteEntity[]) {
    if (onFavoritesChange) onFavoritesChange(next);
    else setLocalSelected(next);
    discoverScope.cancel();
    setDiscoverStatus("idle");
    setDiscoverError("");
    setPersonal(null);
  }

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!favoritesReady || disabled || searchStatus === "loading" || q.length < 2 || q.length > 100 || selected.length >= 3) return;
    const request = searchScope.begin();
    setSearchStatus("loading");
    setSearchError("");
    setResults([]);
    try {
      const res = await fetch(`/api/taste/search?${new URLSearchParams({ q, type })}`, {
        signal: request.signal,
      });
      const data: unknown = await res.json().catch(() => null);
      if (!request.isCurrent()) return;
      if (!res.ok || !isTasteEntitiesResponse(data)) {
        setSearchStatus("error");
        setSearchError("Search is unavailable right now. Try again.");
        return;
      }
      if (data.enabled === false) {
        markDisabled();
        return;
      }
      setResults(data.entities.map((en) => ({ id: en.id, name: en.name.trim(), type })));
      setSearchStatus("ready");
    } catch {
      if (!request.isCurrent()) return;
      setSearchStatus("error");
      setSearchError("Search is unavailable right now. Try again.");
    }
  }

  async function onDiscover() {
    if (!favoritesReady || disabled || !selected.length || discoverStatus === "loading") return;
    const request = discoverScope.begin();
    const seeds = selected;
    setDiscoverStatus("loading");
    setDiscoverError("");
    try {
      const res = await fetch(
        `/api/taste?${new URLSearchParams({
          city: destination.name,
          lon: String(destination.lon),
          lat: String(destination.lat),
          interests: tasteSelectionKey(seeds),
        })}`,
        { signal: request.signal },
      );
      const data: unknown = await res.json().catch(() => null);
      if (!request.isCurrent()) return;
      if (!res.ok || !isTasteResponse(data)) {
        setDiscoverStatus("error");
        setDiscoverError("Places are unavailable right now. Try again.");
        setPersonal(null);
        return;
      }
      if (data.enabled === false) {
        markDisabled();
        return;
      }
      setPersonal({ data, seeds });
      setDiscoverStatus("idle");
    } catch {
      if (!request.isCurrent()) return;
      setDiscoverStatus("error");
      setDiscoverError("Places are unavailable right now. Try again.");
      setPersonal(null);
    }
  }

  const allPlaces = (result?.data.places ?? []).filter((p) => p.name.trim());
  const places = allPlaces.filter((p) => p.daytimeCandidate !== false).slice(0, 3);
  const hasOnlyNonDaytimePlaces = allPlaces.length > 0 && places.length === 0;
  const seedNames = new Set(selected.map((s) => s.id));

  return (
    <section className="taste-discovery reading" aria-labelledby="taste-heading">
      <header className="taste-heading">
        <div>
          <p className="entry-eyebrow">Your trip, your taste</p>
          <h2 id="taste-heading">Find your kind of {destination.name}.</h2>
        </div>
        <span className="taste-source">Powered by Qloo</span>
      </header>
      <p className="taste-intro">
        The music you replay. The films you love. Start with a favorite and let Qloo connect it to
        places at your destination.
      </p>

      <form className="taste-search" onSubmit={onSearch}>
        <label className="taste-field">
          <span className="taste-field-label">Category</span>
          <select
            value={type}
            disabled={disabled || !favoritesReady}
            onChange={(e) => onTypeChange(e.target.value as TasteType)}
            aria-label="Favorite category"
          >
            {(Object.keys(TASTE_TYPES) as TasteType[]).map((t) => (
              <option key={t} value={t}>
                {TASTE_TYPES[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="taste-field">
          <span className="taste-field-label">A favorite</span>
          <input
            type="search"
            value={query}
            disabled={disabled || !favoritesReady}
            minLength={2}
            maxLength={100}
            placeholder="An artist, film, book or brand you love"
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="Search for a favorite"
          />
        </label>
        <button
          type="submit"
          className={`taste-button ${onFitPlan ? "taste-button--ghost" : "taste-button--primary"}`}
          disabled={disabled || !favoritesReady || searchStatus === "loading" || query.trim().length < 2 || selected.length >= 3}
        >
          Search
        </button>
      </form>

      <div className="taste-live" role="status" aria-live="polite">
        {searchStatus === "loading" && "Searching…"}
        {searchStatus === "ready" &&
          (results.length
            ? `${results.length} ${results.length === 1 ? "match" : "matches"} — add the ones that are yours.`
            : "No matches. Try another name.")}
      </div>
      {searchStatus === "error" && (
        <p role="alert" className="taste-error">{searchError}</p>
      )}

      {searchStatus === "ready" && results.length > 0 && (
        <ul className="taste-matches">
          {results.map((entity) => (
            <li key={entity.id}>
              <button
                type="button"
                className="taste-button taste-button--ghost"
                disabled={!favoritesReady || seedNames.has(entity.id) || selected.length >= 3}
                onClick={() => {
                  onSelectChange(addTasteEntity(selected, entity));
                  setResults([]);
                  setQuery("");
                  setSearchStatus("idle");
                }}
              >
                Add {entity.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected.length > 0 && (
        <div className="taste-selected">
          <ul className="taste-chips">
            {selected.map((entity) => (
              <li key={entity.id} className="taste-chip">
                <span className="taste-chip-name">{entity.name}</span>
                <button
                  type="button"
                  className="taste-chip-remove"
                  aria-label={`Remove ${entity.name}`}
                  disabled={!favoritesReady}
                  onClick={() => onSelectChange(selected.filter((s) => s.id !== entity.id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <p className="taste-count">{selected.length} of 3 favorites</p>
        </div>
      )}

      <div className="taste-actions">
        {onFitPlan && (
          <button
            type="button"
            className="taste-button taste-button--primary"
            disabled={!selected.length || !favoritesReady || planning}
            onClick={onFitPlan}
          >
            {planning ? "Fitting your plan…" : "Fit these into my plan"}
          </button>
        )}
        <button
          type="button"
          className={`taste-button ${onFitPlan ? "taste-button--ghost" : "taste-button--primary"}`}
          disabled={disabled || !favoritesReady || !selected.length || discoverStatus === "loading"}
          onClick={onDiscover}
        >
          Find my places
        </button>
        <p className="taste-helper">
          {onFitPlan
            ? "Up to three favorites — ideas never override your sleep and light steps."
            : "Plan your own trip to fit these ideas around your schedule."}
        </p>
      </div>
      {planning && onFitPlan && (
        <p role="status" className="taste-note">Fitting your plan…</p>
      )}
      {onFavoritesChange && (
        <p className="taste-helper">
          {storageAvailable
            ? "Your favorites stay with this trip on this device."
            : "Your favorites are available for this visit only."}
        </p>
      )}

      {discoverStatus === "loading" && (
        <p role="status" className="taste-note">Finding places…</p>
      )}
      {discoverStatus === "error" && (
        <p role="alert" className="taste-error">{discoverError}</p>
      )}
      {disabled && (
        <p className="taste-note">Place discovery isn’t connected right now. Your trip plan still works.</p>
      )}
      {!disabled && result === null && (
        <p className="taste-note">Destination picks are loading. You can start with a favorite.</p>
      )}
      {!disabled && result !== null && !places.length && result.data.note !== "unavailable" && (
        <p className="taste-note">
          {hasOnlyNonDaytimePlaces
            ? "No daytime places found for these favorites. Try another favorite."
            : "No places found yet. Try another favorite."}
        </p>
      )}
      {!disabled && result !== null && !places.length && result.data.note === "unavailable" && (
        <p className="taste-note">Places are unavailable right now. Try again with a favorite above.</p>
      )}

      <div className="taste-results">
        {places.length > 0 && (
          <>
            <p className="taste-provenance">{tasteResultLabel(result?.seeds ?? [])}</p>
            <h3 className="taste-places-heading">A few places to start</h3>
            <ol className="taste-places">
              {places.map((p, i) => (
                <li key={p.name} className="taste-place">
                  <span className="taste-ordinal" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="taste-place-main">
                    <h4 className="taste-place-name">{p.name}</h4>
                    {p.categories.length > 0 && (
                      <p className="taste-place-cats">{p.categories.filter(Boolean).slice(0, 2).join(" · ")}</p>
                    )}
                  </div>
                  <a
                    className="taste-map-link"
                    href={placeSearchUrl(p.name, result?.data.destination ?? destination.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Find on map <ArrowUpRight size={14} aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
      <p className="taste-footnote">
        Places to explore, not scheduled stops — check hours before you go.
      </p>
    </section>
  );
}
