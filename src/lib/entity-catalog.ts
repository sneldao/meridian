import type { TasteEntity, TasteType } from "@/domain/taste";

/* The bundled entity catalog (agent-native §4b): ~66 well-known names
 * across the crate's categories — music, film, books, brands — so a
 * traveller can type a favorite at the door without a Qloo key.
 *
 * Honest shape:
 * - The four sample-crate entities carry their real captured ids, so a
 *   typed "björk" resolves to the same entity the Björk pill packs and
 *   `matchSampleProfileForTrip` works unchanged.
 * - Every other id is a catalog-local identifier in the sample-profile
 *   format — NOT a Qloo entity id. A live rung that receives one treats it
 *   like any interest it can't resolve: the ladder falls honestly instead
 *   of pretending affinity data exists.
 * - Matching is by name or declared alias only — case/diacritic
 *   insensitive, exact → prefix → substring — never a fuzzy guess. A name
 *   the catalog doesn't carry is a miss the UI names, not a hallucination.
 */

export interface CatalogEntity {
  id: string;
  name: string;
  aliases: string[];
  category: TasteType;
}

/* Rows are `[id, name, aliases, category]` — the object keys were the
 * literal's biggest cost, so the tuple keeps the catalog under its ~10KB
 * bound. Aliases only where normalization doesn't already cover the name
 * (case and diacritics are free). */
type Row = readonly [id: string, name: string, aliases: readonly string[], category: TasteType];

