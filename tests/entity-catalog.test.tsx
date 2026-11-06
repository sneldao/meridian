import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { readFileSync, statSync } from "fs";
import { join } from "path";
import {
  ENTITY_CATALOG,
  ENTITY_CATALOG_MISS,
  matchEntity,
  suggestEntities,
} from "../src/lib/entity-catalog";
import { matchSampleProfileForTrip, sampleTasteProfile } from "../src/lib/sample-taste";
import { TASTE_ID_RE, isTasteType, parseTasteFavorites } from "../src/domain/taste";
import { TripEntryScreen } from "../src/components/TripEntryScreen";

/* The bundled entity catalog (agent-native §4b) — free-text favorites
 * without a Qloo key. The pins: honest matching (name/alias only, never
 * fuzzy), sample-crate ids so the recorded path works unchanged, the
 * ~10KB bound, and the crate field's combobox a11y contract. */

describe("the catalog itself", () => {
  test("stays inside its bounds: 40–80 entities under ~10KB", () => {
    expect(ENTITY_CATALOG.length).toBeGreaterThanOrEqual(40);
    expect(ENTITY_CATALOG.length).toBeLessThanOrEqual(80);
    const bytes = statSync(join(import.meta.dir, "..", "src", "lib", "entity-catalog.ts")).size;
    expect(bytes).toBeLessThanOrEqual(10 * 1024);
  });

  test("every entry is a valid favorite — wire-format ids, known categories, no dupes", () => {
    const ids = new Set<string>();
    const names = new Set<string>();
    for (const e of ENTITY_CATALOG) {
      expect(e.id).toMatch(TASTE_ID_RE);
      expect(e.name.trim().length).toBeGreaterThan(0);
      expect(isTasteType(e.category)).toBe(true);
      expect(Array.isArray(e.aliases)).toBe(true);
      expect(ids.has(e.id)).toBe(false);
      ids.add(e.id);
      const key = e.name.toLowerCase();
      expect(names.has(key)).toBe(false);
      names.add(key);
    }
    // The whole catalog would survive a write to the taste wire.
    expect(
      parseTasteFavorites(
        JSON.stringify(
          ENTITY_CATALOG.slice(0, 3).map((e) => ({ id: e.id, name: e.name, type: e.category })),
        ),
      ),
    ).toHaveLength(3);
  });

  test("the four sample-crate entities carry the captured ids", () => {
    for (const key of ["bjork", "luke", "diego"] as const) {
      for (const f of sampleTasteProfile(key)!.favorites) {
        const found = matchEntity(f.name);
        expect(found, `typed "${f.name}" should resolve to the crate entity`).not.toBeNull();
        expect(found!.id).toBe(f.id);
        expect(found!.type).toBe(f.type);
      }
    }
  });

  test("a typed crate still feeds the recorded path — matchSampleProfileForTrip unchanged", () => {
    const diego = sampleTasteProfile("diego")!;
    const typed = diego.favorites.map((f) => matchEntity(f.name)!);
    expect(matchSampleProfileForTrip(diego.city, typed)?.key).toBe("diego");
    // Typed favorites ride alongside a packed crate — ⊆, not equality.
    const withExtra = [...typed, matchEntity("Radiohead")!];
    expect(matchSampleProfileForTrip(diego.city, withExtra)?.key).toBe("diego");
  });
});

