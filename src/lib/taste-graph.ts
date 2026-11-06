import type { TasteEntity } from "@/domain/taste";
import { SAMPLE_TASTE_CRATES } from "@/lib/sample-taste";

/* The bundled taste map (agent-native §4b — the "graph materialization"
 * thin slice): authored entity→place affinity edges standing in for the
 * FalkorDB affinity neighborhoods the plan names as "later". Each edge is
 * one hop chain — `entity → via → place` — where `via` carries the genre/
 * association hops (what the entity reads as) into the place's category,
 * and `to` is a REAL bundled sample place, never an invented venue.
 *
 * Honest shape:
 * - Coverage beats breadth. An entity whose chain can't land on a bundled
 *   place simply has no edge — the ask path falls back cleanly instead of
 *   naming a venue the data doesn't carry.
 * - An edge enters the lookup index ONLY if its `to` resolves against the
 *   sample profiles' place lists — a mistyped venue can't surface, and the
 *   city is derived from the profile, not re-authored per edge.
 * - Every surface that renders a chain carries `taste map · bundled` —
 *   these are authored edges, disclosed; never "graph", never "live".
 */

/** The provenance tag every chain display carries. */
export const TASTE_MAP_LABEL = "taste map · bundled";

export interface TasteMapEdge {
  /** Catalog entity id — the same id a typed favorite resolves to. */
  entityId: string;
  entity: string;
  /** The hop text between entity and place: genre/association tags, then
   *  `→` into the place's category ("experimental · art-pop →
   *  contemporary art"). */
  via: string;
  /** The bundled sample place this edge lands on — the exact name the
   *  sample profiles carry. */
  to: string;
}