const ROWS: readonly Row[] = [
  // The sample crates — real captured ids, so typing is the pill.
  ["01381184-B533-4E3C-B9DB-43A2FE326744", "Björk", ["Björk Guðmundsdóttir"], "artist"],
  ["3CBD78B1-D2F2-4551-A342-4621B6BDB5E2", "Luke Combs", [], "artist"],
  ["E5928AFF-6309-427E-8A54-DB4AD5946219", "King Krule", ["Zoo Kid", "Archy Marshall"], "artist"],
  ["AAED2C10-DBA8-438A-90B7-5A16D2051EB0", "Amores Perros", ["Love's a Bitch"], "movie"],

  // Music
  ["03BF30F5-3061-6F2B-CE9A-11E5E72A38EE", "Radiohead", [], "artist"],
  ["8B938404-4F37-DBF5-C7E1-5C794C3C0DB4", "Beyoncé", [], "artist"],
  ["524440CC-F5D2-EC7F-7CE4-711AD60ADC6A", "Kendrick Lamar", ["Kendrick"], "artist"],
  ["366A930B-4002-8D03-B6C1-24042CA3233A", "Taylor Swift", [], "artist"],
  ["C0DB3D57-612B-08E8-74FF-9163739B06A6", "The Beatles", ["Beatles"], "artist"],
  ["1410C968-B3D9-FDC5-E1C7-FF2F203A3227", "Daft Punk", [], "artist"],
  ["5045FC53-5930-7FB5-23FF-CC4045F9B8FD", "Miles Davis", [], "artist"],
  ["A90D1D5E-B216-032C-C688-2966F84996B0", "Frank Ocean", [], "artist"],
  ["49F3E477-B7FA-9EA7-2E5C-699402D11220", "Tame Impala", [], "artist"],
  ["BF09363A-FDD6-6B03-FC94-14E82DD8B7EB", "Nina Simone", [], "artist"],
  ["BC94D721-FCEB-1277-7063-BEF1933D7EF4", "David Bowie", ["Bowie"], "artist"],
  ["2CCC1369-04D6-76AD-6146-7B6E0A865D91", "Talking Heads", [], "artist"],
  ["A4C7F5DA-CB8D-3160-5273-51672681D2D7", "Massive Attack", [], "artist"],
  ["91569815-A14E-8039-6F90-E3CFFF0CFDE7", "Aphex Twin", ["Richard D. James"], "artist"],
  ["7E502D60-BF3A-2C08-A24B-ED336926E116", "Billie Eilish", [], "artist"],
  ["2AD2F849-0311-4E13-D4E7-F3828DCADA43", "Khruangbin", [], "artist"],
  ["660568B3-0C34-A62F-5249-2801C4E04758", "Sigur Rós", [], "artist"],
  ["51FA8B3E-678B-B7FB-746E-1179E841D5C7", "Ryuichi Sakamoto", [], "artist"],
  ["09FA4A7C-EAE2-4CA5-9046-A231B8C85EDC", "Fela Kuti", [], "artist"],
  ["A1CD2215-9B20-224C-73B1-B7D346F6731F", "LCD Soundsystem", [], "artist"],
  ["8EC55726-A3A0-3940-DDF7-37E700B81DA4", "Phoebe Bridgers", [], "artist"],
  ["F7779D04-963F-D343-B19D-C79CC2F76CE9", "The Cure", [], "artist"],
  ["8AD9247E-1CC6-7686-33DC-314970E2B61E", "Arca", [], "artist"],

  // Film
  ["CCA18F97-716A-0E1A-A974-3A4A1DA02968", "Spirited Away", ["Sen to Chihiro no Kamikakushi"], "movie"],
  ["B5E6FE53-0494-4713-D6A5-794265B522BD", "Parasite", ["Gisaengchung"], "movie"],
  ["FFA9CC2E-3950-0C1F-6DB5-A1E97A942364", "Blade Runner", [], "movie"],
  ["28CD24AF-9571-30B4-13D2-8E392E40BA70", "Pulp Fiction", [], "movie"],
  ["1B1209F8-95B8-FD97-81D5-EB8149CC98A6", "In the Mood for Love", ["Fa yeung nin wah"], "movie"],
  ["5C8FF731-76DC-E389-6A00-E46D5AB56440", "Y Tu Mamá También", [], "movie"],
  ["E0B5339A-73B7-0E12-B688-B7300F2C32FF", "City of God", ["Cidade de Deus"], "movie"],
  ["BC14C348-0280-F59A-ADDC-093D89203EA6", "Roma", [], "movie"],
  ["32931E65-CB1B-29EC-0710-EEC8AACE9B1B", "Everything Everywhere All at Once", ["EEAAO"], "movie"],
  ["DCA4A6A7-FC0D-D946-3DB3-F55F9FC697FD", "2001: A Space Odyssey", ["2001"], "movie"],
  ["EAC9B461-CD6F-F0B7-5536-B80104902AA4", "The Godfather", ["Godfather"], "movie"],
  ["7A29E32B-3BAD-8BFC-F8C3-19FA413245D2", "Lost in Translation", [], "movie"],
  ["27DE25E5-5C86-389A-E717-44A10530A632", "Portrait of a Lady on Fire", ["Portrait de la jeune fille en feu"], "movie"],
  ["1A5262CB-E6AC-0D8D-27EE-0DB2C22DA22A", "Drive", [], "movie"],
  ["DD9DED7C-3E0D-852B-B488-74693671B867", "The Grand Budapest Hotel", ["Grand Budapest Hotel"], "movie"],

  // Books
  ["9AA51028-601E-DE9F-1A6C-E590348660BB", "Norwegian Wood", ["Noruwei no Mori"], "book"],
  ["F15D7EE5-2311-31FD-5469-FC02835927BE", "One Hundred Years of Solitude", ["Cien años de soledad"], "book"],
  ["060F77E6-7612-6402-1A1D-E5FAEBA8C481", "Dune", [], "book"],
  ["0811745C-88D6-3A02-5AEA-699D41658ACD", "The Master and Margarita", ["Master and Margarita"], "book"],
  ["4A8B5D7D-81FF-304C-1DCE-FF0F43849C21", "Sapiens", ["Sapiens: A Brief History of Humankind"], "book"],
  ["EA5246B2-393F-8E3C-616B-1C38E2550CC9", "The Name of the Rose", ["Il nome della rosa"], "book"],
  ["8650B032-20B2-A8D5-47CC-D5DF5AEA11EA", "Beloved", [], "book"],
  ["59B5B22D-3180-E515-D785-E993F46013E7", "The Left Hand of Darkness", [], "book"],
  ["D3E9B41A-4371-C546-D7EA-713DFD6A75D3", "Klara and the Sun", [], "book"],
  ["8F56E2D5-879A-87B4-DE1E-4A422E919829", "The Remains of the Day", [], "book"],
  ["60EA9E0C-DBB7-3B63-FE95-7EFD7C0F0927", "Invisible Cities", ["Le città invisibili"], "book"],
  ["912DE015-6C60-AE1E-0524-FA5F77CAF55D", "Kitchen", ["Kitchen by Banana Yoshimoto"], "book"],
  ["7374E2E2-C451-0CA3-4D18-FFB19C02D822", "A Gentleman in Moscow", ["Gentleman in Moscow"], "book"],

  // Brands
  ["9E6B7B34-7A97-BA91-9FB6-6C222F69FC59", "Muji", ["Mujirushi Ryohin"], "brand"],
  ["87491932-8D95-D190-952B-F6413FAAE7D6", "Aesop", [], "brand"],
  ["2640C10C-6B27-BAE6-1057-170330A60CF5", "Patagonia", [], "brand"],
  ["BC7DC501-91AF-64CE-2BA9-5B32BC4847A4", "Lego", [], "brand"],
  ["3E576932-C721-488D-8ABD-59C4B5D3D184", "Moleskine", [], "brand"],
  ["7554A6B0-3B62-AB90-60DF-7AF69B42A29E", "Rapha", [], "brand"],
  ["DA51F7C8-B405-76EE-EDDE-F303A7D2867D", "Bang & Olufsen", ["Bang and Olufsen", "B&O"], "brand"],
  ["4CB09C87-8D36-5927-9CE5-EABCD64E8F34", "Hay", [], "brand"],
  ["7DEAD446-FB74-07A9-29D4-E5500D2F45A1", "Uniqlo", [], "brand"],
  ["A575E710-3520-8088-506B-36E959C92A1D", "Rimowa", [], "brand"],
];