describe("matchEntity — exact/alias, case and diacritics free", () => {
  test("exact name match in any case", () => {
    expect(matchEntity("radiohead")?.name).toBe("Radiohead");
    expect(matchEntity("RADIOHEAD")?.name).toBe("Radiohead");
    expect(matchEntity("  radiohead  ")?.name).toBe("Radiohead");
  });

  test("diacritics are free both ways", () => {
    expect(matchEntity("bjork")?.name).toBe("Björk");
    expect(matchEntity("BJÖRK")?.name).toBe("Björk");
    expect(matchEntity("y tu mama tambien")?.name).toBe("Y Tu Mamá También");
    expect(matchEntity("sigur ros")?.name).toBe("Sigur Rós");
  });

  test("declared aliases resolve to the canonical name", () => {
    expect(matchEntity("zoo kid")?.name).toBe("King Krule");
    expect(matchEntity("EEAAO")?.name).toBe("Everything Everywhere All at Once");
    expect(matchEntity("B&O")?.name).toBe("Bang & Olufsen");
    expect(matchEntity("gisaengchung")?.name).toBe("Parasite");
  });

  test("prefix and substring land the intended entity", () => {
    expect(matchEntity("radiohea")?.name).toBe("Radiohead");
    expect(matchEntity("amores")?.name).toBe("Amores Perros");
    expect(matchEntity("mood for love")?.name).toBe("In the Mood for Love");
  });

  test("a name the catalog doesn't carry is a miss — never a guess", () => {
    for (const q of ["qwerty xz", "some unknown artist 2049", "nø-nåme"]) {
      expect(matchEntity(q), q).toBeNull();
    }
    // A blank query is a miss too — the field asks before it answers.
    expect(matchEntity("")).toBeNull();
    expect(matchEntity("   ")).toBeNull();
  });
});

describe("suggestEntities — the dropdown's ranked six", () => {
  test("returns at most the limit, best rank first", () => {
    expect(suggestEntities("radiohead").map((s) => s.name)).toEqual(["Radiohead"]);
    const s = suggestEntities("the");
    expect(s.length).toBeLessThanOrEqual(6);
    // Exact/prefix matches outrank substring matches.
    expect(s.map((x) => x.name)).toContain("The Beatles");
    expect(s[0].name.startsWith("The")).toBe(true);
  });

  test("prefix beats substring, shorter names lead a tie", () => {
    const s = suggestEntities("roma");
    expect(s[0].name).toBe("Roma"); // exact name match ranks first
    const m = suggestEntities("love");
    // "Love's a Bitch" is an Amores Perros alias — substring rank, still surfaced.
    expect(m.some((x) => x.name === "Amores Perros" || x.name === "In the Mood for Love")).toBe(true);
  });

  test("suggestions are TasteEntity-shaped — id, name, type only", () => {
    for (const s of suggestEntities("a", 6)) {
      expect(Object.keys(s).sort()).toEqual(["id", "name", "type"]);
      expect(s.id).toMatch(TASTE_ID_RE);
      expect(isTasteType(s.type)).toBe(true);
    }
  });
});

describe("the crate field (SSR) — combobox a11y contract", () => {
  const html = renderToStaticMarkup(
    createElement(TripEntryScreen, {
      initialDate: "2026-11-04",
      onContinue: () => {},
      onExploreExample: () => {},
    }),
  );

  test("the typed-favorite input is a labelled combobox, closed at rest", () => {
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Type a favorite for your crate"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-autocomplete="list"');
    expect(html).toContain("or type a favorite");
    // The listbox mounts only while it has options to offer.
    expect(html).not.toContain("entry-crate-listbox");
    expect(html).not.toContain("aria-activedescendant");
  });

  test("the crate pills stay one-tap seeds, unpressed at rest", () => {
    expect(html).toContain("Pack a taste crate · optional");
    for (const label of ["Diego&#x27;s crate", "Björk", "Luke Combs"]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain('aria-pressed="true"');
  });

  test("the honest miss line exists as copy, not a silent state", () => {
    // The miss is a named outcome — the exact words a traveller reads.
    expect(ENTITY_CATALOG_MISS).toBe(
      "No match in the local catalog — a live Qloo lookup would resolve this",
    );
    expect(readFileSync(join(import.meta.dir, "..", "src", "components", "TripEntryScreen.tsx"), "utf8")).toContain(
      "entry-crate-miss",
    );
  });
});