export const TASTE_MAP_EDGES: readonly TasteMapEdge[] = [
  // --- The four sample-crate favorites — every suggestion they make
  //     answers "why this place?" with a real chain.
  { entityId: "01381184-B533-4E3C-B9DB-43A2FE326744", entity: "Björk",
    via: "experimental · art-pop → contemporary art", to: "SCAI The Bathhouse" },
  { entityId: "01381184-B533-4E3C-B9DB-43A2FE326744", entity: "Björk",
    via: "experimental · electronic → modern art", to: "Mori Art Museum" },
  { entityId: "01381184-B533-4E3C-B9DB-43A2FE326744", entity: "Björk",
    via: "avant-garde · spatial sound → brutalist architecture", to: "St. Mary's Cathedral, Tokyo" },
  { entityId: "3CBD78B1-D2F2-4551-A342-4621B6BDB5E2", entity: "Luke Combs",
    via: "country · americana → kissaten coffee", to: "MERRY and BRIGHT" },
  { entityId: "3CBD78B1-D2F2-4551-A342-4621B6BDB5E2", entity: "Luke Combs",
    via: "country · honky-tonk → hands-on tradition", to: "Chagohan Tokyo" },
  { entityId: "E5928AFF-6309-427E-8A54-DB4AD5946219", entity: "King Krule",
    via: "post-punk · lo-fi → contemporary art", to: "Galería OMR" },
  { entityId: "E5928AFF-6309-427E-8A54-DB4AD5946219", entity: "King Krule",
    via: "dark jazz · smoky rooms → mezcal bars", to: "La Botica" },
  { entityId: "AAED2C10-DBA8-438A-90B7-5A16D2051EB0", entity: "Amores Perros",
    via: "mexican cinema · urban realism → street markets", to: "Mercado de Medellín" },
  { entityId: "AAED2C10-DBA8-438A-90B7-5A16D2051EB0", entity: "Amores Perros",
    via: "iñárritu · interwoven city → contemporary art", to: "Galería OMR" },

  // --- Music
  { entityId: "03BF30F5-3061-6F2B-CE9A-11E5E72A38EE", entity: "Radiohead",
    via: "art-rock · unease → contemporary art", to: "SCAI The Bathhouse" },
  { entityId: "03BF30F5-3061-6F2B-CE9A-11E5E72A38EE", entity: "Radiohead",
    via: "art-rock · melancholy → modern art", to: "MAHO KUBOTA GALLERY" },
  { entityId: "BC94D721-FCEB-1277-7063-BEF1933D7EF4", entity: "David Bowie",
    via: "art-pop · reinvention → modern art", to: "Mori Art Museum" },
  { entityId: "2CCC1369-04D6-76AD-6146-7B6E0A865D91", entity: "Talking Heads",
    via: "art-school new wave → contemporary art", to: "SCAI The Bathhouse" },
  { entityId: "91569815-A14E-8039-6F90-E3CFFF0CFDE7", entity: "Aphex Twin",
    via: "electronic · ambient → sacred space", to: "St. Mary's Cathedral, Tokyo" },
  { entityId: "51FA8B3E-678B-B7FB-746E-1179E841D5C7", entity: "Ryuichi Sakamoto",
    via: "ambient · minimalism → japanese design", to: "Sahsya Kanetanaka" },
  { entityId: "660568B3-0C34-A62F-5249-2801C4E04758", entity: "Sigur Rós",
    via: "post-rock · ethereal → contemplative spaces", to: "St. Mary's Cathedral, Tokyo" },
  { entityId: "A4C7F5DA-CB8D-3160-5273-51672681D2D7", entity: "Massive Attack",
    via: "trip-hop · nocturnal → contemporary art", to: "MAHO KUBOTA GALLERY" },
  { entityId: "5045FC53-5930-7FB5-23FF-CC4045F9B8FD", entity: "Miles Davis",
    via: "modal jazz · late-night listening → kissaten coffee", to: "MERRY and BRIGHT" },
  { entityId: "49F3E477-B7FA-9EA7-2E5C-699402D11220", entity: "Tame Impala",
    via: "psych-rock · immersive sound → modern art", to: "Mori Art Museum" },
  { entityId: "8EC55726-A3A0-3940-DDF7-37E700B81DA4", entity: "Phoebe Bridgers",
    via: "indie folk · quiet confession → kissaten coffee", to: "MERRY and BRIGHT" },
  { entityId: "2AD2F849-0311-4E13-D4E7-F3828DCADA43", entity: "Khruangbin",
    via: "global groove · thai funk → food markets", to: "Mercado de Medellín" },
  { entityId: "8AD9247E-1CC6-7686-33DC-314970E2B61E", entity: "Arca",
    via: "experimental club · avant-electronic → contemporary art", to: "Galería OMR" },
  { entityId: "09FA4A7C-EAE2-4CA5-9046-A231B8C85EDC", entity: "Fela Kuti",
    via: "afrobeat · communal rhythm → food markets", to: "Mercado de Medellín" },
  { entityId: "524440CC-F5D2-EC7F-7CE4-711AD60ADC6A", entity: "Kendrick Lamar",
    via: "hip-hop · cinematic narrative → contemporary art", to: "Galería OMR" },

  // --- Film
  { entityId: "CCA18F97-716A-0E1A-A974-3A4A1DA02968", entity: "Spirited Away",
    via: "studio ghibli · hand-drawn fantasy → animation museum", to: "Ghibli Museum" },
  { entityId: "7A29E32B-3BAD-8BFC-F8C3-19FA413245D2", entity: "Lost in Translation",
    via: "tokyo cinema · quiet longing → tea houses", to: "Sahsya Kanetanaka" },
  { entityId: "BC14C348-0280-F59A-ADDC-093D89203EA6", entity: "Roma",
    via: "cuarón · mexico city memoir → street markets", to: "Mercado de Medellín" },
  { entityId: "5C8FF731-76DC-E389-6A00-E46D5AB56440", entity: "Y Tu Mamá También",
    via: "mexican cinema · road realism → mezcal bars", to: "La Botica" },
  { entityId: "B5E6FE53-0494-4713-D6A5-794265B522BD", entity: "Parasite",
    via: "korean cinema · class satire → contemporary art", to: "Galería OMR" },

  // --- Books
  { entityId: "9AA51028-601E-DE9F-1A6C-E590348660BB", entity: "Norwegian Wood",
    via: "murakami · tokyo melancholy → kissaten coffee", to: "MERRY and BRIGHT" },
  { entityId: "912DE015-6C60-AE1E-0524-FA5F77CAF55D", entity: "Kitchen",
    via: "yoshimoto · kitchens as grief → japanese cafe", to: "Sahsya Kanetanaka" },
  { entityId: "60EA9E0C-DBB7-3B63-FE95-7EFD7C0F0927", entity: "Invisible Cities",
    via: "calvino · imagined cities → contemporary art", to: "SCAI The Bathhouse" },
  { entityId: "F15D7EE5-2311-31FD-5469-FC02835927BE", entity: "One Hundred Years of Solitude",
    via: "magical realism · latin america → street markets", to: "Mercado de Medellín" },
  { entityId: "8F56E2D5-879A-87B4-DE1E-4A422E919829", entity: "The Remains of the Day",
    via: "restraint · ritual service → tea houses", to: "Sahsya Kanetanaka" },

  // --- Brands
  { entityId: "9E6B7B34-7A97-BA91-9FB6-6C222F69FC59", entity: "Muji",
    via: "japanese minimalism · everyday design → tea houses", to: "Sahsya Kanetanaka" },
  { entityId: "BC7DC501-91AF-64CE-2BA9-5B32BC4847A4", entity: "Lego",
    via: "playful systems · craft → animation museum", to: "Ghibli Museum" },
  { entityId: "3E576932-C721-488D-8ABD-59C4B5D3D184", entity: "Moleskine",
    via: "notebooks · travel writing → kissaten coffee", to: "MERRY and BRIGHT" },
];

