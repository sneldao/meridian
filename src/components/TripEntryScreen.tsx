"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { useMagnetic } from "@/lib/motion/magnetic";
import { RoutePicker } from "@/components/RoutePicker";
import { isValidHomeRoute, type HomeRoute } from "@/lib/home-entry";
import { ADHERENCE_PROFILE, buildTrip, GARMIN_BASELINE } from "@/domain/fixtures";
import { previewPlan, type SolvedDay } from "@/domain/solver";
import { routeGapLine, routeGapRead, type RouteGapRead } from "@/domain/route-gap";
import { coverageOf, fmtMin } from "@/domain/circadian";
import { paymentsConfigured, readPrice } from "@/lib/escrow";
import { findAirport } from "@/domain/airports";
import {
  SAMPLE_TASTE_CRATES,
  matchSampleProfileForTrip,
  splitSamplePlaces,
  type SampleTasteProfile,
} from "@/lib/sample-taste";
import { ENTITY_CATALOG_MISS, suggestEntities } from "@/lib/entity-catalog";
import { writeTripTaste } from "@/lib/use-trip-taste";
import { addTasteEntity, TASTE_TYPES, type TasteEntity } from "@/domain/taste";
import type { CityCode, Trip } from "@/domain/types";

function planPreview(route: HomeRoute): { lightStart?: number; covPct: number } | null {
  try {
    const t: Trip = buildTrip(route.origin.toUpperCase() as CityCode, route.dest.toUpperCase() as CityCode, route.date);
    // Same demo baseline as the example day below: a preview the solver can
    // actually place, computed the moment the route resolves.
    const solved = previewPlan({ trip: t, calendar: [], adherence: ADHERENCE_PROFILE, baseline: GARMIN_BASELINE });
    const days = [...solved.values()].filter((s): s is SolvedDay => !!s).map((s) => s.plan);
    if (!days.length) return null;
    const light = days.flatMap((d) => d.interventions).find((i) => i.kind === "light_exposure");
    return {
      lightStart: light?.startMin,
      covPct: Math.round(coverageOf(t, days).ratio * 100),
    };
  } catch {
    return null; // airports outside the registry — no preview, never a fake
  }
}

export interface TripEntryScreenProps {
  initialDate: string;
  onContinue: (route: HomeRoute) => void;
  onExploreExample: () => void;
  /** Deprecated on this surface: the sample-journey tiles moved out of the
   *  form to after the example instrument (Phase 1). Kept so existing
   *  callers typecheck — nothing is rendered from it here. */
  onExploreScenario?: (id: import("@/domain/demo-scenarios").DemoScenarioId) => void;
  initialRoute?: HomeRoute | null;
  /** The resolved gap + solver coverage for the draft, reported as it
   *  changes — the landing headline above adopts it. Null gap = the draft
   *  hasn't resolved. Callers should pass a stable callback (useCallback);
   *  the report effect re-runs whenever its identity changes. */
  onGapChange?: (gap: RouteGapRead | null, covPct: number | null) => void;
}

/* Design reset Phase 1 — the form is the hero's action: no intro column,
 * no mascot, no sample tiles inside the form (they live below the example
 * day now). The response to typing is the headline above it changing via
 * onGapChange, plus the preview line under the CTA. */
