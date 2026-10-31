import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { TasteDiscovery, tasteResultLabel } from "../src/components/TasteDiscovery";
import type { TasteResponse } from "../src/domain/taste";

const dest = { name: "Lisbon", lon: -9.14, lat: 38.72 };

describe("TasteDiscovery (SSR)", () => {
  test("enabled with generic places labels them destination picks, never personalized", () => {
    const initial: TasteResponse = {
      enabled: true,
      destination: "Lisbon",
      places: [
        { name: "Café & Bar <x>", categories: ["coffee", "bar", "late"] },
        { name: "Miradouro", categories: [] },
      ],
    };
    const html = renderToStaticMarkup(
      createElement(TasteDiscovery, { destination: dest, initialTaste: initial }),
    );
    expect(html).toContain("Find your kind of Lisbon.");
    expect(html).toContain("Powered by Qloo");
    expect(html).toContain("Destination picks · not personalized yet");
    expect(html).not.toContain("Taste signals:");
    expect(html).toContain("A few places to start");
    expect(html).toContain("Café &amp; Bar &lt;x&gt;");
    expect(html).toContain("coffee · bar");
    expect(html).not.toContain("late");
    expect(html).toContain("google.com/maps/search");
    expect(html).toContain("target=\"_blank\"");
    expect(html).toContain("noopener");
    for (const bad of ["match score", "reviews", "outdoor", "suitable for", "open now"]) {
      expect(html.toLowerCase()).not.toContain(bad);
    }
    expect(html).toContain("Category");
    expect(html).toContain("An artist, film, book or brand you love");
    expect(html).toContain("<select");
    expect(html).toContain("Find my places");
    expect(html).toContain("aria-live");
  });

  test("disabled response shows the calm offline message and disables controls", () => {
    const html = renderToStaticMarkup(
      createElement(TasteDiscovery, {
        destination: dest,
        initialTaste: { enabled: false, destination: null, places: [] },
      }),
    );
    expect(html).toContain("Place discovery isn’t connected right now. Your trip plan still works.");
    expect(html).toContain("disabled");
    expect(html).not.toContain("A few places to start");
    expect(html).not.toContain("Searching");
  });

  test("null initial shows loading note without claiming results", () => {
    const html = renderToStaticMarkup(
      createElement(TasteDiscovery, { destination: dest, initialTaste: null }),
    );
    expect(html).toContain("Destination picks are loading. You can start with a favorite.");
    expect(html).not.toContain("A few places to start");
  });

  test("fetch-failure note invites retry via favorites, not a dead end", () => {
    const html = renderToStaticMarkup(
      createElement(TasteDiscovery, {
        destination: dest,
        initialTaste: { enabled: true, destination: "Lisbon", places: [], note: "unavailable" },
      }),
    );
    expect(html).toContain("unavailable");
    expect(html).toContain("Try again");
  });

  test("empty enabled result is honest", () => {
    const html = renderToStaticMarkup(
      createElement(TasteDiscovery, {
        destination: dest,
        initialTaste: { enabled: true, destination: "Lisbon", places: [] },
      }),
    );
    expect(html).toContain("No places found yet. Try another favorite.");
  });
});

describe("tasteResultLabel", () => {
  test("reflects only provided seeds", () => {
    expect(tasteResultLabel([])).toBe("Destination picks · not personalized yet");
    expect(
      tasteResultLabel([
        { id: "1", name: "Björk", type: "artist" },
        { id: "2", name: "Past Lives", type: "movie" },
      ]),
    ).toBe("Taste signals: Björk, Past Lives");
  });
});