/** Lowercase, diacritics stripped — the same matching contract the entity
 *  catalog uses, so "galeria omr" and "Galería OMR" land together. */
const norm = (s: string): string =>
  s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Every bundled sample place → the city its profile belongs to. Derived
 *  from the profiles — the edges can't disagree with the bundle. */
const PLACE_CITY: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const p of SAMPLE_TASTE_CRATES)
    for (const place of p.places) m.set(norm(place.name), p.city);
  return m;
})();

/** entity id → its edges, filtered to chains that actually resolve. */
const INDEX: ReadonlyMap<string, readonly TasteMapEdge[]> = (() => {
  const m = new Map<string, TasteMapEdge[]>();
  for (const e of TASTE_MAP_EDGES) {
    if (!PLACE_CITY.has(norm(e.to))) continue;
    const arr = m.get(e.entityId) ?? [];
    arr.push(e);
    m.set(e.entityId, arr);
  }
  return m;
})();

export interface TasteChain {
  entityId: string;
  entity: string;
  via: string;
  place: string;
  /** The city the place's bundled profile belongs to ("Tokyo", "Mexico
   *  City") — read from the profile, not from the edge. */
  city: string;
}

const toChain = (e: TasteMapEdge): TasteChain => ({
  entityId: e.entityId,
  entity: e.entity,
  via: e.via,
  place: e.to,
  city: PLACE_CITY.get(norm(e.to)) ?? "",
});

/** The chain that lands on this place, for one of the traveller's
 *  favorites — the "why this place?" answer's evidence. First matching
 *  favorite in crate order wins; null when no edge exists (the honest
 *  miss — surfaces fall back, never invent). */
export function tasteChainFor(
  placeName: string,
  favorites: readonly TasteEntity[],
): TasteChain | null {
  const target = norm(placeName);
  if (!target) return null;
  for (const f of favorites) {
    const hit = INDEX.get(f.id)?.find((e) => norm(e.to) === target);
    if (hit) return toChain(hit);
  }
  return null;
}

/** Every chain the trip's favorites carry that lands in the destination —
 *  the "trace" the Scout answer can recite. Empty on a city the bundle
 *  doesn't cover. */
export function chainsForDestination(
  destName: string,
  favorites: readonly TasteEntity[],
): TasteChain[] {
  const dest = norm(destName);
  if (!dest) return [];
  const out: TasteChain[] = [];
  for (const f of favorites) {
    for (const e of INDEX.get(f.id) ?? []) {
      if (norm(PLACE_CITY.get(norm(e.to)) ?? "") === dest) out.push(toChain(e));
    }
  }
  return out;
}

/** The inline trace rendering — `entity → via → place`, one line. */
export function formatTasteChain(c: TasteChain): string {
  return `${c.entity} → ${c.via} → ${c.place}`;
}

/** The trace with its disclosure — what every surface renders. */
export function tasteChainLabel(c: TasteChain): string {
  return `${formatTasteChain(c)} · ${TASTE_MAP_LABEL}`;
}