export function TripEntryScreen({ initialDate, onContinue, onExploreExample, initialRoute, onGapChange }: TripEntryScreenProps) {
  const [draft, setDraft] = useState<HomeRoute>(
    initialRoute && isValidHomeRoute(initialRoute) ? initialRoute : { origin: "", dest: "", date: initialDate },
  );
  /* museum-of-motion magnetic: the primary CTA leans a few px toward the
     pointer (hover:fine only — touch and reduced motion get the plain
     button). */
  const ctaRef = useMagnetic<HTMLButtonElement>({ strength: 0.22 });
  // Price disclosed at intent, read live from the contract — a stale number
  // in copy is worse than none, so the line only renders once the read lands.
  const [priceUsdc, setPriceUsdc] = useState<string | null>(null);
  // The optional taste crate. Packing seeds the trip's taste scope on
  // submit, so the traveller lands on a plan that already knows what they
  // love — the film's WHAT half, offered at the door instead of four clicks
  // in. `favorites` is the crate's contents: the pills pack a bundled
  // crate, the free-text field adds one catalog entity at a time, and
  // every favorite shows as a removable chip. Unselected by default; it is
  // a garnish, never a gate.
  const [favorites, setFavorites] = useState<TasteEntity[]>([]);
  /* Provenance for the count line: ids that arrived via the typed catalog
   * field (a pill-packed favorite that shares the id stays unflagged — it
   * came from a crate, not the catalog). */
  const [catalogIds, setCatalogIds] = useState<ReadonlySet<string>>(new Set());
  // The typed-favorite field — a combobox over the bundled entity catalog.
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const crateFieldRef = useRef<HTMLDivElement>(null);
  const crateListId = useId();
  const crateFull = favorites.length >= 3;
  const rawSuggestions = useMemo(() => suggestEntities(query), [query]);
  /* Packed favorites drop out of the suggestions — they answered already. */
  const options = useMemo(
    () => rawSuggestions.filter((s) => !favorites.some((f) => f.id === s.id)),
    [rawSuggestions, favorites],
  );
  const showCrateList = open && !crateFull && options.length > 0;
  const activeOption = options.length ? Math.min(hi, options.length - 1) : 0;
  /* The honest read on what's typed: a name the catalog carries is an
   * option; a name it doesn't is a named miss, never a silent add; a name
   * already packed says so. */
  const crateMissLine =
    !crateFull && query.trim()
      ? rawSuggestions.length === 0
        ? ENTITY_CATALOG_MISS
        : options.length === 0
          ? `${rawSuggestions[0].name} is already in your crate`
          : null
      : null;
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!crateFieldRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, []);
  const pickEntity = (entity: TasteEntity) => {
    setFavorites((prev) => addTasteEntity(prev, entity));
    setCatalogIds((prev) => new Set(prev).add(entity.id));
    setQuery("");
    setHi(0);
    setOpen(false);
  };
  const removeFavorite = (id: string) => {
    setFavorites((prev) => prev.filter((f) => f.id !== id));
    setCatalogIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  /* A pill is pressed when its whole crate is packed; clicking packs the
   * crate's entities into whatever room is left, clicking again unpacks
   * them. Typed favorites ride alongside — a packed crate still matches
   * `matchSampleProfileForTrip` because it asks for ⊆, not equality. */
  const cratePacked = (c: SampleTasteProfile) =>
    c.favorites.every((cf) => favorites.some((f) => f.id === cf.id));
  const toggleCrate = (c: SampleTasteProfile) => {
    if (cratePacked(c)) {
      const ids = new Set(c.favorites.map((f) => f.id));
      setFavorites((prev) => prev.filter((f) => !ids.has(f.id)));
      setCatalogIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    } else {
      let next = favorites;
      for (const cf of c.favorites) next = addTasteEntity(next, cf);
      setFavorites(next);
      /* A full crate disables the field — a half-typed name can't sit
       * locked inside a control the traveller can no longer edit. */
      if (next.length >= 3 && query) setQuery("");
    }
  };
  /* A crate that can't fully fit waits honestly rather than half-packing —
   * disabled, with the reason named in the title. */
  const crateFits = (c: SampleTasteProfile) =>
    favorites.length + c.favorites.filter((cf) => !favorites.some((f) => f.id === cf.id)).length <= 3;
  const packedCrate = SAMPLE_TASTE_CRATES.find((c) => cratePacked(c)) ?? null;
  /* The crate's live payoff — personalisation you can see. The count runs
   * the same resolution the trip will run (loadTasteContext →
   * matchSampleProfileForTrip → splitSamplePlaces), so a destination that
   * lands in the crate's city gets the real pool size; anywhere else, the
   * honest line is that places resolve when the route lands. Never a
   * fabricated number — and a typed favorite names its source (`· local
   * catalog`), the same disclosure law as the sample provenance. */
  const crateLine = useMemo(() => {
    if (!favorites.length) return null;
    const n = favorites.length;
    const entities = `${n} ${n === 1 ? "entity" : "entities"} in your crate`;
    const catalog = favorites.some((f) => catalogIds.has(f.id)) ? " · local catalog" : "";
    const destName = findAirport(draft.dest)?.name;
    const matched = destName ? matchSampleProfileForTrip(destName, favorites) : null;
    if (matched) {
      const { daytime } = splitSamplePlaces(matched.places);
      if (daytime.length) {
        const kind = matched.source === "imagined" ? "imagined sample" : "recorded sample";
        return `${entities} · ${daytime.length} ${daytime.length === 1 ? "place" : "places"} matched near ${destName} · ${kind}${catalog}`;
      }
    }
    return `${entities} — places resolve when the route lands${catalog}`;
  }, [favorites, catalogIds, draft.dest]);
  useEffect(() => {
    if (!paymentsConfigured()) return;
    let on = true;
    readPrice()
      .then((p) => on && setPriceUsdc(`${(Number(p) / 1e6).toFixed(2)}`))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  const valid = isValidHomeRoute(draft);
  const sameAirports =
    !!draft.origin && !!draft.dest && draft.origin.toUpperCase() === draft.dest.toUpperCase();
  const preview = useMemo(() => (valid ? planPreview(draft) : null), [draft, valid]);
  const gap = useMemo(() => (valid ? routeGapRead(draft) : null), [draft, valid]);
  // Report the resolved read upward — the landing headline adopts it.
  useEffect(() => {
    onGapChange?.(gap, preview?.covPct ?? null);
  }, [gap, preview, onGapChange]);

  return (
    <section className="entry" id="trip-entry" role="group" aria-labelledby="entry-heading">
      <div className="entry-planner">
        <h2 id="entry-heading">Where are you headed?</h2>
        <p className="entry-planner-note">Choose airports from the suggestions, then a departure date.</p>
        <form
          className="entry-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) {
              const route = {
                origin: draft.origin.toUpperCase(),
                dest: draft.dest.toUpperCase(),
                date: draft.date,
              };
              // Seed the crate into this trip's taste scope before handing
              // the route up — the same key page.tsx reads on arrival.
              // Pill-packed and typed favorites travel as one list.
              if (favorites.length && typeof window !== "undefined") {
                try {
                  writeTripTaste(
                    window.localStorage,
                    `${route.origin}-${route.dest}-${route.date}`,
                    favorites,
                  );
                } catch {
                  // Storage unavailable (private mode) — the trip still
                  // works, it simply starts without a crate.
                }
              }
              onContinue(route);
            }
          }}
        >
          <RoutePicker
            origin={draft.origin}
            dest={draft.dest}
            date={draft.date}
            surface="landing"
            onChange={(next) =>
              setDraft({ origin: next.origin, dest: next.dest, date: next.date })
            }
          />
          {/* The helper only speaks when there's an actual error — the
              suggestion instruction lives in the note above the fields. */}
          {sameAirports && (
            <p role="alert" className="entry-error">Choose different departure and destination airports.</p>
          )}
          {/* The WHAT half of the promise, offered at the door: one tap
              packs a crate of music/film the destination gets curated
              around. Optional, unselected by default, never a gate. */}
          <div className="entry-crate">
            <p className="entry-crate-label" id="entry-crate-label">
              Pack a taste crate · optional
            </p>
            <div className="entry-crate-pills" role="group" aria-labelledby="entry-crate-label">
              {SAMPLE_TASTE_CRATES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="taste-button taste-button--ghost"
                  aria-pressed={cratePacked(c)}
                  disabled={!cratePacked(c) && !crateFits(c)}
                  title={
                    !cratePacked(c) && !crateFits(c)
                      ? "The crate holds three favorites — remove one to pack a crate"
                      : undefined
                  }
                  onClick={() => toggleCrate(c)}
                >
                  {c.crateLabel}
                </button>
              ))}
            </div>
            {/* Free-text favorites (agent-native §4b): the bundled entity
                catalog answers names itself — a miss is named, never
                silently added. Same combobox idiom as the route fields. */}
            <div className="entry-crate-type" ref={crateFieldRef}>
              <input
                type="text"
                value={query}
                disabled={crateFull}
                onFocus={() => setOpen(true)}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHi(0);
                  setOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    if (!open) {
                      setOpen(true);
                      setHi(0);
                    } else {
                      setHi((h) => Math.min(h + 1, options.length - 1));
                    }
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setHi((h) => Math.max(h - 1, 0));
                  } else if (e.key === "Enter") {
                    if (open && options[activeOption]) {
                      e.preventDefault();
                      pickEntity(options[activeOption]);
                    } else if (query.trim()) {
                      /* Enter on typed text speaks for this field — it
                       * picks a highlighted option or lets the miss line
                       * stand; it never submits the trip on a half-name. */
                      e.preventDefault();
                    }
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    setOpen(false);
                  }
                  e.stopPropagation(); // keep the page's Space/Esc shortcuts out of typing
                }}
                placeholder={
                  crateFull
                    ? "Three favorites is the crate's limit — remove one to add another"
                    : "or type a favorite — an artist, film, book or brand"
                }
                aria-label="Type a favorite for your crate"
                role="combobox"
                aria-expanded={showCrateList}
                aria-controls={showCrateList ? crateListId : undefined}
                aria-activedescendant={
                  showCrateList && options[activeOption]
                    ? `${crateListId}-opt-${activeOption}`
                    : undefined
                }
                aria-autocomplete="list"
                className="entry-crate-input"
              />
              {showCrateList && (
                <ul role="listbox" id={crateListId} className="entry-crate-listbox">
                  {options.map((entity, i) => (
                    <li
                      key={entity.id}
                      id={`${crateListId}-opt-${i}`}
                      role="option"
                      aria-selected={i === activeOption}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickEntity(entity);
                      }}
                      onMouseEnter={() => setHi(i)}
                      className={
                        i === activeOption ? "entry-crate-option is-active" : "entry-crate-option"
                      }
                    >
                      <span className="entry-crate-option-name">{entity.name}</span>
                      <span className="entry-crate-option-kind">
                        {TASTE_TYPES[entity.type].toLowerCase()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {crateMissLine && (
              <p className="entry-crate-miss" aria-live="polite">
                {crateMissLine}
              </p>
            )}
            {favorites.length > 0 && (
              <ul className="taste-chips entry-crate-chips">
                {favorites.map((f) => (
                  <li key={f.id} className="taste-chip">
                    <span className="taste-chip-name">{f.name}</span>
                    <span className="entry-crate-chip-kind">
                      {TASTE_TYPES[f.type].toLowerCase()}
                    </span>
                    <button
                      type="button"
                      className="taste-chip-remove"
                      aria-label={`Remove ${f.name}`}
                      onClick={() => removeFavorite(f.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {crateLine && (
              <p className="entry-crate-count" aria-live="polite">
                {crateLine}
              </p>
            )}
            {favorites.length > 0 && (
              <p className="entry-crate-note">
                Shapes the places the crew suggests when you get there.
              </p>
            )}
            {/* One tap from crate to route: a visitor who packed a crate
                before typing anything gets the story's flight offered, not
                forced — their own route always wins once typed. */}
            {packedCrate && (!draft.origin.trim() || !draft.dest.trim()) && (
              <button
                type="button"
                className="taste-button taste-button--ghost entry-crate-route"
                onClick={() =>
                  setDraft((d) => ({
                    ...d,
                    origin: packedCrate.sampleRoute.origin,
                    dest: packedCrate.sampleRoute.dest,
                  }))
                }
              >
                Fly the crate’s route · {packedCrate.sampleRoute.origin} → {packedCrate.sampleRoute.dest}
              </button>
            )}
          </div>
          <button type="submit" className="entry-cta" disabled={!valid} ref={ctaRef}>
            <span data-magnetic-inner>See my trip plan</span> <ArrowRight size={18} aria-hidden="true" />
          </button>
          {/* Live solver preview — computed as the route resolves. It is a
              model preview of coverage, never a promise of alertness. */}
          {(preview || gap) && (
            <p className="entry-preview" aria-live="polite">
              {gap && (
                <>
                  {routeGapLine(gap)}
                  {preview ? " · " : ""}
                </>
              )}
              {preview && (
                <>
                  Model preview — estimated shift coverage {preview.covPct}% using example sleep timing
                  {preview.lightStart !== undefined && ` · first light ${fmtMin(preview.lightStart)}`}
                </>
              )}
            </p>
          )}
        </form>
        <div className="entry-example-row">
          <span>Just looking around?</span>
          <button type="button" className="entry-example" onClick={onExploreExample}>Explore an example</button>
        </div>
        <p className="entry-privacy">
          No account needed to get started.{" "}
          <Link href="/privacy" className="underline">Privacy &amp; support</Link>
        </p>
        {priceUsdc !== null && (
          <p className="entry-privacy mt-1">
            Day one is free. The full week is {priceUsdc} USDC, held on Arc and
            released only if the plan passes our checks — refunded if it doesn&apos;t.
          </p>
        )}
      </div>
    </section>
  );
}