export const ENTITY_CATALOG: readonly CatalogEntity[] = ROWS.map(
  ([id, name, aliases, category]) => ({ id, name, aliases: [...aliases], category }),
);

/** Lowercase, diacritics stripped, whitespace collapsed — "bjork", "BJÖRK"
 *  and "  björk " all land on the same key. */
function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const INDEX: readonly { entity: CatalogEntity; keys: string[] }[] =
  ENTITY_CATALOG.map((entity) => ({
    entity,
    keys: [entity.name, ...entity.aliases].map(normalizeName),
  }));

/* Ranked like searchAirports: exact name/alias first, then a prefix of a
 * name or alias, then a substring inside one (only once the query is long
 * enough to mean something). */
function rankOf(keys: string[], q: string): number {
  let best = -1;
  for (const k of keys) {
    if (k === q) return 0;
    if (k.startsWith(q)) {
      if (best < 0) best = 1;
    } else if (q.length >= 3 && k.includes(q)) {
      if (best < 0) best = 2;
    }
  }
  return best;
}

/** The top matches for a query, best rank first then shortest name — the
 *  dropdown's candidates. Empty on a blank query or a real miss. */
export function suggestEntities(query: string, limit = 6): TasteEntity[] {
  const q = normalizeName(query);
  if (!q) return [];
  const scored: { e: CatalogEntity; rank: number }[] = [];
  for (const { entity, keys } of INDEX) {
    const rank = rankOf(keys, q);
    if (rank >= 0) scored.push({ e: entity, rank });
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.e.name.length - b.e.name.length ||
      a.e.name.localeCompare(b.e.name),
  );
  return scored.slice(0, limit).map((s) => ({
    id: s.e.id,
    name: s.e.name,
    type: s.e.category,
  }));
}

/** The single best answer for a name — the entity the traveler meant, or
 *  null when the catalog honestly doesn't carry it. */
export function matchEntity(query: string): TasteEntity | null {
  return suggestEntities(query, 1)[0] ?? null;
}

/** The honest line for a miss — the catalog names itself and what a live
 *  key would have done, instead of silently adding nothing. */
export const ENTITY_CATALOG_MISS =
  "No match in the local catalog — a live Qloo lookup would resolve this";
